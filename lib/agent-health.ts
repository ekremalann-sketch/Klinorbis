import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { integrationEvents, workflowJobs } from "../db/schema";

type Db = ReturnType<typeof getDb>;

const HEARTBEAT_WINDOW_SECONDS = 180;

export async function getAutomationAgentStatus(db: Db) {
  const [latestRows, successfulRows, jobRows] = await Promise.all([
    db.select({ source: integrationEvents.source, eventType: integrationEvents.eventType, status: integrationEvents.status, createdAt: integrationEvents.receivedAt })
      .from(integrationEvents)
      .where(eq(integrationEvents.source, "klinorbis-agent"))
      .orderBy(desc(integrationEvents.receivedAt))
      .limit(1),
    db.select({ createdAt: integrationEvents.receivedAt })
      .from(integrationEvents)
      .where(and(eq(integrationEvents.source, "klinorbis-agent"), eq(integrationEvents.status, "completed")))
      .orderBy(desc(integrationEvents.receivedAt))
      .limit(1),
    db.select({ status: workflowJobs.status }).from(workflowJobs),
  ]);

  const latest = latestRows[0];
  const lastRunMs = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
  const ageSeconds = lastRunMs ? Math.max(0, Math.floor((Date.now() - lastRunMs) / 1000)) : null;
  const recent = ageSeconds !== null && ageSeconds <= HEARTBEAT_WINDOW_SECONDS;
  const latestSucceeded = latest?.status === "completed";
  const state = ageSeconds === null
    ? "waiting"
    : !recent
      ? "stale"
      : latest?.status === "failed"
        ? "degraded"
        : "running";

  return {
    state,
    lastRunAt: lastRunMs ? new Date(lastRunMs).toISOString() : null,
    lastSuccessfulRunAt: successfulRows[0]?.createdAt
      ? new Date(successfulRows[0].createdAt).toISOString()
      : null,
    lastRunSucceeded: latestSucceeded,
    lastCycleStatus: latest?.status ?? null,
    ageSeconds,
    heartbeatWindowSeconds: HEARTBEAT_WINDOW_SECONDS,
    latestSource: latest?.source ?? null,
    latestEventType: latest?.eventType ?? null,
    jobs: {
      queued: jobRows.filter((row) => row.status === "queued" || row.status === "running").length,
      completed: jobRows.filter((row) => row.status === "completed").length,
      deadLetter: jobRows.filter((row) => row.status === "dead_letter").length,
    },
  };
}
