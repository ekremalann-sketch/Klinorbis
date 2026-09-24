import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { integrationEvents } from "../../../../db/schema";
import { getAutomationAgentStatus } from "../../../../lib/agent-health";
import { runAutomationAgent } from "../../../../lib/agent-runtime";
import { getAutomationMonitorSnapshot } from "../../../../lib/automation-monitor";
import {
  assertJsonRequest,
  cleanText,
  enforceRateLimit,
  getN8nRuntimeConfig,
  requireActor,
  securityResponse,
  SecurityError,
  sha256,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "automation.agent.status", 120, 60);
    if (actor.role !== "operations_manager" && actor.role !== "security_officer") {
      throw new SecurityError(403, "Ajan durumuna erişim yetkiniz yok.", "FORBIDDEN");
    }
    return Response.json(await getAutomationAgentStatus(getDb()), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  let schedulerEventId = "";
  let stage = "request-validation";
  try {
    assertJsonRequest(request, 4_096);
    const raw = await request.text();
    const eventId = cleanText(request.headers.get("x-klinorbis-event-id"), "Olay kimliği", 8, 96);
    schedulerEventId = `scheduler:${eventId}`;
    stage = "signature-verification";
    await verifySignature(request, raw, eventId);
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (payload.action !== "tick") throw new SecurityError(422, "Yalnız otomasyon tick olayı kabul edilir.", "EVENT_NOT_ALLOWED");

    stage = "scheduler-claim";
    const db = getDb();
    const inserted = await db.insert(integrationEvents).values({
      eventId: schedulerEventId,
      source: "n8n-scheduler",
      eventType: "automation.tick",
      payloadHash: await sha256(raw),
      status: "running",
    }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
    if (!inserted.length) return Response.json({ ok: true, duplicate: true, status: await getAutomationAgentStatus(db), monitor: await getAutomationMonitorSnapshot(db) });

    stage = "agent-cycle";
    const result = await runAutomationAgent(db, "n8n-scheduled-worker");
    stage = "completion-record";
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, schedulerEventId));
    return Response.json({ ok: true, duplicate: false, ...result, monitor: await getAutomationMonitorSnapshot(db) }, { status: 202 });
  } catch (error) {
    if (schedulerEventId) {
      try { await getDb().update(integrationEvents).set({ status: "failed" }).where(eq(integrationEvents.eventId, schedulerEventId)); } catch { /* preserve original error */ }
    }
    console.error(`[automation-agent] ${stage}: ${error instanceof Error ? error.message : "unknown error"}`);
    return securityResponse(error, request);
  }
}

async function verifySignature(request: Request, raw: string, eventId: string) {
  const secret = getN8nRuntimeConfig().sharedSecret;
  if (!secret) throw new SecurityError(503, "Otomasyon zamanlayıcı anahtarı yapılandırılmadı.", "AUTOMATION_NOT_CONFIGURED");
  const timestamp = cleanText(request.headers.get("x-klinorbis-timestamp"), "Zaman damgası", 10, 32);
  const supplied = cleanText(request.headers.get("x-klinorbis-signature"), "İmza", 64, 128).toLowerCase().replace(/^sha256=/, "");
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
    throw new SecurityError(401, "Otomasyon olayının zaman penceresi geçersiz.", "WEBHOOK_REPLAY_WINDOW");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${eventId}.${raw}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(expected, supplied)) throw new SecurityError(401, "Otomasyon olay imzası doğrulanamadı.", "WEBHOOK_SIGNATURE_INVALID");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
