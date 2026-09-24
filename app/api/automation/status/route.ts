import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { automationEvents, transferRequests, workflowJobs } from "../../../../db/schema";
import { automationConnectorStatus, enforceRateLimit, requireActor, securityResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "automation.status", 180, 60);
    const db = getDb();
    const counts = await db.select({ status: workflowJobs.status, total: sql<number>`count(*)` }).from(workflowJobs).groupBy(workflowJobs.status);
    const recent = actor.canSeeAllUnits
      ? await db.select().from(automationEvents).orderBy(desc(automationEvents.createdAt)).limit(30)
      : actor.unitCodes.length
        ? await db.select().from(automationEvents).where(inArray(automationEvents.unitCode, actor.unitCodes)).orderBy(desc(automationEvents.createdAt)).limit(30)
        : [];
    const failed = actor.role === "operations_manager" || actor.role === "security_officer"
      ? await db.select().from(workflowJobs).where(eq(workflowJobs.status, "dead_letter")).limit(20)
      : [];
    const decisionQuery = db.select({
      reference: transferRequests.reference,
      ticketReference: transferRequests.ticketReference,
      unitCode: transferRequests.requestedUnitCode,
      status: transferRequests.status,
      decisionCode: transferRequests.decisionCode,
      decisionDetail: transferRequests.decisionDetail,
      alternatives: transferRequests.alternatives,
      training: transferRequests.training,
      updatedAt: transferRequests.updatedAt,
    }).from(transferRequests);
    const decisions = actor.canSeeAllUnits
      ? await decisionQuery.orderBy(desc(transferRequests.updatedAt)).limit(20)
      : actor.unitCodes.length
        ? await decisionQuery.where(inArray(transferRequests.requestedUnitCode, actor.unitCodes)).orderBy(desc(transferRequests.updatedAt)).limit(20)
        : [];
    const deadLetterTotal = Number(counts.find((row) => row.status === "dead_letter")?.total ?? 0);
    return Response.json({
      counts,
      recent,
      failed,
      failedVisible: actor.role === "operations_manager" || actor.role === "security_officer",
      deadLetterTotal,
      decisions: decisions.map((decision) => ({
        ...decision,
        alternatives: safeAlternatives(decision.alternatives),
      })),
      connectors: automationConnectorStatus(),
      heartbeat: new Date().toISOString(),
      source: "server",
    }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

function safeAlternatives(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}
