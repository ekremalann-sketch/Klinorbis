import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { automationEvents, integrationEvents } from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { redactPII } from "../../../../lib/privacy";
import {
  assertJsonRequest,
  automationConnectorStatus,
  cleanText,
  getN8nRuntimeConfig,
  recordSecurityEvent,
  requireActor,
  securityResponse,
  SecurityError,
} from "../../../../lib/security";
import { findUnit } from "../../../../lib/hospital-units";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (actor.role !== "operations_manager" && actor.role !== "security_officer") {
      throw new SecurityError(403, "Entegrasyon durumuna erişim yetkiniz yok.", "FORBIDDEN");
    }
    return Response.json({
      connector: automationConnectorStatus().find((item) => item.id === "n8n-self-hosted"),
      contract: {
        method: "POST",
        path: "/api/integrations/n8n",
        requiredHeaders: ["x-klinorbis-event-id", "x-klinorbis-timestamp", "x-klinorbis-signature"],
        allowedEvents: ["workflow.started", "workflow.step", "workflow.completed", "workflow.failed", "human.approval.requested"],
        dataPolicy: "Yalnız kimliksiz olay metadatası; hasta adı, TCKN, telefon, serbest klinik metin kabul edilmez.",
      },
      workflowPackage: "/integrations/klinorbis-n8n-workflows.json",
    }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 16_384);
    const config = getN8nRuntimeConfig();
    if (!config.sharedSecret) {
      throw new SecurityError(503, "Self-hosted n8n ortak anahtarı yapılandırılmadı.", "N8N_NOT_CONFIGURED");
    }
    const eventId = cleanText(request.headers.get("x-klinorbis-event-id"), "Olay kimliği", 8, 96);
    const timestamp = cleanText(request.headers.get("x-klinorbis-timestamp"), "Zaman damgası", 10, 32);
    const suppliedSignature = cleanText(request.headers.get("x-klinorbis-signature"), "İmza", 64, 128).toLowerCase().replace(/^sha256=/, "");
    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
      throw new SecurityError(401, "n8n olayının zaman penceresi geçersiz.", "WEBHOOK_REPLAY_WINDOW");
    }
    const raw = await request.text();
    const expectedSignature = await hmacSha256(config.sharedSecret, `${timestamp}.${eventId}.${raw}`);
    if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
      await recordSecurityEvent(request, "n8n_signature_invalid", "critical", "integration:n8n", `İmza doğrulanmadı · ${eventId}`);
      throw new SecurityError(401, "n8n olay imzası doğrulanamadı.", "WEBHOOK_SIGNATURE_INVALID");
    }

    const payload = JSON.parse(raw) as Record<string, unknown>;
    const eventType = cleanText(payload.eventType, "Olay türü", 3, 64);
    const allowedEvents = new Set(["workflow.started", "workflow.step", "workflow.completed", "workflow.failed", "human.approval.requested"]);
    if (!allowedEvents.has(eventType)) throw new SecurityError(422, "Desteklenmeyen n8n olay türü.", "EVENT_NOT_ALLOWED");
    const workflowRunId = cleanText(payload.workflowRunId, "Çalıştırma kimliği", 6, 96);
    const unit = findUnit(typeof payload.unitCode === "string" ? payload.unitCode : "HIL");
    const ticketReference = typeof payload.ticketReference === "string"
      ? cleanText(payload.ticketReference, "Kayıt referansı", 5, 96)
      : workflowRunId;
    const status = cleanText(payload.status ?? "received", "Durum", 2, 48);
    const message = cleanText(payload.message ?? `${eventType} olayı alındı`, "Olay özeti", 2, 280);
    if (containsForbiddenHealthData(payload)) {
      throw new SecurityError(422, "n8n olayı kimlik veya serbest klinik veri içeremez.", "DATA_MINIMIZATION_VIOLATION");
    }

    const db = getDb();
    const inserted = await db.insert(integrationEvents).values({
      eventId,
      source: "n8n-self-hosted",
      eventType,
      payloadHash: await sha256(raw),
      status,
    }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!inserted.length) {
      const [existing] = await db.select().from(integrationEvents).where(eq(integrationEvents.eventId, eventId)).limit(1);
      return Response.json({ ok: true, duplicate: true, eventId, status: existing?.status || "accepted" });
    }
    await db.insert(automationEvents).values({
      ticketReference,
      rule: `n8n · ${eventType}`,
      outcome: `${message} · ${status}`,
      unitCode: unit.code,
      eventType: "n8n",
      actor: "integration:n8n",
    });
    await appendAudit(db, { actor: "integration:n8n", action: eventType, resource: workflowRunId, detail: `${unit.code} · ${status}` });
    return Response.json({ ok: true, duplicate: false, eventId, unitCode: unit.code, acceptedAt: new Date().toISOString() }, { status: 202 });
  } catch (error) {
    return securityResponse(error, request);
  }
}

function containsForbiddenHealthData(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (typeof value === "string") return redactPII(value).detected.length > 0;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenHealthData(item, depth + 1));
  if (!value || typeof value !== "object") return false;

  const forbidden = new Set([
    "name", "fullname", "patientname", "patientalias", "tckn", "nationalid",
    "phone", "telephone", "mobile", "email", "diagnosis", "clinicaltext",
    "medicaltext", "transcript", "address",
  ]);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalizedKey = key.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
    return forbidden.has(normalizedKey) || containsForbiddenHealthData(nested, depth + 1);
  });
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
