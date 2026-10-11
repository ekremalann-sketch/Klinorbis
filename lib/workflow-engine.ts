import { automationStopped, demoEnabled } from "./automation-policy";
import { sql } from "drizzle-orm";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import { automationEvents, workflowJobs } from "../db/schema";
import { appendAudit } from "./audit";
import { getN8nRuntimeConfig } from "./security";

type Db = ReturnType<typeof import("../db").getDb>;

export async function runWorkflowCycle(db: Db, workerId = "cloud-worker", limit = 20) {
  if (await automationStopped(db)) return { completed: 0, retried: 0, deadLetter: 0, paused: true };
  const now = new Date();
  await db.update(workflowJobs).set({ status: "queued", lockedAt: null, lockedBy: null, nextRunAt: now, lastError: "Süresi aşan worker kilidi güvenli biçimde geri alındı" })
    .where(and(eq(workflowJobs.status, "running"), lt(workflowJobs.lockedAt, new Date(now.getTime() - 5 * 60_000))));
  const jobs = await db.select().from(workflowJobs)
    .where(and(eq(workflowJobs.status, "queued"), lte(workflowJobs.nextRunAt, now), demoEnabled() ? undefined : sql`coalesce(ticket_reference, '') not in (select reference from tickets where channel = 'Canlı Pilot' or reference like 'S2S-%')`))
    .orderBy(asc(workflowJobs.nextRunAt)).limit(limit);
  let completed = 0, retried = 0, deadLetter = 0;

  for (const job of jobs) {
    const claimed = await db.update(workflowJobs)
      .set({ status: "running", lockedAt: now, lockedBy: workerId, attempts: job.attempts + 1 })
      .where(and(eq(workflowJobs.id, job.id), eq(workflowJobs.status, "queued"))).returning();
    if (!claimed.length) continue;
    try {
      const data = safeJson(job.payload);
      const localOutcome = outcomeFor(job.ruleCode, data);
      const delivered = await dispatchToN8n(job, data, localOutcome);
      const outcome = `${localOutcome} · ${delivered ? "Harici orkestratör kabul etti; hasta mesajı teslimi ayrıca doğrulanmalıdır." : "Yalnız yerel kayıt işlendi; harici iletim yapılmadı."}`;
      await db.insert(automationEvents).values({
        ticketReference: job.ticketReference || "SYSTEM", rule: job.ruleCode, outcome,
        unitCode: typeof data.unitCode === "string" ? data.unitCode : null,
        eventType: "workflow",
        actor: workerId,
      });
      await appendAudit(db, { actor: workerId, action: delivered ? "workflow.completed" : "workflow.local_completed", resource: job.jobKey, detail: outcome });
      await db.update(workflowJobs).set({ status: delivered ? "completed" : "local_completed", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null }).where(eq(workflowJobs.id, job.id));
      completed++;
    } catch (error) {
      const terminal = job.attempts + 1 >= job.maxAttempts;
      await db.update(workflowJobs).set({
        status: terminal ? "dead_letter" : "queued", lockedAt: null, lockedBy: null,
        nextRunAt: new Date(Date.now() + Math.min(300000, 15000 * 2 ** job.attempts) + Math.floor(Math.random() * 3000)),
        lastError: error instanceof Error ? error.message : "Bilinmeyen hata",
      }).where(eq(workflowJobs.id, job.id));
      if (terminal) deadLetter++;
      else retried++;
    }
  }
  return { scanned: jobs.length, completed, retried, deadLetter, ranAt: now.toISOString(), workerId };
}

async function dispatchToN8n(
  job: {
    jobKey: string;
    idempotencyKey: string;
    correlationId: string;
    ticketReference: string | null;
    ruleCode: string;
  },
  data: Record<string, unknown>,
  outcome: string,
): Promise<boolean> {
  const config = getN8nRuntimeConfig();
  if (!config.webhookUrl || !config.sharedSecret) return false;

  const eventId = job.idempotencyKey;
  const timestamp = String(Date.now());
  const payload = JSON.stringify({
    eventId,
    eventType: "workflow.completed",
    workflowRunId: job.correlationId || job.jobKey,
    ticketReference: job.ticketReference || undefined,
    unitCode: typeof data.unitCode === "string" ? data.unitCode : "HIL",
    ruleCode: job.ruleCode,
    status: "completed",
    message: outcome.slice(0, 280),
  });
  const signature = await hmacSha256(
    config.sharedSecret,
    `${timestamp}.${eventId}.${payload}`,
  );
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-klinorbis-event-id": eventId,
      "x-klinorbis-timestamp": timestamp,
      "x-klinorbis-signature": signature,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`n8n orkestratörü ${response.status} yanıtı verdi`);
  }
  return true;
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function outcomeFor(ruleCode: string, data: Record<string, unknown>) {
  switch (ruleCode) {
    case "EMERGENCY_HANDOFF": return "Otomatik klinik işlem durduruldu; kritik görev yetkili sağlık personeline devir için kaydedildi";
    case "UNIT_ASSIGNMENT": return `Talep ${String(data.unit || "yetkili")} birim kuyruğuna kaydedildi`;
    case "STATUS_CHANGED": return `Durum değişikliği işlendi: ${String(data.status || "güncellendi")}`;
    case "CALLBACK_TASK": return "Geri arama görevi Çağrı Merkezi kuyruğu için kaydedildi";
    case "UNIT_TRANSFER": return `Görüşme ${String(data.unit || "yetkili")} birim onayına sunuldu`;
    case "CALL_COMPLETED": return "Görüşme sonucu görevli onayıyla kaydedildi";
    case "HUMAN_APPROVAL": return `İnsan onayı kapısı açıldı; ${String(data.unit || "yetkili")} birim kararı bekleniyor`;
    case "PILOT_STEP": return `Kimliksiz pilot otomasyon adımı kalıcı kayda işlendi · adım ${String(data.step ?? "-")}`;
    case "CAPACITY_DECISION": return `Kapasite, vardiya ve blokaj kararı işlendi · ${String(data.transferReference || "sistemler arası kayıt")}`;
    default: return "İş kuralı güvenli biçimde tamamlandı";
  }
}

function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
