import { automationStopped } from "./automation-policy";
import { and, eq, lt, lte, ne, or } from "drizzle-orm";
import { activateDueSteps } from "./playbook-store";
import type { getDb } from "../db";
import { integrationEvents, rateLimitCounters } from "../db/schema";
import { getAutomationAgentStatus } from "./agent-health";
import { advanceControlTower } from "./control-tower";
import { ensureOperationalSeed } from "./operations";
import { advancePilotAutomation } from "./pilot-automation";
import { runWorkflowCycle } from "./workflow-engine";
import { runAiMonitor } from "./ai-monitor";

type Db = ReturnType<typeof getDb>;

export async function runAutomationAgent(db: Db, workerId = "scheduled-worker") {
  if (await automationStopped(db)) return { ran: false, pilot: null, controlTower: null, cycle: null, housekeeping: null, status: await getAutomationAgentStatus(db) };
  const receivedAt = new Date();
  const leaseToken = crypto.randomUUID();
  const lease = await db.insert(integrationEvents).values({ eventId: "agent:lease", source: "agent-lock", eventType: "automation.lease", payloadHash: leaseToken, status: "running", receivedAt })
    .onConflictDoUpdate({ target: integrationEvents.eventId, set: { payloadHash: leaseToken, status: "running", receivedAt }, where: or(and(ne(integrationEvents.status, "running"), lte(integrationEvents.receivedAt, new Date(receivedAt.getTime() - 30_000))), lte(integrationEvents.receivedAt, new Date(receivedAt.getTime() - 300_000))) })
    .returning({ eventId: integrationEvents.eventId });
  if (!lease.length) return { ran: false, pilot: null, controlTower: null, cycle: null, housekeeping: null, status: await getAutomationAgentStatus(db) };
  const eventId = `agent-cycle:${receivedAt.getTime()}:${crypto.randomUUID()}`;
  try {
  await db.insert(integrationEvents).values({
    eventId,
    source: "klinorbis-agent",
    eventType: "automation.cycle",
    payloadHash: workerId,
    status: "running",
    receivedAt,
  });

    await db.delete(rateLimitCounters).where(lt(rateLimitCounters.expiresAt, receivedAt));
    await ensureOperationalSeed(db);
    const pilot = await advancePilotAutomation(db);
    const controlTower = await advanceControlTower(db);
    const cycle = await runWorkflowCycle(db, workerId, 30);
    // Zamanı gelen gecikmeli akış adımlarını (ör. taburcudan 48 saat sonra arama) iş kutusuna aç.
    await activateDueSteps(db, new Date());
    // İsteğe bağlı yapay zekâ izleme: anahtar yoksa no-op; en fazla 15 dk'da bir; yalnız toplam sayılar gider; işlem yapmaz.
    const ai = await runAiMonitor(db).catch(() => ({ ran: false, reason: "failed" }));
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
    return {
      ran: true,
      pilot,
      controlTower,
      cycle,
      ai,
      housekeeping: { expiredRateLimitsPurgedAt: receivedAt.toISOString() },
      status: await getAutomationAgentStatus(db),
    };
  } catch (error) {
    await db.update(integrationEvents).set({ status: "failed" }).where(eq(integrationEvents.eventId, eventId));
    throw error;
  } finally {
    await db.update(integrationEvents).set({ status: "completed" }).where(and(eq(integrationEvents.eventId, "agent:lease"), eq(integrationEvents.payloadHash, leaseToken)));
  }
}
