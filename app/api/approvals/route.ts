import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  approvals,
  automationEvents,
  callMessages,
  callSessions,
  operationalTasks,
  ticketEvents,
  tickets,
} from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import {
  assertBrowserMutation,
  assertJsonRequest,
  cleanText,
  enforceRateLimit,
  requireActor,
  requireUnitAccess,
  SecurityError,
  securityResponse,
  type SystemRole,
} from "../../../lib/security";

// Çağrı görevlisi, gizlilik ve güvenlik rolleri kayıtları izleyebilir ama
// klinik devir / birim onayı kararı veremez.
const APPROVAL_DECIDER_ROLES = new Set<SystemRole>(["operations_manager", "unit_manager", "clinician"]);

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "approvals.decide", 40, 60);
    const body = (await request.json()) as {
      reference?: unknown;
      decision?: unknown;
      note?: unknown;
    };
    if (
      typeof body.reference !== "string" ||
      (body.decision !== "approve" && body.decision !== "reject")
    ) {
      return Response.json(
        { error: "Geçersiz onay kararı.", code: "INVALID_DECISION" },
        { status: 400 },
      );
    }
    const note = body.note
      ? cleanText(body.note, "Karar notu", 2, 500)
      : body.decision === "approve"
        ? "Yetkili insan onayı verildi."
        : "Yetkili insan onayı reddedildi.";
    const db = getDb();
    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.reference, body.reference))
      .limit(1);
    if (!approval)
      return Response.json(
        { error: "Onay kaydı bulunamadı.", code: "NOT_FOUND" },
        { status: 404 },
      );
    requireUnitAccess(actor, approval.unitCode);
    if (!APPROVAL_DECIDER_ROLES.has(actor.role)) {
      throw new SecurityError(403, "Onay kararı yalnız operasyon yöneticisi, birim yöneticisi veya klinik rol tarafından verilebilir.", "APPROVAL_ROLE_REQUIRED");
    }
    if (approval.status !== "pending")
      return Response.json(
        {
          error: "Bu onay daha önce karara bağlanmış.",
          code: "ALREADY_DECIDED",
        },
        { status: 409 },
      );
    const now = new Date();
    const status = body.decision === "approve" ? "approved" : "rejected";
    // Koşullu güncelleme: iki eşzamanlı karardan yalnız ilki kazanır.
    const claimed = await db
      .update(approvals)
      .set({
        status,
        decidedBy: actor.email,
        decisionNote: note,
        decidedAt: now,
      })
      .where(and(eq(approvals.reference, approval.reference), eq(approvals.status, "pending")))
      .returning({ reference: approvals.reference });
    if (!claimed.length)
      return Response.json(
        {
          error: "Bu onay daha önce karara bağlanmış.",
          code: "ALREADY_DECIDED",
        },
        { status: 409 },
      );

    const relatedReference =
      approval.ticketReference || approval.callReference || approval.reference;
    if (approval.ticketReference) {
      const ticketStatus =
        body.decision === "approve"
          ? "Kabul edildi"
          : "İnsan incelemesi gerekli";
      await db
        .update(tickets)
        .set({
          status: ticketStatus,
          acceptedBy: body.decision === "approve" ? actor.email : null,
          acceptedAt: body.decision === "approve" ? now : null,
          updatedAt: now,
        })
        .where(eq(tickets.reference, approval.ticketReference));
      await db
        .update(operationalTasks)
        .set({
          status: body.decision === "approve" ? "accepted" : "queued",
          acceptedBy: body.decision === "approve" ? actor.email : null,
          acceptedAt: body.decision === "approve" ? now : null,
          updatedAt: now,
        })
        .where(eq(operationalTasks.ticketReference, approval.ticketReference));
      await db
        .insert(ticketEvents)
        .values({
          ticketReference: approval.ticketReference,
          eventType: `approval_${status}`,
          actor: actor.email,
          fromUnitCode: approval.unitCode,
          toUnitCode: approval.unitCode,
          detail: `${approval.approvalType} kararı: ${status}. ${note}`,
          createdAt: now,
        });
    }
    if (approval.callReference) {
      await db
        .update(operationalTasks)
        .set({
          status: body.decision === "approve" ? "accepted" : "queued",
          acceptedBy: body.decision === "approve" ? actor.email : null,
          acceptedAt: body.decision === "approve" ? now : null,
          updatedAt: now,
        })
        .where(eq(operationalTasks.callReference, approval.callReference));
      const [last] = await db
        .select()
        .from(callMessages)
        .where(eq(callMessages.callReference, approval.callReference))
        .orderBy(desc(callMessages.sequence))
        .limit(1);
      await db
        .insert(callMessages)
        .values({
          callReference: approval.callReference,
          sequence: (last?.sequence || 0) + 1,
          speakerType: "system",
          speakerLabel: "Onay kaydı",
          message: `${actor.label}: ${status === "approved" ? "Onaylandı" : "Reddedildi"}. ${note}`,
          redacted: false,
          createdAt: now,
        });
      await db
        .update(callSessions)
        .set({ lastMessageAt: now })
        .where(eq(callSessions.reference, approval.callReference));
    }
    await db
      .insert(automationEvents)
      .values({
        ticketReference: relatedReference,
        rule: `İnsan onayı · ${status}`,
        outcome: note,
        unitCode: approval.unitCode,
        eventType: "approval_decision",
        actor: actor.email,
      });
    await appendAudit(db, {
      actor: actor.email,
      action: `approval.${status}`,
      resource: approval.reference,
      detail: `${relatedReference}; unit:${approval.unitCode}`,
    });
    const [updated] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.reference, approval.reference))
      .limit(1);
    return Response.json({ approval: updated, relatedReference });
  } catch (error) {
    return securityResponse(error, request);
  }
}
