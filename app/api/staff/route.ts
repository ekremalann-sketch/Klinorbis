import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { staffAccounts, unitMemberships } from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import { HOSPITAL_UNITS } from "../../../lib/hospital-units";
import {
  assertBrowserMutation,
  assertJsonRequest,
  cleanText,
  enforceRateLimit,
  requireActor,
  SecurityError,
  securityResponse,
  type RequestActor,
} from "../../../lib/security";
import { normalizeEmail, parseMemberships, parseRole, ROLE_MAP } from "../../../lib/staff";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store, private" };

function requireManager(actor: RequestActor) {
  if (actor.role !== "operations_manager") throw new SecurityError(403, "Personel ve yetkiyi yalnız operasyon yöneticisi yönetir.", "STAFF_ADMIN_REQUIRED");
}

async function listStaff() {
  const db = getDb();
  const [accounts, memberships] = await Promise.all([
    db.select().from(staffAccounts).orderBy(asc(staffAccounts.displayLabel)),
    db.select().from(unitMemberships).where(eq(unitMemberships.active, true)),
  ]);
  return accounts.map((account) => ({
    email: account.email,
    displayLabel: account.displayLabel,
    systemRole: account.systemRole,
    active: account.active,
    lastSeenAt: account.lastSeenAt,
    memberships: memberships.filter((m) => m.email === account.email).map((m) => ({ unitCode: m.unitCode, unitRole: m.unitRole, canManageTickets: m.canManageTickets, canReadCalls: m.canReadCalls })),
  }));
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "staff.read", 120, 60);
    // Rol haritası herkese açıktır (kendi işini görmek için); personel listesi yalnız yöneticiye.
    const staff = actor.role === "operations_manager" ? await listStaff() : [];
    return Response.json({
      me: { email: actor.email, role: actor.role, unitCodes: actor.unitCodes },
      roles: ROLE_MAP,
      units: HOSPITAL_UNITS.map((u) => ({ code: u.code, name: u.name, assignedRole: u.assignedRole })),
      staff,
    }, { headers: noStore });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireManager(actor);
    await enforceRateLimit(request, actor, "staff.write", 30, 60);
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();
    const email = normalizeEmail(payload.email);
    const self = email === actor.email;

    if (payload.action === "save") {
      const role = parseRole(payload.systemRole);
      if (self && role !== "operations_manager") throw new SecurityError(409, "Kendi yönetici rolünüzü düşüremezsiniz; başka bir yönetici yapmalı.", "SELF_DEMOTION");
      const displayLabel = cleanText(payload.displayLabel, "Görünen ad", 2, 80);
      const memberships = parseMemberships(role, payload.memberships);
      const [before] = await db.select().from(staffAccounts).where(eq(staffAccounts.email, email)).limit(1);
      // Hesap ve üyelikler tek toplu işlemde yazılır: yarım kalmış yetki oluşmaz.
      await db.batch([
        db.insert(staffAccounts).values({ email, displayLabel, systemRole: role, active: true })
          .onConflictDoUpdate({ target: staffAccounts.email, set: { displayLabel, systemRole: role, active: true } }),
        db.update(unitMemberships).set({ active: false }).where(eq(unitMemberships.email, email)),
        ...memberships.map((m) => db.insert(unitMemberships).values({ email, ...m, active: true })
          .onConflictDoUpdate({ target: [unitMemberships.email, unitMemberships.unitCode], set: { unitRole: m.unitRole, canManageTickets: m.canManageTickets, canReadCalls: m.canReadCalls, active: true } })),
      ]);
      await appendAudit(db, {
        actor: actor.email,
        action: before ? "staff.update" : "staff.create",
        resource: `staff:${email}`,
        detail: `${before ? `${before.systemRole} → ` : ""}${role}; birimler: ${memberships.map((m) => m.unitCode).join(",") || "tüm ağ"}`,
      });
      return Response.json({ ok: true, staff: await listStaff() }, { status: before ? 200 : 201, headers: noStore });
    }

    if (payload.action === "deactivate") {
      if (self) throw new SecurityError(409, "Kendi hesabınızı pasife alamazsınız.", "SELF_DEACTIVATION");
      const updated = await db.update(staffAccounts).set({ active: false })
        .where(and(eq(staffAccounts.email, email), eq(staffAccounts.active, true))).returning({ email: staffAccounts.email });
      if (!updated.length) return Response.json({ error: "Etkin personel bulunamadı.", code: "NOT_FOUND" }, { status: 404, headers: noStore });
      await db.update(unitMemberships).set({ active: false }).where(eq(unitMemberships.email, email));
      await appendAudit(db, { actor: actor.email, action: "staff.deactivate", resource: `staff:${email}`, detail: "Hesap ve birim üyelikleri pasife alındı." });
      return Response.json({ ok: true, staff: await listStaff() }, { headers: noStore });
    }

    return Response.json({ error: "Bilinmeyen işlem.", code: "INVALID_ACTION" }, { status: 400, headers: noStore });
  } catch (error) {
    return securityResponse(error, request);
  }
}
