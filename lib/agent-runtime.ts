import { eq, lt } from "drizzle-orm";
import type { getDb } from "../db";
import { integrationEvents, rateLimitCounters } from "../db/schema";
import { getAutomationAgentStatus } from "./agent-health";
import { advanceControlTower } from "./control-tower";
import { ensureOperationalSeed } from "./operations";
import { advancePilotAutomation } from "./pilot-automation";
import { runWorkflowCycle } from "./workflow-engine";

type Db = ReturnType<typeof getDb>;

export async function runAutomationAgent(db: Db, workerId = "scheduled-worker") {
  const receivedAt = new Date();
  const eventId = `agent-cycle:${receivedAt.getTime()}:${crypto.randomUUID()}`;
  await db.insert(integrationEvents).values({
    eventId,
    source: "klinorbis-agent",
    eventType: "automation.cycle",
    payloadHash: workerId,
    status: "running",
    receivedAt,
  });

  try {
    await db.delete(rateLimitCounters).where(lt(rateLimitCounters.expiresAt, receivedAt));
    await ensureOperationalSeed(db);
    const pilot = await advancePilotAutomation(db);
    const controlTower = await advanceControlTower(db);
    const cycle = await runWorkflowCycle(db, workerId, 30);
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
    return {
      pilot,
      controlTower,
      cycle,
      housekeeping: { expiredRateLimitsPurgedAt: receivedAt.toISOString() },
      status: await getAutomationAgentStatus(db),
    };
  } catch (error) {
    await db.update(integrationEvents).set({ status: "failed" }).where(eq(integrationEvents.eventId, eventId));
    throw error;
  }
}
