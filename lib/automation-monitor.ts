import { desc, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { transferRequests, workflowJobs } from "../db/schema";
import { getAutomationAgentStatus } from "./agent-health";
import { redactPII } from "./privacy";
import { automationConnectorStatus } from "./security";

type Db = ReturnType<typeof getDb>;

export async function getAutomationMonitorSnapshot(db: Db) {
  const [agent, counts, failedRows, decisionRows, trainingRows] = await Promise.all([
    getAutomationAgentStatus(db),
    db.select({ status: workflowJobs.status, total: sql<number>`count(*)` }).from(workflowJobs).groupBy(workflowJobs.status),
    db.select({ jobKey: workflowJobs.jobKey, ruleCode: workflowJobs.ruleCode, lastError: workflowJobs.lastError })
      .from(workflowJobs)
      .where(eq(workflowJobs.status, "dead_letter"))
      .limit(20),
    db.select({
      reference: transferRequests.reference,
      ticketReference: transferRequests.ticketReference,
      status: transferRequests.status,
      decisionCode: transferRequests.decisionCode,
      decisionDetail: transferRequests.decisionDetail,
      alternatives: transferRequests.alternatives,
      training: transferRequests.training,
      updatedAt: transferRequests.updatedAt,
    }).from(transferRequests).orderBy(desc(transferRequests.updatedAt)).limit(20),
    db.select({ reference: transferRequests.reference, training: transferRequests.training })
      .from(transferRequests)
      .orderBy(desc(transferRequests.updatedAt))
      .limit(100),
  ]);

  const deadLetterTotal = Number(counts.find((row) => row.status === "dead_letter")?.total ?? 0);
  return {
    generatedAt: new Date().toISOString(),
    agent,
    jobs: Object.fromEntries(counts.map((row) => [row.status, Number(row.total)])),
    deadLetterTotal,
    failed: failedRows.map((row) => ({
      ...row,
      lastError: row.lastError ? redactPII(row.lastError).maskedText.slice(0, 240) : null,
    })),
    decisions: decisionRows.map((row) => ({
      ...row,
      alternatives: safeAlternatives(row.alternatives),
    })),
    pilotData: {
      inspected: trainingRows.length,
      trainingTagged: trainingRows.filter((row) => row.training && /^(XFR-|PLT-|S2S-)/.test(row.reference)).length,
      nonTrainingFound: trainingRows.filter((row) => !row.training).length,
    },
    connectors: automationConnectorStatus(),
  };
}

function safeAlternatives(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}
