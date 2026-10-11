import { requireOperationalWriter } from "../../../../lib/security";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  approvals,
  automationEvents,
  callMessages,
  callSessions,
  operationalTasks,
  workflowJobs,
} from "../../../../db/schema";
import { auditStatements, auditHeadConflict } from "../../../../lib/audit";
import { findUnit, HOSPITAL_UNITS } from "../../../../lib/hospital-units";
import {
  assertBrowserMutation,
  assertJsonRequest,
  enforceRateLimit,
  requireActor,
  requireUnitAccess,
  SecurityError,
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
    requireOperationalWriter(actor);
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
    if (call.status === "completed") throw new SecurityError(409, "Sonuçlanmış görüşme değiştirilemez.", "CALL_CLOSED");
    const [pending] = await db.select().from(approvals).where(and(eq(approvals.callReference, call.reference), eq(approvals.status, "pending"))).limit(1);
    if ((pending || call.requiresHuman) && ["CALL_COMPLETED", "UNIT_TRANSFER"].includes(String(body.action))) {
      const [approved] = await db.select().from(approvals).where(and(eq(approvals.callReference, call.reference), eq(approvals.status, "approved"))).limit(1);
      if (pending || !approved) throw new SecurityError(409, "Yetkili insan onayı bekleniyor.", "APPROVAL_PENDING");
    }
    const [task] = await db.select().from(operationalTasks).where(eq(operationalTasks.callReference, call.reference)).orderBy(desc(operationalTasks.updatedAt)).limit(1);
    if (task?.acceptedBy && task.acceptedBy !== actor.email && actor.role !== "operations_manager") throw new SecurityError(409, "Görüşme başka bir görevlinin sorumluluğunda. Birim yöneticisine başvurun.", "CALL_OWNED");
    if (body.action === "CALL_ACCEPTED" && task?.acceptedBy) throw new SecurityError(409, "Görev zaten üstlenildi.", "CALL_ALREADY_ACCEPTED");
    if (body.action === "CALL_STARTED" && task?.status === "in_progress") throw new SecurityError(409, "Görüşme zaten işleme alındı.", "CALL_ALREADY_STARTED");
    await ensureCallActionGuard(db);
    const statements: Parameters<typeof db.batch>[0][number][] = [];
    const now = new Date(Math.max(Date.now(), call.lastMessageAt.getTime() + 1));
    const nonce = crypto.randomUUID();
    let destination = findUnit(call.unitCode);
    let status = call.status;
    let outcome = "";

    if (body.action === "CALL_ACCEPTED") {
      statements.push(db.update(operationalTasks)
        .set({
          status: "accepted",
          acceptedBy: actor.email,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference)));
      if (call.status === "ringing" || call.status === "transferred") {
        status = call.requiresHuman ? "human_handoff" : "active";
        statements.push(db.update(callSessions)
          .set({ status, lastMessageAt: now })
          .where(eq(callSessions.reference, call.reference)));
      }
      outcome = `${actor.label} görüşme görevini kabul etti; ${destination.name} biriminde sahiplik kaydedildi.`;
    } else if (body.action === "CALL_STARTED") {
      statements.push(db.update(operationalTasks)
        .set({
          status: "in_progress",
          assignedUser: actor.email,
          acceptedBy: actor.email,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference)));
      status = call.requiresHuman ? "human_handoff" : "active";
      statements.push(db.update(callSessions)
        .set({ status, lastMessageAt: now })
        .where(eq(callSessions.reference, call.reference)));
      outcome = `${actor.label} görüşmeyi işleme aldı; aktif sorumlu ${destination.assignedRole}.`;
    } else if (body.action === "CALLBACK_TASK") {
      destination = findUnit("CAG");
      const taskReference = `TSK-GA-${nonce.slice(0, 8).toUpperCase()}`;
      statements.push(db.insert(operationalTasks)
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
        }));
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
      statements.push(db.update(callSessions)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status,
          requiresHuman: destination.code === "ACY" || call.requiresHuman,
          lastMessageAt: now,
        })
        .where(eq(callSessions.reference, call.reference)));
      statements.push(db.update(operationalTasks)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status: "queued",
          acceptedBy: null,
          acceptedAt: null,
          dueAt: new Date(now.getTime() + destination.slaMinutes * 60_000),
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference)));
      outcome = `${from.name} → ${destination.name}; görüşme ${destination.assignedRole} kuyruğuna taşındı ve birim kabulü bekliyor.`;
    } else {
      status = "completed";
      statements.push(db.update(callSessions)
        .set({ status, endedAt: now, lastMessageAt: now })
        .where(eq(callSessions.reference, call.reference)));
      statements.push(db.update(operationalTasks)
        .set({ status: "completed", updatedAt: now })
        .where(eq(operationalTasks.callReference, call.reference)));
      outcome = `Görüşme ${actor.label} tarafından sonuçlandırıldı; görev ve denetim kaydı kapatıldı.`;
    }

    statements.push(db.update(callSessions).set({lastMessageAt:now}).where(eq(callSessions.reference,call.reference)));
    const [last] = await db
      .select()
      .from(callMessages)
      .where(eq(callMessages.callReference, call.reference))
      .orderBy(desc(callMessages.sequence))
      .limit(1);
    statements.push(db.insert(callMessages)
      .values({
        callReference: call.reference,
        sequence: (last?.sequence || 0) + 1,
        speakerType: "system",
        speakerLabel: "İşlem kaydı",
        message: outcome,
        redacted: false,
        createdAt: now,
      }));
    statements.push(db.insert(automationEvents)
      .values({
        ticketReference: call.reference,
        rule: body.action,
        outcome,
        unitCode: destination.code,
        eventType: "call_action",
        actor: actor.email,
      }));
    statements.push(db.insert(workflowJobs)
      .values({
        jobKey: `${call.reference}:state:${call.lastMessageAt.getTime()}`,
        idempotencyKey: `${call.reference}:state:${call.lastMessageAt.getTime()}`,
        correlationId: nonce,
        ticketReference: call.reference,
        ruleCode: body.action,
        payload: JSON.stringify({
          unit: destination.name,
          unitCode: destination.code,
          masked: true,
          callStateReference: call.reference,
          expectedLastMessageAt: call.lastMessageAt.getTime(),
        }),
      }));
    const jobGuard = statements.pop()!;
    statements.unshift(jobGuard);
    statements.push(...await auditStatements(db, [{
      actor: actor.email,
      action: `call.${body.action.toLowerCase()}`,
      resource: call.reference,
      detail: `destination:${destination.code}; status:${status}`,
    }]));
    const firstStatement = statements.shift();
    if (!firstStatement) throw new Error("Empty call transaction");
    await db.batch([firstStatement, ...statements]);
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
    let cause: unknown = error;
    for (let i=0;i<6 && cause;i++) {
      if (/CALL_STATE_CHANGED|UNIQUE constraint failed: workflow_jobs/.test(String(cause instanceof Error ? cause.message : cause))) return Response.json({error:"Görüşme başka bir işlemle değişti. Ekranı yenileyip tekrar deneyin.",code:"CALL_CHANGED"},{status:409});
      cause = typeof cause === "object" && cause !== null && "cause" in cause ? (cause as {cause?:unknown}).cause : null;
    }
    if (auditHeadConflict(error)) return Response.json({error:"İşlem çakıştı; hiçbir değişiklik kaydedilmedi. Yeniden deneyin.",code:"AUDIT_CONFLICT"},{status:409});
    return securityResponse(error, request);
  }
}

const callGuards = new WeakMap<object, Promise<unknown>>();
async function ensureCallActionGuard(db: ReturnType<typeof getDb>) {
  const binding = (globalThis as typeof globalThis & {__KLINORBIS_DB?:object}).__KLINORBIS_DB!;
  if (!callGuards.has(binding)) callGuards.set(binding, db.run(sql`CREATE TRIGGER IF NOT EXISTS workflow_call_state_guard BEFORE INSERT ON workflow_jobs
    WHEN json_extract(NEW.payload,'$.callStateReference') IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM call_sessions WHERE reference=json_extract(NEW.payload,'$.callStateReference') AND last_message_at=json_extract(NEW.payload,'$.expectedLastMessageAt'))
    BEGIN SELECT RAISE(ABORT,'CALL_STATE_CHANGED'); END`).catch(error => {callGuards.delete(binding);throw error;}));
  await callGuards.get(binding);
}
