import { and, desc, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { operationalTasks, shiftHandoffs, staffAccounts, ticketEvents, tickets, unitMemberships } from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import { redactPII } from "../../../lib/privacy";
import {
  assertBrowserMutation,
  assertJsonRequest,
  enforceRateLimit,
  requireActor,
  requireUnitAccess,
  SecurityError,
  securityResponse,
  type RequestActor,
} from "../../../lib/security";
import { HANDOFF_ROLES, normalizeEmail } from "../../../lib/staff";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store, private" };
const CLOSED_TICKET = "Çözüldü";
const CLOSED_TASKS = ["completed", "cancelled", "failed"];

// Devir kuralları
// - Devri yalnız birimde iş taşıyan roller başlatır (birim sorumlusu, klinik rol, çağrı görevlisi).
// - Devralan kişi aynı birimde etkin üyeliği olan, etkin bir personel olmalıdır; kendine devir yok.
// - Kabul edilince giden kişinin o birimdeki açık talep ve görevleri devralana geçer (tek toplu işlem).
// - Gözetim rolleri (KVKK, güvenlik) devir yapmaz; operasyon yöneticisi izler ve bekleyen devri iptal edebilir.

async function openWork(email: string, unitCode: string) {
  const db = getDb();
  const [t, k] = await Promise.all([
    db.select({ reference: tickets.reference }).from(tickets).where(and(eq(tickets.acceptedBy, email), eq(tickets.unitCode, unitCode), ne(tickets.status, CLOSED_TICKET))),
    db.select({ reference: operationalTasks.reference }).from(operationalTasks).where(and(eq(operationalTasks.unitCode, unitCode), notInArray(operationalTasks.status, CLOSED_TASKS), or(eq(operationalTasks.acceptedBy, email), eq(operationalTasks.assignedUser, email)))),
  ]);
  return { tickets: t.map((r) => r.reference), tasks: k.map((r) => r.reference) };
}

async function visibleHandoffs(actor: RequestActor) {
  const db = getDb();
  if (actor.canSeeAllUnits) return db.select().from(shiftHandoffs).orderBy(desc(shiftHandoffs.createdAt)).limit(100);
  if (!actor.unitCodes.length) return [];
  return db.select().from(shiftHandoffs).where(inArray(shiftHandoffs.unitCode, actor.unitCodes)).orderBy(desc(shiftHandoffs.createdAt)).limit(100);
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "shifts.read", 180, 60);
    const db = getDb();
    const handoffs = await visibleHandoffs(actor);
    // Devralabilecek kişiler: kendi birimlerimde etkin üyeliği olan diğer etkin personel.
    const colleagues = actor.unitCodes.length
      ? (await db.select({ email: unitMemberships.email, unitCode: unitMemberships.unitCode, label: staffAccounts.displayLabel, role: staffAccounts.systemRole })
          .from(unitMemberships).innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
          .where(and(inArray(unitMemberships.unitCode, actor.unitCodes), eq(unitMemberships.active, true), eq(staffAccounts.active, true), ne(unitMemberships.email, actor.email))))
      : [];
    const mine = await Promise.all(actor.unitCodes.map(async (unitCode) => ({ unitCode, ...(await openWork(actor.email, unitCode)) })));
    return Response.json({
      me: { email: actor.email, role: actor.role, canHandoff: HANDOFF_ROLES.has(actor.role) },
      handoffs, colleagues: colleagues.filter((c) => HANDOFF_ROLES.has(c.role as never)), openWork: mine,
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
    await enforceRateLimit(request, actor, "shifts.change", 30, 60);
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();
    const now = new Date();

    if (payload.action === "start") {
      if (!HANDOFF_ROLES.has(actor.role)) throw new SecurityError(403, "Vardiya devrini birimde görev taşıyan personel başlatır.", "HANDOFF_ROLE_REQUIRED");
      const unitCode = typeof payload.unitCode === "string" ? payload.unitCode : "";
      if (!actor.unitCodes.includes(unitCode)) throw new SecurityError(403, "Yalnız kendi biriminizde devir başlatabilirsiniz.", "UNIT_ACCESS_DENIED");
      const toEmail = normalizeEmail(payload.toEmail);
      if (toEmail === actor.email) throw new SecurityError(400, "Kendinize devir yapamazsınız.", "INVALID_INPUT");
      const [target] = await db.select({ role: staffAccounts.systemRole }).from(unitMemberships)
        .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
        .where(and(eq(unitMemberships.email, toEmail), eq(unitMemberships.unitCode, unitCode), eq(unitMemberships.active, true), eq(staffAccounts.active, true))).limit(1);
      if (!target || !HANDOFF_ROLES.has(target.role as never)) throw new SecurityError(400, "Devralan kişi bu birimde etkin görevli olmalı.", "HANDOFF_TARGET_INVALID");
      const rawNote = typeof payload.note === "string" ? payload.note.normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 1000) : "";
      const note = redactPII(rawNote).maskedText; // devir notuna TCKN/telefon/e-posta girmez
      const work = await openWork(actor.email, unitCode);
      try {
        const [created] = await db.insert(shiftHandoffs).values({ unitCode, fromEmail: actor.email, toEmail, note, openTickets: work.tickets.length, openTasks: work.tasks.length, createdAt: now }).returning();
        await appendAudit(db, { actor: actor.email, action: "shift.handoff.start", resource: `handoff:${created.id}`, detail: `${unitCode}: ${actor.email} → ${toEmail}; açık talep ${work.tickets.length}, görev ${work.tasks.length}` });
        return Response.json({ ok: true, handoff: created }, { status: 201, headers: noStore });
      } catch (error) {
        if (/UNIQUE|constraint/i.test(String((error as { cause?: unknown })?.cause ?? error))) {
          return Response.json({ error: "Bu birimde bekleyen bir devriniz zaten var.", code: "HANDOFF_PENDING" }, { status: 409, headers: noStore });
        }
        throw error;
      }
    }

    const id = typeof payload.id === "number" && Number.isInteger(payload.id) ? payload.id : NaN;
    const [handoff] = Number.isFinite(id) ? await db.select().from(shiftHandoffs).where(eq(shiftHandoffs.id, id)).limit(1) : [];
    if (!handoff) return Response.json({ error: "Devir bulunamadı.", code: "NOT_FOUND" }, { status: 404, headers: noStore });
    requireUnitAccess(actor, handoff.unitCode);
    if (handoff.status !== "pending") return Response.json({ error: "Bu devir zaten sonuçlandı.", code: "HANDOFF_CLOSED" }, { status: 409, headers: noStore });

    const decide = async (status: "accepted" | "declined" | "cancelled", extra: Partial<typeof shiftHandoffs.$inferInsert> = {}) => {
      // Koşullu güncelleme: eşzamanlı kabul/ret/iptalden yalnız biri kazanır.
      const updated = await db.update(shiftHandoffs).set({ status, decidedAt: now, decidedBy: actor.email, ...extra })
        .where(and(eq(shiftHandoffs.id, handoff.id), eq(shiftHandoffs.status, "pending"))).returning({ id: shiftHandoffs.id });
      return updated.length > 0;
    };

    if (payload.action === "accept") {
      if (actor.email !== handoff.toEmail) throw new SecurityError(403, "Devri yalnız devralan kişi kabul eder.", "HANDOFF_NOT_RECIPIENT");
      const work = await openWork(handoff.fromEmail, handoff.unitCode);
      if (!await decide("accepted", { movedTickets: work.tickets.length, movedTasks: work.tasks.length })) {
        return Response.json({ error: "Bu devir zaten sonuçlandı.", code: "HANDOFF_CLOSED" }, { status: 409, headers: noStore });
      }
      const detail = `Vardiya devri #${handoff.id}: ${handoff.fromEmail} → ${handoff.toEmail}`;
      await db.batch([
        db.update(tickets).set({ acceptedBy: handoff.toEmail, acceptedAt: now, updatedAt: now })
          .where(and(eq(tickets.acceptedBy, handoff.fromEmail), eq(tickets.unitCode, handoff.unitCode), ne(tickets.status, CLOSED_TICKET))),
        db.update(operationalTasks).set({ acceptedBy: handoff.toEmail, assignedUser: handoff.toEmail, updatedAt: now })
          .where(and(eq(operationalTasks.unitCode, handoff.unitCode), notInArray(operationalTasks.status, CLOSED_TASKS), or(eq(operationalTasks.acceptedBy, handoff.fromEmail), eq(operationalTasks.assignedUser, handoff.fromEmail)))),
        ...work.tickets.map((reference) => db.insert(ticketEvents).values({ ticketReference: reference, eventType: "shift_handoff", actor: actor.email, fromUnitCode: handoff.unitCode, toUnitCode: handoff.unitCode, detail, createdAt: now })),
      ]);
      await appendAudit(db, { actor: actor.email, action: "shift.handoff.accept", resource: `handoff:${handoff.id}`, detail: `${detail}; taşınan talep ${work.tickets.length}, görev ${work.tasks.length}` });
      return Response.json({ ok: true, moved: { tickets: work.tickets.length, tasks: work.tasks.length } }, { headers: noStore });
    }

    if (payload.action === "decline" || payload.action === "cancel") {
      const allowed = payload.action === "decline" ? actor.email === handoff.toEmail : actor.email === handoff.fromEmail || actor.role === "operations_manager";
      if (!allowed) throw new SecurityError(403, payload.action === "decline" ? "Devri yalnız devralan kişi reddeder." : "Devri yalnız başlatan kişi veya operasyon yöneticisi iptal eder.", "HANDOFF_FORBIDDEN");
      const status = payload.action === "decline" ? "declined" : "cancelled";
      if (!await decide(status)) return Response.json({ error: "Bu devir zaten sonuçlandı.", code: "HANDOFF_CLOSED" }, { status: 409, headers: noStore });
      await appendAudit(db, { actor: actor.email, action: `shift.handoff.${payload.action}`, resource: `handoff:${handoff.id}`, detail: `${handoff.unitCode}: ${handoff.fromEmail} → ${handoff.toEmail}` });
      return Response.json({ ok: true }, { headers: noStore });
    }

    return Response.json({ error: "Bilinmeyen işlem.", code: "INVALID_ACTION" }, { status: 400, headers: noStore });
  } catch (error) {
    return securityResponse(error, request);
  }
}
