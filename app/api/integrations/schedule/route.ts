import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appointments, integrationEvents, physicians } from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { HOSPITAL_UNITS } from "../../../../lib/hospital-units";
import { CHANNELS, type ChannelCode } from "../../../../lib/patient-access";
import { validPatientAlias } from "../../../../lib/privacy";
import { getWebhookSecret, recordSecurityEvent, securityResponse, sha256 } from "../../../../lib/security";
import { verifyPbxSignature } from "../../../../lib/webhook-signature";

export const dynamic = "force-dynamic";

// HBYS / MHRS takvim aktarımı (imzalı, v2). Hekim ve randevu satırlarını gerçek kayıt (training=false) olarak yazar.
// Gövde kimlik bilgisi taşımaz: hasta takma adı (protokol eşlemesi HBYS'de kalır), maskeli iletişim ve izinli kanallar.
// { "physicians": [{ code, displayLabel, unitCode, facilityCode, dailyCapacity }],
//   "appointments": [{ reference, patientAlias, physicianCode, startsAt, status?, clinicalPriority?, allowOtherPhysician?, preferredChannel?, consentChannels?, contactMasked? }] }
// Aynı referans tekrar gelirse güncellenir; yokluk akışında olan randevunun durumu HBYS tarafından ezilmez.
const MAX_ROWS = 500;
const STATUSES = new Set(["scheduled", "confirmed", "cancelled", "completed", "no_show"]);
const OUTBOUND = new Set(CHANNELS.filter((c) => c.outbound).map((c) => c.code));
const code = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);

export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret();
    if (!secret) return Response.json({ error: "Takvim entegrasyonu yapılandırılmadı.", code: "INTEGRATION_DISABLED" }, { status: 503 });
    if (Number(request.headers.get("content-length") || 0) > 512_000) return Response.json({ error: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const timestamp = request.headers.get("x-klinorbis-timestamp") || "";
    const signature = request.headers.get("x-klinorbis-signature") || "";
    const eventId = request.headers.get("x-klinorbis-event-id") || "";
    if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) {
      await recordSecurityEvent(request, "schedule_webhook_rejected", "high", "hbys", "Eksik başlık veya zaman penceresi dışında");
      return Response.json({ error: "Webhook doğrulaması başarısız.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const rawBody = await request.text();
    if(new TextEncoder().encode(rawBody).length>512_000)return Response.json({error:"İstek gövdesi çok büyük."},{status:413});
    if (await verifyPbxSignature({ secret, timestamp, eventId, rawBody, signature }) !== "v2") {
      await recordSecurityEvent(request, "schedule_webhook_signature", "critical", "hbys", "İmza doğrulanamadı");
      return Response.json({ error: "Webhook imzası geçersiz.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    let body: { physicians?: unknown; appointments?: unknown };
    try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Geçersiz JSON.", code: "INVALID_JSON" }, { status: 400 }); }
    const docs = Array.isArray(body.physicians) ? body.physicians as Record<string, unknown>[] : [];
    const appts = Array.isArray(body.appointments) ? body.appointments as Record<string, unknown>[] : [];
    if (docs.length + appts.length === 0 || docs.length + appts.length > MAX_ROWS) return Response.json({ error: `Bir istekte 1–${MAX_ROWS} satır gönderilebilir.`, code: "INVALID_BATCH" }, { status: 422 });
    const units = new Set(HOSPITAL_UNITS.map((u) => u.code));
    const rejected: { index: number; kind: string; reason: string }[] = [];
    const cleanDocs = docs.flatMap((d, index) => {
      const c = code(d.code, /^[A-Z0-9-]{3,24}$/), unit = code(d.unitCode, /^[A-Z]{3}$/), fac = code(d.facilityCode, /^[A-Za-z0-9-]{2,24}$/);
      const label = typeof d.displayLabel === "string" ? d.displayLabel.trim().slice(0, 80) : "";
      const cap = Number(d.dailyCapacity ?? 20);
      if (!c || !unit || !units.has(unit) || !fac || label.length < 2 || !Number.isInteger(cap) || cap < 1 || cap > 200) { rejected.push({ index, kind: "physician", reason: "Eksik veya geçersiz alan" }); return []; }
      return [{ code: c, displayLabel: label, unitCode: unit, facilityCode: fac, dailyCapacity: cap, active: d.active !== false, training: false, updatedAt: new Date() }];
    });
    const db = getDb();
    const claimed = await db.insert(integrationEvents).values({ eventId, source: "hbys", eventType: "schedule.sync", payloadHash: await sha256(rawBody), status: "processing" }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!claimed.length) return Response.json({ ok: true, duplicate: true }, { status: 200 });
    for (let i = 0; i < cleanDocs.length; i += 10) {
      await db.insert(physicians).values(cleanDocs.slice(i, i + 10)).onConflictDoUpdate({ target: physicians.code, set: { displayLabel: sql`excluded.display_label`, unitCode: sql`excluded.unit_code`, facilityCode: sql`excluded.facility_code`, dailyCapacity: sql`excluded.daily_capacity`, active: sql`excluded.active`, training: sql`0`, updatedAt: sql`excluded.updated_at` } });
    }
    const known = new Map((await db.select({ code: physicians.code, unitCode: physicians.unitCode, facilityCode: physicians.facilityCode }).from(physicians)).map((p) => [p.code, p]));
    const now = new Date();
    const cleanAppts = appts.flatMap((a, index) => {
      const ref = code(a.reference, /^RDV-[A-Z0-9-]{3,40}$/);
      const alias = typeof a.patientAlias === "string" ? a.patientAlias.trim().toUpperCase() : "";
      const doc = typeof a.physicianCode === "string" ? known.get(a.physicianCode) : undefined;
      const startsAt = Number(a.startsAt);
      const status = typeof a.status === "string" ? a.status : "scheduled";
      const consent = Array.isArray(a.consentChannels) ? (a.consentChannels as unknown[]).filter((c): c is ChannelCode => typeof c === "string" && OUTBOUND.has(c as ChannelCode)) : [];
      const preferred = typeof a.preferredChannel === "string" && consent.includes(a.preferredChannel as ChannelCode) ? a.preferredChannel : null;
      const masked = typeof a.contactMasked === "string" && /^[0-9*+ @.a-z-]{4,32}$/i.test(a.contactMasked) && !/\d{5,}/.test(a.contactMasked.replace(/\s/g, "")) ? a.contactMasked : null;
      if (typeof a.clinicalPriority !== "boolean" || !ref || !validPatientAlias(alias) || !doc || !Number.isFinite(startsAt) || !STATUSES.has(status)) { rejected.push({ index, kind: "appointment", reason: !doc ? "Hekim bulunamadı" : !validPatientAlias(alias) ? "Takma ad kimlik bilgisi içeremez" : "Eksik veya geçersiz alan" }); return []; }
      return [{ reference: ref, patientAlias: alias, physicianCode: doc.code, unitCode: doc.unitCode, facilityCode: doc.facilityCode, startsAt: new Date(startsAt), status, clinicalPriority: a.clinicalPriority === true, allowOtherPhysician: a.allowOtherPhysician === true, preferredChannel: preferred, consentChannels: JSON.stringify(consent), contactMasked: masked, source: "HBYS", training: false, createdAt: now, updatedAt: now }];
    });
    for (let i = 0; i < cleanAppts.length; i += 5) {
      await db.insert(appointments).values(cleanAppts.slice(i, i + 5)).onConflictDoUpdate({
        target: appointments.reference,
        set: {
          startsAt: sql`case when appointments.status in ('needs_action','offered','rescheduled') then appointments.starts_at else excluded.starts_at end`,
          physicianCode: sql`case when appointments.status in ('needs_action','offered','rescheduled') then appointments.physician_code else excluded.physician_code end`,
          status: sql`case when appointments.status in ('needs_action','offered','rescheduled') then appointments.status else excluded.status end`,
          clinicalPriority: sql`excluded.clinical_priority`, allowOtherPhysician: sql`excluded.allow_other_physician`,
          preferredChannel: sql`excluded.preferred_channel`, consentChannels: sql`excluded.consent_channels`, contactMasked: sql`excluded.contact_masked`,
          unitCode: sql`excluded.unit_code`, facilityCode: sql`excluded.facility_code`, training: sql`0`, updatedAt: sql`excluded.updated_at`, version: sql`appointments.version + 1`,
        },
      });
    }
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
    await appendAudit(db, { actor: "integration:hbys", action: "schedule.sync", resource: eventId, detail: `physicians:${cleanDocs.length}; appointments:${cleanAppts.length}; rejected:${rejected.length}` });
    return Response.json({ ok: true, physicians: cleanDocs.length, appointments: cleanAppts.length, rejected }, { status: 202 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
