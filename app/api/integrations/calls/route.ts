import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { automationEvents, callMessages, callSessions, integrationEvents, operationalTasks } from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { findUnit, HOSPITAL_UNITS } from "../../../../lib/hospital-units";
import { ensureOperationalSeed } from "../../../../lib/operations";
import { redactPII, urgencySignal } from "../../../../lib/privacy";
import { cleanText, getWebhookSecret, recordSecurityEvent, securityResponse, sha256 } from "../../../../lib/security";
import { replayKey, verifyPbxSignature } from "../../../../lib/webhook-signature";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret();
    if (!secret) return Response.json({ error: "Santral webhook anahtarı yapılandırılmadı.", code: "INTEGRATION_DISABLED" }, { status: 503 });
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 65_536) return Response.json({ error: "İstek gövdesi çok büyük.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const timestamp = request.headers.get("x-klinorbis-timestamp") || "";
    const signature = request.headers.get("x-klinorbis-signature") || "";
    const eventId = request.headers.get("x-klinorbis-event-id") || "";
    const source = cleanSource(request.headers.get("x-klinorbis-source") || "hospital-pbx");
    if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)) {
      await recordSecurityEvent(request, "webhook_header_rejected", "high", source, "Eksik veya geçersiz webhook güvenlik başlıkları");
      return Response.json({ error: "Webhook doğrulaması başarısız.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    const epochMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
    if (!Number.isFinite(epochMs) || Math.abs(Date.now() - epochMs) > 5 * 60_000) {
      await recordSecurityEvent(request, "webhook_replay_blocked", "high", source, "Webhook zaman damgası izin verilen pencerenin dışında");
      return Response.json({ error: "Webhook zaman penceresi geçersiz.", code: "REPLAY_BLOCKED" }, { status: 401 });
    }
    const rawBody = await request.text();
    // v2 imza olay kimliğini kapsar; eski (timestamp.body) biçim bağlı olabilecek
    // mevcut göndericiler için geçici olarak kabul edilir ve güvenlik kaydına düşer.
    const scheme = await verifyPbxSignature({ secret, timestamp, eventId, rawBody, signature });
    if (!scheme) {
      await recordSecurityEvent(request, "webhook_signature_rejected", "critical", source, "HMAC imzası doğrulanamadı");
      return Response.json({ error: "Webhook imzası geçersiz.", code: "INVALID_SIGNATURE" }, { status: 401 });
    }
    if (scheme === "legacy") {
      await recordSecurityEvent(request, "webhook_legacy_signature", "low", source, "Eski timestamp.body imza biçimi kullanıldı; timestamp.eventId.body biçimine geçilmeli");
    }
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return Response.json({ error: "Geçersiz JSON.", code: "INVALID_JSON" }, { status: 400 }); }
    const eventType = cleanText(payload.eventType, "Olay türü", 3, 40);
    const callReference = cleanText(payload.callReference, "Çağrı referansı", 5, 80).toUpperCase();
    const db = getDb();
    await ensureOperationalSeed(db);
    const payloadHash = await sha256(rawBody);
    // Tekrar koruması imzalı içeriğe bağlıdır: aynı timestamp+gövde farklı event-id ile
    // yeniden gönderilse de ikinci kez işlenmez. Her iki sahiplenme de tek adımlı insert'tir.
    const replayClaim = await db.insert(integrationEvents).values({ eventId: await replayKey(timestamp, rawBody), source, eventType: `replay-guard:${eventType}`, payloadHash, status: "guard" })
      .onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!replayClaim.length) {
      await recordSecurityEvent(request, "webhook_replay_blocked", "high", source, `Aynı imzalı içerik tekrar gönderildi · ${eventId}`);
      return Response.json({ ok: true, duplicate: true, eventId }, { status: 200 });
    }
    const claimed = await db.insert(integrationEvents).values({ eventId, source, eventType, payloadHash, status: "processing" })
      .onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!claimed.length) return Response.json({ ok: true, duplicate: true, eventId }, { status: 200 });
    let destination = findUnit("CAG");
    let outcome = "";
    if (eventType === "call.started") {
      const patientAlias = typeof payload.patientAlias === "string" ? cleanText(payload.patientAlias, "Hasta takma adı", 3, 40).toUpperCase() : `HST-${callReference.slice(-6)}`;
      if (typeof payload.unitCode === "string" && HOSPITAL_UNITS.some((unit) => unit.code === payload.unitCode)) destination = findUnit(payload.unitCode);
      const now = new Date();
      await db.insert(callSessions).values({ reference: callReference, patientAlias, source, status: "ringing", unitCode: destination.code, assignedRole: destination.assignedRole, summary: "Gelen çağrı bağlandı; canlı döküm bekleniyor.", training: false, requiresHuman: false, startedAt: now, lastMessageAt: now }).onConflictDoNothing();
      await db.insert(callMessages).values({ callReference, sequence: 1, speakerType: "system", speakerLabel: "Santral", message: "Gelen çağrı doğrulanmış santral webhook'u ile güvenli oturuma alındı.", redacted: true, createdAt: now }).onConflictDoNothing();
      await db.insert(operationalTasks).values({ reference: `TSK-${callReference}`, callReference, unitCode: destination.code, assignedRole: destination.assignedRole, sourceType: "call", status: "queued", priority: "Normal", dueAt: new Date(now.getTime() + destination.slaMinutes * 60_000), createdAt: now, updatedAt: now }).onConflictDoNothing();
      outcome = `${callReference} anlık çağrı olarak açıldı; ${destination.name} kuyruğu bilgilendirildi.`;
    } else if (eventType === "transcript.partial" || eventType === "transcript.final") {
      const [call] = await db.select().from(callSessions).where(eq(callSessions.reference, callReference)).limit(1);
      if (!call) return Response.json({ error: "Önce call.started olayı gönderilmelidir.", code: "CALL_NOT_FOUND" }, { status: 409 });
      const text = cleanText(payload.text, "Konuşma metni", 1, 4_000);
      const redaction = redactPII(text);
      const signal = urgencySignal(redaction.maskedText);
      destination = signal.isEmergency ? findUnit("ACY") : findUnit(call.unitCode);
      const [last] = await db.select().from(callMessages).where(eq(callMessages.callReference, callReference)).orderBy(desc(callMessages.sequence)).limit(1);
      const sequence = (last?.sequence || 0) + 1;
      const speakerType = typeof payload.speakerType === "string" && ["caller", "agent", "clinician"].includes(payload.speakerType) ? payload.speakerType : "caller";
      const speakerLabel = speakerType === "caller" ? "Arayan" : speakerType === "clinician" ? "Klinik rol" : "Çağrı görevlisi";
      await db.insert(callMessages).values({ callReference, sequence, speakerType, speakerLabel, message: redaction.maskedText, redacted: redaction.detected.length > 0, createdAt: new Date() });
      if (signal.isEmergency) {
        await db.update(callSessions).set({ status: "human_handoff", unitCode: destination.code, assignedRole: destination.assignedRole, requiresHuman: true, lastMessageAt: new Date(), summary: "Acil olasılık sinyali algılandı; otomatik işlem durduruldu ve klinik insan devri açıldı." }).where(eq(callSessions.reference, callReference));
        await db.update(operationalTasks).set({ unitCode: destination.code, assignedRole: destination.assignedRole, status: "queued", priority: "Acil", dueAt: new Date(Date.now() + 2 * 60_000), updatedAt: new Date() }).where(eq(operationalTasks.callReference, callReference));
        await db.insert(callMessages).values({ callReference, sequence: sequence + 1, speakerType: "assistant", speakerLabel: "AI güvenlik yardımcısı", message: `Acil olasılık sinyali: ${signal.matched}. Normal otomasyon durduruldu; ${destination.assignedRole} devri açıldı.`, redacted: false, createdAt: new Date() });
      } else {
        await db.update(callSessions).set({ status: "active", lastMessageAt: new Date() }).where(eq(callSessions.reference, callReference));
      }
      outcome = signal.isEmergency ? `${destination.name} insan devri açıldı.` : `Konuşma satırı güvenli biçimde eklendi.`;
    } else if (eventType === "call.ended") {
      await db.update(callSessions).set({ status: "completed", endedAt: new Date(), lastMessageAt: new Date() }).where(eq(callSessions.reference, callReference));
      await db.update(operationalTasks).set({ status: "completed", updatedAt: new Date() }).where(eq(operationalTasks.callReference, callReference));
      outcome = `${callReference} santral tarafından kapatıldı.`;
    } else {
      return Response.json({ error: "Desteklenmeyen santral olayı.", code: "UNSUPPORTED_EVENT" }, { status: 400 });
    }

    await db.insert(automationEvents).values({ ticketReference: callReference, rule: eventType, outcome, unitCode: destination.code, eventType: "integration", actor: `integration:${source}` });
    await appendAudit(db, { actor: `integration:${source}`, action: eventType, resource: callReference, detail: `event:${eventId}; payload:${payloadHash}; destination:${destination.code}` });
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
    return Response.json({ ok: true, eventId, callReference, outcome, destination: { unitCode: destination.code, unitName: destination.name, assignedRole: destination.assignedRole } }, { status: 202 });
  } catch (error) {
    return securityResponse(error, request);
  }
}

function cleanSource(value: string) {
  return /^[a-zA-Z0-9._:-]{3,80}$/.test(value) ? value : "rejected-source";
}
