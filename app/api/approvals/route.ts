import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  approvals,
  automationEvents,
  callSessions,
  operationalTasks,
  ticketEvents,
  tickets,
} from "../../../db/schema";
import { redactPII } from "../../../lib/privacy";
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
      ? redactPII(cleanText(body.note, "Karar notu", 2, 500)).maskedText
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
    if (approval.ticketReference) {
      const [related] = await db.select().from(tickets).where(eq(tickets.reference, approval.ticketReference)).limit(1);
      if (!related || related.status !== "Personele aktarıldı") throw new SecurityError(409, "İlgili talep onay bekleyen durumda değil.", "APPROVAL_STATE_CHANGED");
    }
    if (approval.callReference) {
      const [related] = await db.select().from(callSessions).where(eq(callSessions.reference, approval.callReference)).limit(1);
      if (!related || related.status === "completed") throw new SecurityError(409, "İlgili görüşme kapalı veya bulunamadı.", "CALL_CLOSED");
    }
    const now = new Date();
    const status = body.decision === "approve" ? "approved" : "rejected";
    // D1 batch is atomic. The approval claim and all related state changes commit together.
    const relatedReference = approval.ticketReference || approval.callReference || approval.reference;
    const claim = db.update(approvals).set({ status, decidedBy: actor.email, decisionNote: note, decidedAt: now })
      .where(and(eq(approvals.reference, approval.reference), eq(approvals.status, "pending"))).returning({ reference: approvals.reference });
    if (approval.ticketReference) {
      const ticketReference = approval.ticketReference;
      const claimedDecision = sql`exists (select 1 from approvals where reference = ${approval.reference} and decided_by = ${actor.email} and decided_at = ${now.getTime()} and status = ${status})`;
      const ticketUpdate = db.update(tickets).set({ status: body.decision === "approve" ? "Kabul edildi" : "İnsan incelemesi gerekli", acceptedBy: body.decision === "approve" ? actor.email : null, acceptedAt: body.decision === "approve" ? now : null, updatedAt: now })
        .where(and(eq(tickets.reference, ticketReference), eq(tickets.status, "Personele aktarıldı"), claimedDecision)).returning({ reference: tickets.reference });
      const taskUpdate = db.update(operationalTasks).set({ status: body.decision === "approve" ? "accepted" : "queued", acceptedBy: body.decision === "approve" ? actor.email : null, acceptedAt: body.decision === "approve" ? now : null, updatedAt: now })
        .where(and(eq(operationalTasks.ticketReference, ticketReference), claimedDecision, sql`exists (select 1 from tickets where reference = ${ticketReference} and updated_at = ${now.getTime()} and status = ${body.decision === "approve" ? "Kabul edildi" : "İnsan incelemesi gerekli"})`));
      const [claimed, changed] = await db.batch([claim, ticketUpdate, taskUpdate]);
      if (!claimed.length || !changed.length) throw new SecurityError(409, "Talep veya onay başka bir işlemle değişti.", "APPROVAL_STATE_CHANGED");
      await db.insert(ticketEvents).values({ ticketReference, eventType: `approval_${status}`, actor: actor.email, fromUnitCode: approval.unitCode, toUnitCode: approval.unitCode, detail: `${approval.approvalType} kararı: ${status}. ${note}`, createdAt: now });
    } else if (approval.callReference) {
      const callReference = approval.callReference;
      const claimedDecision = sql`exists (select 1 from approvals where reference = ${approval.reference} and decided_by = ${actor.email} and decided_at = ${now.getTime()} and status = ${status})`;
      const [claimed] = await db.batch([
        claim,
        db.update(operationalTasks).set({ status: body.decision === "approve" ? "accepted" : "queued", acceptedBy: body.decision === "approve" ? actor.email : null, acceptedAt: body.decision === "approve" ? now : null, updatedAt: now }).where(and(eq(operationalTasks.callReference, callReference), claimedDecision, sql`exists (select 1 from call_sessions where reference = ${callReference} and status != 'completed')`)),
        db.update(callSessions).set({ lastMessageAt: now }).where(and(eq(callSessions.reference, callReference), ne(callSessions.status, "completed"), claimedDecision)),
      ]);
      if (!claimed.length) throw new SecurityError(409, "Onay başka bir işlemle değişti.", "ALREADY_DECIDED");
    } else {
      const claimed = await claim;
      if (!claimed.length) throw new SecurityError(409, "Onay başka bir işlemle değişti.", "ALREADY_DECIDED");
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
