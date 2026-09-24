import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  approvals,
  automationEvents,
  callMessages,
  callSessions,
  operationalTasks,
} from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { findUnit } from "../../../../lib/hospital-units";
import { redactPII, urgencySignal } from "../../../../lib/privacy";
import {
  assertBrowserMutation,
  assertJsonRequest,
  cleanText,
  enforceRateLimit,
  requireActor,
  requireUnitAccess,
  securityResponse,
} from "../../../../lib/security";

const allowedSpeakers = new Set(["caller", "agent", "clinician"]);

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "calls.message", 90, 60);
    const body = (await request.json()) as {
      callReference?: unknown;
      speakerType?: unknown;
      message?: unknown;
    };
    if (
      typeof body.callReference !== "string" ||
      typeof body.speakerType !== "string" ||
      !allowedSpeakers.has(body.speakerType)
    ) {
      return Response.json(
        { error: "Geçersiz görüşme iletisi.", code: "INVALID_MESSAGE" },
        { status: 400 },
      );
    }
    const message = cleanText(body.message, "Görüşme iletisi", 2, 2_000);
    const db = getDb();
    const [call] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.reference, body.callReference))
      .limit(1);
    if (!call)
      return Response.json(
        { error: "Görüşme bulunamadı.", code: "NOT_FOUND" },
        { status: 404 },
      );
    requireUnitAccess(actor, call.unitCode);
    if (call.status === "completed")
      return Response.json(
        {
          error: "Sonuçlanmış görüşmeye yeni ileti eklenemez.",
          code: "CALL_CLOSED",
        },
        { status: 409 },
      );

    const now = new Date();
    const [last] = await db
      .select()
      .from(callMessages)
      .where(eq(callMessages.callReference, call.reference))
      .orderBy(desc(callMessages.sequence))
      .limit(1);
    const redaction =
      body.speakerType === "caller"
        ? redactPII(message)
        : { maskedText: message, detected: [] as string[] };
    const signal =
      body.speakerType === "caller"
        ? urgencySignal(redaction.maskedText)
        : { isEmergency: false, level: 2, matched: "" };
    const speakerLabel =
      body.speakerType === "caller"
        ? "Arayan"
        : body.speakerType === "clinician"
          ? "Klinik personel · " + actor.label
          : "Çağrı görevlisi · " + actor.label;
    const nextSequence = (last?.sequence || 0) + 1;
    await db.insert(callMessages).values({
      callReference: call.reference,
      sequence: nextSequence,
      speakerType: body.speakerType,
      speakerLabel,
      message: redaction.maskedText,
      redacted: redaction.detected.length > 0,
      createdAt: now,
    });

    let destination = findUnit(call.unitCode);
    let status = call.status === "ringing" ? "active" : call.status;
    if (signal.isEmergency) {
      destination = findUnit("ACY");
      status = "human_handoff";
      await db
        .update(callSessions)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status,
          requiresHuman: true,
          summary: `Acil olasılık sinyali (${signal.matched}) nedeniyle normal akış durduruldu; klinik insan devri bekleniyor.`,
          lastMessageAt: now,
        })
        .where(eq(callSessions.reference, call.reference));
      await db
        .update(operationalTasks)
        .set({
          unitCode: destination.code,
          assignedRole: destination.assignedRole,
          status: "queued",
          priority: "Acil",
          acceptedBy: null,
          acceptedAt: null,
          dueAt: new Date(now.getTime() + destination.slaMinutes * 60_000),
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, call.reference));
      await db
        .insert(approvals)
        .values({
          reference: `ONAY-${call.reference}-ACIL`,
          callReference: call.reference,
          unitCode: destination.code,
          approvalType: "clinical_handoff",
          requestedBy: actor.email,
          status: "pending",
          createdAt: now,
        })
        .onConflictDoNothing();
      await db.insert(callMessages).values([
        {
          callReference: call.reference,
          sequence: nextSequence + 1,
          speakerType: "assistant",
          speakerLabel: "AI güvenlik yardımcısı",
          message: `Acil olasılık sinyali: ${signal.matched}. Klinik karar üretme; normal akışı durdur ve yetkili sağlık personeline devret.`,
          redacted: false,
          createdAt: new Date(now.getTime() + 1),
        },
        {
          callReference: call.reference,
          sequence: nextSequence + 2,
          speakerType: "system",
          speakerLabel: "Otomasyon",
          message: `${destination.name} / ${destination.assignedRole} kuyruğunda acil görev ve insan onayı açıldı.`,
          redacted: false,
          createdAt: new Date(now.getTime() + 2),
        },
      ]);
    } else {
      await db
        .update(callSessions)
        .set({ status, lastMessageAt: now })
        .where(eq(callSessions.reference, call.reference));
    }

    const outcome = signal.isEmergency
      ? `${destination.name} birimine acil insan devri açıldı.`
      : `${speakerLabel} görüşmeye yeni ileti ekledi.`;
    await db
      .insert(automationEvents)
      .values({
        ticketReference: call.reference,
        rule: signal.isEmergency
          ? "Canlı konuşmada acil insan devri"
          : "Canlı görüşme iletisi",
        outcome,
        unitCode: destination.code,
        eventType: "call_message",
        actor: actor.email,
      });
    await appendAudit(db, {
      actor: actor.email,
      action: "call.message_added",
      resource: call.reference,
      detail: `speaker:${body.speakerType}; unit:${destination.code}; pii:${redaction.detected.join(",") || "none"}; emergency:${signal.isEmergency}`,
    });
    const [updated] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.reference, call.reference))
      .limit(1);
    const messages = await db
      .select()
      .from(callMessages)
      .where(eq(callMessages.callReference, call.reference))
      .orderBy(callMessages.sequence);
    return Response.json({
      call: { ...updated, messages },
      destination: {
        unitCode: destination.code,
        unitName: destination.name,
        assignedRole: destination.assignedRole,
      },
      emergency: signal.isEmergency,
    });
  } catch (error) {
    return securityResponse(error, request);
  }
}
