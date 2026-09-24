import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  automationEvents,
  callMessages,
  callSessions,
  operationalTasks,
  workflowJobs,
} from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { findUnit, HOSPITAL_UNITS } from "../../../../lib/hospital-units";
import {
  assertBrowserMutation,
  assertJsonRequest,
  enforceRateLimit,
  requireActor,
  requireUnitAccess,
  securityResponse,
} from "../../../../lib/security";
import { runWorkflowCycle } from "../../../../lib/workflow-engine";

const allowed = new Set([
  "CALL_ACCEPTED",
  "CALL_STARTED",
  "CALLBACK_TASK",
  "UNIT_TRANSFER",
  "CALL_COMPLETED",
]);

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "calls.action", 40, 60);
    const body = (await request.json()) as {
      callId?: unknown;
      action?: unknown;
      targetUnitCode?: unknown;
    };
    if (
      typeof body.callId !== "string" ||
      typeof body.action !== "string" ||
      !allowed.has(body.action)
    ) {
      return Response.json(
        { error: "Geçersiz çağrı işlemi.", code: "INVALID_ACTION" },
        { status: 400 },
      );
    }
    const db = getDb();
    const [call] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.reference, body.callId))
      .limit(1);
    if (!call)
      return Response.json(
        { error: "Görüşme bulunamadı.", code: "NOT_FOUND" },
        { status: 404 },
      );
    requireUnitAccess(actor, call.unitCode);
    const now = new Date();
    const nonce = crypto.randomUUID();
    let destination = findUnit(call.unitCode);
    let status = call.status;
    let outcome = "";

    if (body.action === "CALL_ACCEPTED") {
      await db
        .update(operationalTasks)
        .set({
          status: "accepted",
          acceptedBy: actor.email,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference));
      if (call.status === "ringing" || call.status === "transferred") {
        status = call.requiresHuman ? "human_handoff" : "active";
        await db
          .update(callSessions)
          .set({ status, lastMessageAt: now })
          .where(eq(callSessions.reference, call.reference));
      }
      outcome = `${actor.label} görüşme görevini kabul etti; ${destination.name} biriminde sahiplik kaydedildi.`;
    } else if (body.action === "CALL_STARTED") {
      await db
        .update(operationalTasks)
        .set({
          status: "in_progress",
          assignedUser: actor.email,
          acceptedBy: actor.email,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference));
      status = call.requiresHuman ? "human_handoff" : "active";
      await db
        .update(callSessions)
        .set({ status, lastMessageAt: now })
        .where(eq(callSessions.reference, call.reference));
      outcome = `${actor.label} görüşmeyi işleme aldı; aktif sorumlu ${destination.assignedRole}.`;
    } else if (body.action === "CALLBACK_TASK") {
      destination = findUnit("CAG");
      const taskReference = `TSK-GA-${nonce.slice(0, 8).toUpperCase()}`;
      await db
        .insert(operationalTasks)
        .values({
          reference: taskReference,
          callReference: call.reference,
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          sourceType: "callback",
          status: "queued",
          priority: call.requiresHuman ? "Acil" : "Normal",
          dueAt: new Date(now.getTime() + 5 * 60_000),
          createdAt: now,
          updatedAt: now,
        });
      outcome = `${taskReference} geri arama görevi ${destination.name} / ${destination.assignedRole} kuyruğuna gönderildi.`;
    } else if (body.action === "UNIT_TRANSFER") {
      if (
        typeof body.targetUnitCode !== "string" ||
        !HOSPITAL_UNITS.some((unit) => unit.code === body.targetUnitCode)
      ) {
        return Response.json(
          {
            error: "Aktarım için hedef birim gereklidir.",
            code: "INVALID_UNIT",
          },
          { status: 400 },
        );
      }
      const from = destination;
      destination = findUnit(body.targetUnitCode);
      status = destination.code === "ACY" ? "human_handoff" : "transferred";
      await db
        .update(callSessions)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status,
          requiresHuman: destination.code === "ACY" || call.requiresHuman,
          lastMessageAt: now,
        })
        .where(eq(callSessions.reference, call.reference));
      await db
        .update(operationalTasks)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status: "queued",
          acceptedBy: null,
          acceptedAt: null,
          dueAt: new Date(now.getTime() + destination.slaMinutes * 60_000),
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference));
      outcome = `${from.name} → ${destination.name}; görüşme ${destination.assignedRole} kuyruğuna taşındı ve birim kabulü bekliyor.`;
    } else {
      status = "completed";
      await db
        .update(callSessions)
        .set({ status, endedAt: now, lastMessageAt: now })
        .where(eq(callSessions.reference, call.reference));
      await db
        .update(operationalTasks)
        .set({ status: "completed", updatedAt: now })
        .where(eq(operationalTasks.callReference, call.reference));
      outcome = `Görüşme ${actor.label} tarafından sonuçlandırıldı; görev ve denetim kaydı kapatıldı.`;
    }

    const [last] = await db
      .select()
      .from(callMessages)
      .where(eq(callMessages.callReference, call.reference))
      .orderBy(desc(callMessages.sequence))
      .limit(1);
    await db
      .insert(callMessages)
      .values({
        callReference: call.reference,
        sequence: (last?.sequence || 0) + 1,
        speakerType: "system",
        speakerLabel: "İşlem kaydı",
        message: outcome,
        redacted: false,
        createdAt: now,
      });
    await db
      .insert(automationEvents)
      .values({
        ticketReference: call.reference,
        rule: body.action,
        outcome,
        unitCode: destination.code,
        eventType: "call_action",
        actor: actor.email,
      });
    await db
      .insert(workflowJobs)
      .values({
        jobKey: `${call.reference}:${body.action}:${nonce}`,
        idempotencyKey: `${call.reference}:${body.action}:${nonce}`,
        correlationId: nonce,
        ticketReference: call.reference,
        ruleCode: body.action,
        payload: JSON.stringify({
          unit: destination.name,
          unitCode: destination.code,
          masked: true,
        }),
      });
    await appendAudit(db, {
      actor: actor.email,
      action: `call.${body.action.toLowerCase()}`,
      resource: call.reference,
      detail: `destination:${destination.code}; status:${status}`,
    });
    const cycle = await runWorkflowCycle(db, "call-event-worker", 10);
    const [updated] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.reference, call.reference))
      .limit(1);
    return Response.json({
      ok: true,
      call: updated,
      outcome,
      destination: {
        unitCode: destination.code,
        unitName: destination.name,
        assignedRole: destination.assignedRole,
      },
      cycle,
    });
  } catch (error) {
    return securityResponse(error, request);
  }
}
