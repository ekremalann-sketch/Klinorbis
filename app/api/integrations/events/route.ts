import { getDb } from "../../../../db";
import { integrationEvents } from "../../../../db/schema";
import { startFromEvent } from "../../../../lib/playbook-store";
import { triggerFor } from "../../../../lib/playbook-triggers";
import { getWebhookSecret, recordSecurityEvent, securityResponse, sha256 } from "../../../../lib/security";
import { verifyPbxSignature } from "../../../../lib/webhook-signature";

export const dynamic = "force-dynamic";

// Hastane sistemlerinden olay alımı (imzalı, v2): HBYS, biyomedikal, bina yönetimi, stok, güvenlik.
// Gövde: { "type": "device.failure", "note"?: "Kat 3 monitör" }  — kişisel veri gönderilmez, not maskelenir.
// Başlıklar: x-klinorbis-timestamp, x-klinorbis-event-id, x-klinorbis-signature (takvim aktarımıyla aynı imza).
// Olay türü lib/playbook-triggers.ts'deki eşlemeyle ilgili akışı başlatır; aynı olay kimliği ikinci kez akış açmaz.
export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret();
    if (!secret) return Response.json({ error: "Olay entegrasyonu yapılandırılmadı.", code: "INTEGRATION_DISABLED" }, { status: 503 });
    if (Number(request.headers.get("content-length") || 0) > 16_000) return Response.json({ error: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const timestamp = request.headers.get("x-klinorbis-timestamp") || "";
    const signature = request.headers.get("x-klinorbis-signature") || "";
    const eventId = request.headers.get("x-klinorbis-event-id") || "";
    if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) {
      await recordSecurityEvent(request, "event_webhook_rejected", "high", "integration", "Eksik başlık veya zaman penceresi dışında");
      return Response.json({ error: "Webhook doğrulaması başarısız.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const rawBody = await request.text();
    if (await verifyPbxSignature({ secret, timestamp, eventId, rawBody, signature }) !== "v2") {
      await recordSecurityEvent(request, "event_webhook_signature", "critical", "integration", "İmza doğrulanamadı");
      return Response.json({ error: "Webhook imzası geçersiz.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    let body: { type?: unknown; note?: unknown };
    try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Geçersiz JSON.", code: "INVALID_JSON" }, { status: 400 }); }
    const type = typeof body.type === "string" ? body.type : "";
    if (!triggerFor(type)) return Response.json({ error: "Bu olay türü için tanımlı akış yok.", code: "UNKNOWN_EVENT" }, { status: 422 });
    const db = getDb();
    const claimed = await db.insert(integrationEvents).values({ eventId: `event:${eventId}`, source: "integration", eventType: type, payloadHash: await sha256(rawBody), status: "accepted" }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    const result = await startFromEvent(db, { type, eventId, source: "entegrasyon", note: body.note });
    return Response.json({ ok: true, duplicate: !claimed.length || result.duplicate, reference: result.reference, playbook: result.playbook }, { status: claimed.length && !result.duplicate ? 201 : 200 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
