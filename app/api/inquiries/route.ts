import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { institutionInquiries } from "../../../db/schema";
import { auditStatements } from "../../../lib/audit";
import { notificationStatements, roleRecipients } from "../../../lib/notifications";
import { assertBrowserMutation, assertJsonRequest, cleanText, enforceAnonymousRateLimit, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";
const TYPES = ["Özel hastane", "Devlet hastanesi", "Şehir hastanesi", "Üniversite hastanesi", "Tıp merkezi / poliklinik", "Hastane grubu", "Diğer"];
const RETENTION_DAYS = 180;
const opt = (v: unknown, field: string, max: number) => (typeof v === "string" && v.trim() ? cleanText(v, field, 1, max) : null);

// Herkese açık kurumsal görüşme formu.
// POST (anonim)  → talep kaydı. IP başına saatte 5; gizli bal küpü alanı dolu gelirse sessizce yok sayılır.
// GET  (operasyon yöneticisi) → talepler;  PATCH { reference } → "görüşüldü" işareti.
export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new SecurityError(403, "Başka kökenden gelen istek engellendi.", "CSRF_BLOCKED");
    await enforceAnonymousRateLimit(request, "inquiry", 5, 3600);
    let b: Record<string, unknown>;
    try { b = await request.json() as Record<string, unknown>; } catch { throw new SecurityError(400, "Geçersiz istek.", "INVALID_JSON"); }
    if (typeof b.website === "string" && b.website) return Response.json({ ok: true, reference: "KB-ALINDI" });
    if (b.consent !== true) throw new SecurityError(400, "Aydınlatma metnini okuduğunuzu onaylayın.", "CONSENT_REQUIRED");
    const email = cleanText(b.email, "E-posta", 5, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new SecurityError(400, "Geçerli bir kurumsal e-posta girin.", "INVALID_INPUT");
    const type = typeof b.institutionType === "string" && TYPES.includes(b.institutionType) ? b.institutionType : null;
    if (!type) throw new SecurityError(400, "Kurum türünü seçin.", "INVALID_INPUT");
    const phone = opt(b.phone, "Telefon", 20);
    if (phone && !/^[+0-9 ()-]{7,20}$/.test(phone)) throw new SecurityError(400, "Telefon numarası geçersiz.", "INVALID_INPUT");
    const now = new Date();
    const reference = `KB-${now.toISOString().slice(2, 10).replace(/-/g, "")}-${[...crypto.getRandomValues(new Uint8Array(3))].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const institution = cleanText(b.institution, "Kurum adı", 2, 120);
    const db = getDb();
    await db.batch([
      // Saklama süresi dolan eski talepler her yeni kayıtta temizlenir.
      db.delete(institutionInquiries).where(lt(institutionInquiries.createdAt, new Date(now.getTime() - RETENTION_DAYS * 86_400_000))),
      db.insert(institutionInquiries).values({ reference, institution, contactName: cleanText(b.contactName, "Ad soyad", 2, 80), title: opt(b.title, "Unvan", 80), email, phone, institutionType: type, bedCount: opt(b.bedCount, "Yatak sayısı", 20), message: opt(b.message, "Mesaj", 1500), createdAt: now }),
      ...notificationStatements(db, await roleRecipients(db, "operations_manager"), { kind: "info", title: "Yeni kurumsal görüşme talebi", detail: `${institution} · ${type}`, path: "/kurumsal-talepler", key: `inquiry:${reference}` }, now),
    ] as Parameters<typeof db.batch>[0]);
    return Response.json({ ok: true, reference }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.role !== "operations_manager") throw new SecurityError(403, "Kurumsal talepleri operasyon yöneticisi görür.", "ROLE_REQUIRED");
    await enforceRateLimit(request, actor, "inquiry.read", 60, 60);
    const rows = await getDb().select().from(institutionInquiries).orderBy(desc(institutionInquiries.createdAt)).limit(200);
    return Response.json({ inquiries: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime(), handledAt: r.handledAt?.getTime() ?? null })) }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function PATCH(request: Request) {
  try {
    assertJsonRequest(request, 512);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    if (actor.role !== "operations_manager") throw new SecurityError(403, "Kurumsal talepleri operasyon yöneticisi işler.", "ROLE_REQUIRED");
    await enforceRateLimit(request, actor, "inquiry.write", 30, 60);
    const b = await request.json() as { reference?: unknown };
    const reference = typeof b.reference === "string" ? b.reference.slice(0, 30) : "";
    const db = getDb();
    const now = new Date();
    const res = await db.update(institutionInquiries).set({ status: "handled", handledBy: actor.email, handledAt: now }).where(and(eq(institutionInquiries.reference, reference), eq(institutionInquiries.status, "new"))).returning({ reference: institutionInquiries.reference });
    if (!res.length) throw new SecurityError(409, "Talep bulunamadı veya zaten işlendi.", "INQUIRY_STATE");
    await db.batch((await auditStatements(db, [{ actor: actor.email, action: "inquiry.handled", resource: reference }])) as unknown as Parameters<typeof db.batch>[0]);
    return Response.json({ ok: true });
  } catch (error) {
    return securityResponse(error, request);
  }
}
