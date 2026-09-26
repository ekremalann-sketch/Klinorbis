import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { approvals, automationEvents, operationalTasks, ticketEvents, tickets, workflowJobs } from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import { findUnit, HOSPITAL_UNITS, recommendUnit } from "../../../lib/hospital-units";
import { ensureOperationalSeed } from "../../../lib/operations";
import { redactPII, urgencySignal } from "../../../lib/privacy";
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
import { runWorkflowCycle } from "../../../lib/workflow-engine";

export const dynamic = "force-dynamic";

// Gizlilik ve güvenlik görevlileri tüm birimleri izler ama operasyonel talebi değiştirmez.
const TICKET_OPERATOR_ROLES = new Set<SystemRole>(["operations_manager", "unit_manager", "clinician", "call_agent"]);
const CLOSED_STATUS = "Çözüldü";
const SAME_STATE: Record<string, string> = { accept: "Kabul edildi", start: "İşlemde" };

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "tickets.read", 180, 60);
    const db = getDb();
    await ensureOperationalSeed(db);
    const rows = actor.canSeeAllUnits
      ? await db.select().from(tickets).orderBy(desc(tickets.updatedAt)).limit(200)
      : actor.unitCodes.length
        ? await db.select().from(tickets).where(inArray(tickets.unitCode, actor.unitCodes)).orderBy(desc(tickets.updatedAt)).limit(200)
        : [];
    return Response.json({ tickets: rows }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "tickets.create", 30, 60);
    const payload = await request.json() as { patientAlias?: unknown; subject?: unknown; unitCode?: unknown; channel?: unknown };
    const patientAlias = cleanText(payload.patientAlias, "Hasta/protokol takma adı", 3, 40).toUpperCase();
    if (!/^[A-ZÇĞİÖŞÜ0-9._-]+$/u.test(patientAlias)) throw new Error("Hasta takma adı yalnız harf, sayı, nokta, tire ve alt çizgi içerebilir.");
    const subject = cleanText(payload.subject, "Talep özeti", 6, 2_000);
    const channel = typeof payload.channel === "string" && ["Web", "Telefon", "Çağrı", "Portal", "WhatsApp", "HBYS"].includes(payload.channel) ? payload.channel : "Web";
    const requestedCode = typeof payload.unitCode === "string" && HOSPITAL_UNITS.some((unit) => unit.code === payload.unitCode) ? payload.unitCode : null;
    const redaction = redactPII(subject);
    const signal = urgencySignal(redaction.maskedText);
    const destination = signal.isEmergency ? findUnit("ACY") : recommendUnit(redaction.maskedText, requestedCode);
    const now = new Date();
    const reference = `KLI-${now.getTime().toString(36).slice(-7).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const taskReference = `TSK-${reference}`;
    const db = getDb();
    await ensureOperationalSeed(db);
    const [ticket] = await db.insert(tickets).values({
      reference,
      patientAlias,
      subject: redaction.maskedText,
      maskedSubject: redaction.maskedText,
      detectedPii: JSON.stringify(redaction.detected),
      urgencyLevel: signal.level,
      humanApprovalRequired: signal.isEmergency,
      unit: destination.name,
      unitCode: destination.code,
      assignedRole: destination.assignedRole,
      priority: signal.isEmergency ? "Acil" : signal.level === 4 ? "Yüksek" : "Normal",
      status: signal.isEmergency ? "Personele aktarıldı" : "Yeni",
      channel,
      createdAt: now,
      updatedAt: now,
      slaDueAt: new Date(now.getTime() + destination.slaMinutes * 60_000),
    }).returning();
    await db.insert(operationalTasks).values({
      reference: taskReference,
      ticketReference: reference,
      unitCode: destination.code,
      assignedRole: destination.assignedRole,
      sourceType: "ticket",
      status: "queued",
      priority: ticket.priority,
      dueAt: ticket.slaDueAt,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(ticketEvents).values({
      ticketReference: reference,
      eventType: signal.isEmergency ? "emergency_handoff" : "routed",
      actor: actor.email,
      toUnitCode: destination.code,
      detail: signal.isEmergency
        ? `Normal otomasyon durduruldu; ${destination.name} / ${destination.assignedRole} kuyruğunda insan onayı açıldı.`
        : `${destination.name} birim kuyruğunda ${taskReference} görevi oluşturuldu; hedef rol: ${destination.assignedRole}.`,
      createdAt: now,
    });
    if (signal.isEmergency) {
      await db.insert(approvals).values({
        reference: `ONAY-${reference}`,
        ticketReference: reference,
        unitCode: destination.code,
        approvalType: "clinical_handoff",
        requestedBy: actor.email,
        status: "pending",
        createdAt: now,
      });
    }
    await db.insert(automationEvents).values({
      ticketReference: reference,
      rule: signal.isEmergency ? "Acil insan devri" : "Güvenli birim yönlendirmesi",
      outcome: `${destination.code} · ${destination.name} · ${taskReference}`,
      unitCode: destination.code,
      eventType: "routing",
      actor: actor.email,
    });
    const correlationId = crypto.randomUUID();
    await db.insert(workflowJobs).values({
      jobKey: `${reference}:initial-routing`,
      idempotencyKey: `${reference}:initial-routing:v2`,
      correlationId,
      ticketReference: reference,
      ruleCode: signal.isEmergency ? "EMERGENCY_HANDOFF" : "UNIT_ASSIGNMENT",
      payload: JSON.stringify({ unit: destination.name, unitCode: destination.code, taskReference, priority: ticket.priority, masked: true }),
    });
    await appendAudit(db, { actor: actor.email, action: "ticket.created", resource: reference, detail: `unit:${destination.code}; task:${taskReference}; pii:${redaction.detected.join(",") || "none"}; urgency:${signal.level}` });
    await runWorkflowCycle(db, "event-worker", 10);
    return Response.json({
      ticket,
      destination: { unitCode: destination.code, unitName: destination.name, assignedRole: destination.assignedRole, taskReference, queueStatus: "queued" },
      automation: { emergency: signal.isEmergency, signal, redaction: { detected: redaction.detected } },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Hasta takma")) return Response.json({ error: error.message, code: "INVALID_INPUT" }, { status: 400 });
    return securityResponse(error, request);
  }
}

export async function PATCH(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "tickets.change", 60, 60);
    const payload = await request.json() as { id?: unknown; reference?: unknown; action?: unknown; status?: unknown; targetUnitCode?: unknown };
    const db = getDb();
    const [ticket] = typeof payload.id === "number"
      ? await db.select().from(tickets).where(eq(tickets.id, payload.id)).limit(1)
      : typeof payload.reference === "string"
        ? await db.select().from(tickets).where(eq(tickets.reference, payload.reference)).limit(1)
        : [];
    if (!ticket) return Response.json({ error: "Talep bulunamadı.", code: "NOT_FOUND" }, { status: 404 });
    requireUnitAccess(actor, ticket.unitCode);
    if (!TICKET_OPERATOR_ROLES.has(actor.role)) {
      throw new SecurityError(403, "Gözetim rolleri talep durumunu değiştiremez.", "TICKET_ROLE_REQUIRED");
    }
    const action = normalizeAction(payload.action, payload.status);
    if (ticket.status === CLOSED_STATUS) {
      return Response.json({ error: "Çözülmüş talep yeniden işlenemez.", code: "TICKET_CLOSED" }, { status: 409 });
    }
    if (SAME_STATE[action] && ticket.status === SAME_STATE[action]) {
      return Response.json({ error: "Talep zaten bu durumda.", code: "NO_STATE_CHANGE" }, { status: 409 });
    }
    // Eşzamanlı iki işlemden yalnız ilki uygulanır: güncelleme okunan durum değişmediyse yapılır.
    const claimTicket = async (values: Partial<typeof tickets.$inferInsert>) => {
      const updated = await db.update(tickets).set(values).where(and(eq(tickets.id, ticket.id), eq(tickets.status, ticket.status))).returning({ id: tickets.id });
      if (!updated.length) throw new SecurityError(409, "Talep başka bir işlemle değişti; yenileyin.", "TICKET_CHANGED");
    };
    const now = new Date();
    let destination = findUnit(ticket.unitCode);
    let nextStatus = ticket.status;
    const eventType = action;
    let detail = "";

    if (action === "accept") {
      nextStatus = "Kabul edildi";
      detail = `${actor.label} görevi kabul etti. Kayıt ${destination.name} biriminde ve ${destination.assignedRole} sorumluluğunda.`;
      await claimTicket({ status: nextStatus, acceptedBy: actor.email, acceptedAt: now, updatedAt: now });
      await db.update(operationalTasks).set({ status: "accepted", acceptedBy: actor.email, acceptedAt: now, updatedAt: now }).where(eq(operationalTasks.ticketReference, ticket.reference));
    } else if (action === "start") {
      nextStatus = "İşlemde";
      detail = `${destination.name} birimi görevi işleme aldı; sorumlu rol ${destination.assignedRole}.`;
      await claimTicket({ status: nextStatus, updatedAt: now });
      await db.update(operationalTasks).set({ status: "in_progress", updatedAt: now }).where(eq(operationalTasks.ticketReference, ticket.reference));
    } else if (action === "resolve") {
      nextStatus = "Çözüldü";
      detail = `${destination.name} birimi görevi sonuçlandırdı. Kapanış denetim izine işlendi.`;
      await claimTicket({ status: nextStatus, updatedAt: now });
      await db.update(operationalTasks).set({ status: "completed", updatedAt: now }).where(eq(operationalTasks.ticketReference, ticket.reference));
    } else if (action === "transfer") {
      if (typeof payload.targetUnitCode !== "string" || !HOSPITAL_UNITS.some((unit) => unit.code === payload.targetUnitCode)) {
        return Response.json({ error: "Geçerli hedef birim seçilmelidir.", code: "INVALID_UNIT" }, { status: 400 });
      }
      const from = destination;
      destination = findUnit(payload.targetUnitCode);
      nextStatus = "Bekliyor";
      detail = `${from.name} → ${destination.name}. Görev ${destination.assignedRole} kuyruğuna taşındı; yeni birim kabulü bekleniyor.`;
      if (destination.code === from.code) return Response.json({ error: "Talep zaten bu birimde.", code: "NO_STATE_CHANGE" }, { status: 409 });
      await claimTicket({ previousUnitCode: from.code, unitCode: destination.code, unit: destination.name, assignedRole: destination.assignedRole, status: nextStatus, acceptedBy: null, acceptedAt: null, updatedAt: now, slaDueAt: new Date(now.getTime() + destination.slaMinutes * 60_000) });
      await db.update(operationalTasks).set({ unitCode: destination.code, assignedRole: destination.assignedRole, status: "queued", acceptedBy: null, acceptedAt: null, dueAt: new Date(now.getTime() + destination.slaMinutes * 60_000), updatedAt: now }).where(eq(operationalTasks.ticketReference, ticket.reference));
      await db.insert(ticketEvents).values({ ticketReference: ticket.reference, eventType, actor: actor.email, fromUnitCode: from.code, toUnitCode: destination.code, detail, createdAt: now });
    } else {
      return Response.json({ error: "Geçersiz talep işlemi.", code: "INVALID_ACTION" }, { status: 400 });
    }

    if (action !== "transfer") await db.insert(ticketEvents).values({ ticketReference: ticket.reference, eventType, actor: actor.email, fromUnitCode: destination.code, toUnitCode: destination.code, detail, createdAt: now });
    await db.insert(automationEvents).values({ ticketReference: ticket.reference, rule: `Talep işlemi · ${action}`, outcome: detail, unitCode: destination.code, eventType: "ticket_action", actor: actor.email });
    await appendAudit(db, { actor: actor.email, action: `ticket.${action}`, resource: ticket.reference, detail: `${ticket.unitCode}->${destination.code}; status:${nextStatus}` });
    const nonce = crypto.randomUUID();
    await db.insert(workflowJobs).values({ jobKey: `${ticket.reference}:${action}:${nonce}`, idempotencyKey: `${ticket.reference}:${action}:${nonce}`, correlationId: nonce, ticketReference: ticket.reference, ruleCode: action === "transfer" ? "UNIT_TRANSFER" : "STATUS_CHANGED", payload: JSON.stringify({ status: nextStatus, unit: destination.name, unitCode: destination.code }) });
    await runWorkflowCycle(db, "ticket-action-worker", 10);
    const [updatedTicket] = await db.select().from(tickets).where(eq(tickets.id, ticket.id)).limit(1);
    const [task] = await db.select().from(operationalTasks).where(eq(operationalTasks.ticketReference, ticket.reference)).limit(1);
    return Response.json({
      ticket: updatedTicket,
      task,
      destination: { unitCode: destination.code, unitName: destination.name, assignedRole: destination.assignedRole, taskReference: task?.reference, queueStatus: task?.status },
      event: { eventType, detail, at: now.toISOString() },
    });
  } catch (error) {
    return securityResponse(error, request);
  }
}

function normalizeAction(action: unknown, legacyStatus: unknown) {
  if (typeof action === "string") return action;
  if (legacyStatus === "Kabul edildi") return "accept";
  if (legacyStatus === "İşlemde") return "start";
  if (legacyStatus === "Çözüldü") return "resolve";
  return "";
}
