import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appointmentChanges, appointments, integrationEvents } from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { recordResponse } from "../../../../lib/patient-access-store";
import { getWebhookSecret, recordSecurityEvent, securityResponse, sha256 } from "../../../../lib/security";
import { verifyPbxSignature } from "../../../../lib/webhook-signature";

export const dynamic = "force-dynamic";

// Hastanın SMS / WhatsApp yanıtı (mesaj sağlayıcısından imzalı olay).
// Yalnız v2 imza (timestamp.eventId.body) kabul edilir. Gövde kimlik içermez:
// { "appointmentReference": "RDV-…", "reply": "EVET" | "ARA" | "İPTAL", "channel": "sms" | "whatsapp" }
// Yanıt kodu dışındaki serbest metin işlenmez; hasta "ARA" yazınca çağrı merkezi görevi açılır.
const REPLIES: Record<string, "accepted" | "declined" | "cancelled"> = { EVET: "accepted", E: "accepted", ARA: "declined", HAYIR: "declined", "İPTAL": "cancelled", IPTAL: "cancelled" };

export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret();
    if (!secret) return Response.json({ error: "Mesaj entegrasyonu yapılandırılmadı.", code: "INTEGRATION_DISABLED" }, { status: 503 });
    if (Number(request.headers.get("content-length") || 0) > 4_096) return Response.json({ error: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const timestamp = request.headers.get("x-klinorbis-timestamp") || "";
    const signature = request.headers.get("x-klinorbis-signature") || "";
    const eventId = request.headers.get("x-klinorbis-event-id") || "";
    if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) {
      await recordSecurityEvent(request, "message_webhook_rejected", "high", "message-provider", "Eksik başlık veya zaman penceresi dışında");
      return Response.json({ error: "Webhook doğrulaması başarısız.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const rawBody = await request.text();
    if(new TextEncoder().encode(rawBody).length>4096)return Response.json({error:"İstek gövdesi çok büyük."},{status:413});
    if (await verifyPbxSignature({ secret, timestamp, eventId, rawBody, signature }) !== "v2") {
      await recordSecurityEvent(request, "message_webhook_signature", "critical", "message-provider", "İmza doğrulanamadı");
      return Response.json({ error: "Webhook imzası geçersiz.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return Response.json({ error: "Geçersiz JSON.", code: "INVALID_JSON" }, { status: 400 }); }
    const reply = String(body.reply ?? "").trim().toLocaleUpperCase("tr-TR");
    const response = REPLIES[reply];
    const reference = String(body.appointmentReference ?? "");
    if (!response || !/^RDV-[A-Z0-9-]{3,40}$/.test(reference)) return Response.json({ error: "Tanınmayan yanıt kodu.", code: "UNSUPPORTED_REPLY" }, { status: 422 });
    const db = getDb();
    const claimed = await db.insert(integrationEvents).values({ eventId, source: "message-provider", eventType: "patient.reply", payloadHash: await sha256(rawBody), status: "processing" }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!claimed.length) return Response.json({ ok: true, duplicate: true }, { status: 200 });
    const [appt] = await db.select().from(appointments).where(eq(appointments.reference, reference)).limit(1);
    const [change] = appt ? await db.select().from(appointmentChanges).where(and(eq(appointmentChanges.appointmentReference, reference), eq(appointmentChanges.status, "offered"))).orderBy(desc(appointmentChanges.id)).limit(1) : [];
    if (!change) {
      await db.update(integrationEvents).set({ status: "ignored" }).where(eq(integrationEvents.eventId, eventId));
      return Response.json({ ok: true, ignored: true, reason: "Yanıt bekleyen öneri yok." }, { status: 202 });
    }
    await recordResponse(db, { email: "integration:message-provider" }, { changeId: change.id, response });
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
    await appendAudit(db, { actor: "integration:message-provider", action: "patient.reply", resource: reference, detail: `reply:${response}; event:${eventId}` });
    return Response.json({ ok: true, response }, { status: 202 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
