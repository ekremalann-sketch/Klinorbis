import { demoEnabled } from "./automation-policy";
import { sql } from "drizzle-orm";
import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { integrationEvents, workflowJobs } from "../db/schema";

type Db = ReturnType<typeof getDb>;

// Cron her 5 dakikada bir çalışır; bir turun gecikmesi "durdu" sayılmasın diye pencere 6,5 dk.
const HEARTBEAT_WINDOW_SECONDS = 390;

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
    db.select({ status: workflowJobs.status }).from(workflowJobs).where(demoEnabled() ? undefined : sql`coalesce(ticket_reference, '') not in (select reference from tickets where channel = 'Canlı Pilot' or reference like 'S2S-%')`),
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
    lastCycleStatus: (latest?.status ?? null) as string | null,
    ageSeconds,
    heartbeatWindowSeconds: HEARTBEAT_WINDOW_SECONDS,
    latestSource: (latest?.source ?? null) as string | null,
    latestEventType: (latest?.eventType ?? null) as string | null,
    jobs: {
      queued: jobRows.filter((row) => row.status === "queued" || row.status === "running").length,
      completed: jobRows.filter((row) => row.status === "completed").length,
    local: jobRows.filter((row) => row.status === "completed_local").length,
      deadLetter: jobRows.filter((row) => row.status === "dead_letter").length,
    },
  };
}
