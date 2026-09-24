import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { getDb } from "../db";
import {
  approvals,
  auditLogs,
  automationEvents,
  capacitySnapshots,
  callMessages,
  callSessions,
  facilities,
  hospitalUnits,
  operationalTasks,
  reportAssignments,
  securityEvents,
  staffAccounts,
  staffShifts,
  ticketEvents,
  tickets,
  transferRequests,
  unitMemberships,
  workflowJobs,
} from "../db/schema";
import { getAutomationAgentStatus } from "./agent-health";
import { availableCapacity, currentControlTowerHeartbeat, ensureControlTowerBaseline } from "./control-tower";
import { HOSPITAL_UNITS, findUnit } from "./hospital-units";
import { currentPilotHeartbeat, ensurePilotBaseline } from "./pilot-automation";
import type { RequestActor } from "./security";
import { automationConnectorStatus } from "./security";

type Db = ReturnType<typeof getDb>;

export async function ensureOperationalSeed(db: Db) {
  const seedState = globalThis as typeof globalThis & { __KLINORBIS_OPERATIONAL_SEEDED?: boolean };
  if (seedState.__KLINORBIS_OPERATIONAL_SEEDED) return;
  // D1 has a bounded SQLite bind-variable budget. Seed the broad unit catalog
  // in small idempotent batches instead of one 445-parameter statement.
  for (let index = 0; index < HOSPITAL_UNITS.length; index += 10) {
    await db.insert(hospitalUnits).values(HOSPITAL_UNITS.slice(index, index + 10).map((unit) => ({
      code: unit.code,
      name: unit.name,
      kind: unit.kind,
      scope: unit.scope,
      slaMinutes: unit.slaMinutes,
    }))).onConflictDoNothing();
  }
  await ensurePilotBaseline(db);
  await ensureControlTowerBaseline(db);

  await db.insert(callSessions).values({
    reference: "TRN-2401",
    patientAlias: "HST-EĞİTİM-01",
    source: "Eğitim senaryosu",
    direction: "Gelen",
    status: "human_handoff",
    unitCode: "ACY",
    assignedRole: "Klinik Triyaj Rolü",
    summary: "Kimlik doğrulama sırasında göğüs ağrısı ifadesi algılandı. Otomatik randevu akışı durduruldu; yetkili sağlık personeline devir ve acil güvenlik yönlendirmesi açıldı.",
    training: true,
    requiresHuman: true,
    startedAt: new Date(Date.now() - 5 * 60_000),
    lastMessageAt: new Date(Date.now() - 90_000),
  }).onConflictDoNothing();

  const trainingMessages = [
    [1, "system", "Sistem", "Gelen çağrı güvenli oturuma alındı. Telefon numarası görüşme ekranında maskelendi."],
    [2, "agent", "Çağrı görevlisi", "KLINORBIS Hasta İletişim Merkezine hoş geldiniz. Acil bir durumdaysanız 112'yi arayın. Görüşmeye devam etmeden önce kimliğinizi asgari bilgilerle doğrulayacağım."],
    [3, "caller", "Arayan", "Bugün başlayan göğüs ağrım var. Hangi bölüme başvurmam gerektiğini öğrenmek istiyorum."],
    [4, "assistant", "AI güvenlik yardımcısı", "Acil olasılık sinyali: göğüs ağrısı. Klinik karar üretme; normal randevu otomasyonunu durdur; yetkili sağlık personeline devir öner."],
    [5, "system", "Otomasyon", "Normal randevu akışı durduruldu. ACY kuyruğunda yüksek öncelikli TSK-TRN-2401 görevi ve insan onayı açıldı."],
    [6, "agent", "Çağrı görevlisi", "Geçmiş olsun. Bu görüşmeyi şimdi yetkili sağlık personeline aktarıyorum. Şikâyetiniz artarsa veya nefes darlığı, bayılma gibi bir durum olursa beklemeden 112'yi arayın."],
    [7, "clinician", "Klinik triyaj rolü", "Görüşmeyi devraldım. Önce bulunduğunuz ortamın güvenli olduğunu ve acil yardım çağırabilecek birinin yanınızda olup olmadığını doğrulayalım."],
  ] as const;
  await db.insert(callMessages).values(trainingMessages.map(([sequence, speakerType, speakerLabel, message], index) => ({
    callReference: "TRN-2401",
    sequence,
    speakerType,
    speakerLabel,
    message,
    redacted: true,
    createdAt: new Date(Date.now() - (5 * 60_000) + index * 32_000),
  }))).onConflictDoNothing();

  await db.insert(operationalTasks).values({
    reference: "TSK-TRN-2401",
    callReference: "TRN-2401",
    unitCode: "ACY",
    assignedRole: "Klinik Triyaj Rolü",
    sourceType: "call",
    status: "accepted",
    priority: "Acil",
    dueAt: new Date(Date.now() + 2 * 60_000),
    acceptedBy: "Klinik Triyaj Rolü",
    acceptedAt: new Date(Date.now() - 2 * 60_000),
  }).onConflictDoNothing();
  seedState.__KLINORBIS_OPERATIONAL_SEEDED = true;
}

export async function ensureTicketTasks(db: Db) {
  const rows = await db.select().from(tickets).orderBy(desc(tickets.createdAt)).limit(100);
  for (const ticket of rows) {
    const unit = findUnit(ticket.unitCode === "HIL" && ticket.unit !== "Hasta İletişim" ? ticket.unit : (ticket.unitCode || ticket.unit));
    const normalizedUpdatedAt = new Date(ticket.updatedAt).getTime() > 0 ? ticket.updatedAt : ticket.createdAt;
    await db.update(tickets).set({ unitCode: unit.code, unit: unit.name, assignedRole: unit.assignedRole, updatedAt: normalizedUpdatedAt })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.unitCode, "HIL"), ne(tickets.unit, "Hasta İletişim")));
    await db.insert(operationalTasks).values({
      reference: `TSK-${ticket.reference}`,
      ticketReference: ticket.reference,
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      sourceType: "ticket",
      status: taskStatusFromTicket(ticket.status),
      priority: ticket.priority,
      dueAt: ticket.slaDueAt || new Date(new Date(ticket.createdAt).getTime() + unit.slaMinutes * 60_000),
      acceptedBy: ticket.acceptedBy,
      acceptedAt: ticket.acceptedAt,
      createdAt: ticket.createdAt,
      updatedAt: normalizedUpdatedAt,
    }).onConflictDoNothing();
  }
}

export async function workspaceSnapshot(db: Db, actor: RequestActor) {
  // This endpoint is deliberately read-only. Seed, orchestration and queue
  // writes run in the automation agent so workspace startup cannot be blocked.
  const pilot = actor.canSeeAllUnits ? currentPilotHeartbeat() : null;
  const controlTower = actor.canSeeAllUnits ? currentControlTowerHeartbeat() : null;
  const unitCodes = actor.canSeeAllUnits ? HOSPITAL_UNITS.map((unit) => unit.code) : actor.unitCodes;
  if (!unitCodes.length) return emptySnapshot(actor);

  const staticUnits = HOSPITAL_UNITS.filter((unit) => unitCodes.includes(unit.code)).map((unit) => ({ ...unit, active: true }));
  const [persistedUnitRows, ticketRows, taskRows, callRows, eventRows, approvalRows, jobRows, recentSecurity, staffRows, membershipRows, auditRows, facilityRows, capacityRows, transferRows, shiftRows, reportRows, agentStatus] = await Promise.all([
    safeQuery(db.select().from(hospitalUnits).where(and(eq(hospitalUnits.active, true), inArray(hospitalUnits.code, unitCodes))).orderBy(asc(hospitalUnits.name)), staticUnits),
    safeQuery(db.select().from(tickets).where(inArray(tickets.unitCode, unitCodes)).orderBy(desc(tickets.updatedAt)).limit(200), []),
    safeQuery(db.select().from(operationalTasks).where(inArray(operationalTasks.unitCode, unitCodes)).orderBy(desc(operationalTasks.updatedAt)).limit(200), []),
    safeQuery(db.select().from(callSessions).where(inArray(callSessions.unitCode, unitCodes)).orderBy(desc(callSessions.lastMessageAt)).limit(50), []),
    safeQuery(db.select().from(automationEvents).where(inArray(automationEvents.unitCode, unitCodes)).orderBy(desc(automationEvents.createdAt)).limit(80), []),
    safeQuery(db.select().from(approvals).where(inArray(approvals.unitCode, unitCodes)).orderBy(desc(approvals.createdAt)).limit(50), []),
    safeQuery(db.select().from(workflowJobs).orderBy(desc(workflowJobs.createdAt)).limit(100), []),
    actor.role === "security_officer" || actor.role === "operations_manager"
      ? safeQuery(db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(25), [])
      : Promise.resolve([]),
    actor.role === "operations_manager"
      ? safeQuery(db.select().from(staffAccounts).where(eq(staffAccounts.active, true)).orderBy(asc(staffAccounts.displayLabel)), [])
      : safeQuery(db.select().from(staffAccounts).where(eq(staffAccounts.email, actor.email)).limit(1), []),
    actor.role === "operations_manager"
      ? safeQuery(db.select().from(unitMemberships).where(eq(unitMemberships.active, true)), [])
      : safeQuery(db.select().from(unitMemberships).where(and(eq(unitMemberships.email, actor.email), eq(unitMemberships.active, true))), []),
    actor.role === "operations_manager" || actor.role === "privacy_officer" || actor.role === "security_officer"
      ? safeQuery(db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100), [])
      : Promise.resolve([]),
    safeQuery(db.select().from(facilities).where(eq(facilities.status, "operational")).orderBy(asc(facilities.name)), []),
    safeQuery(db.select().from(capacitySnapshots).where(inArray(capacitySnapshots.unitCode, unitCodes)).orderBy(asc(capacitySnapshots.facilityCode), asc(capacitySnapshots.unitCode)), []),
    safeQuery(db.select().from(transferRequests).where(inArray(transferRequests.requestedUnitCode, unitCodes)).orderBy(desc(transferRequests.updatedAt)).limit(120), []),
    safeQuery(db.select().from(staffShifts).where(inArray(staffShifts.unitCode, unitCodes)).orderBy(asc(staffShifts.facilityCode), asc(staffShifts.unitCode)), []),
    safeQuery(db.select().from(reportAssignments).orderBy(asc(reportAssignments.title)), []),
    safeQuery(getAutomationAgentStatus(db), {
      state: "waiting" as const,
      lastRunAt: null,
      lastSuccessfulRunAt: null,
      lastRunSucceeded: false,
      lastCycleStatus: null,
      ageSeconds: null,
      heartbeatWindowSeconds: 180,
      latestSource: null,
      latestEventType: null,
      jobs: { queued: 0, completed: 0, deadLetter: 0 },
    }),
  ]);
  const callReferences = callRows.map((call) => call.reference);
  const messageRows = callReferences.length
    ? await safeQuery(db.select().from(callMessages).where(inArray(callMessages.callReference, callReferences)).orderBy(asc(callMessages.sequence)), [])
    : [];
  const ticketReferences = ticketRows.map((ticket) => ticket.reference);
  const visibleTicketReferences = new Set(ticketReferences);
  const visibleJobRows = actor.canSeeAllUnits
    ? jobRows
    : jobRows.filter((job) => Boolean(job.ticketReference && visibleTicketReferences.has(job.ticketReference)));
  const historyRows = ticketReferences.length
    ? await safeQuery(db.select().from(ticketEvents).where(inArray(ticketEvents.ticketReference, ticketReferences)).orderBy(desc(ticketEvents.createdAt)).limit(300), [])
    : [];

  const queueByUnit = new Map<string, number>();
  taskRows.filter((task) => !["completed", "cancelled"].includes(task.status)).forEach((task) => queueByUnit.set(task.unitCode, (queueByUnit.get(task.unitCode) || 0) + 1));
  const persistedUnits = new Map(persistedUnitRows.map((unit) => [unit.code, unit]));
  const unitRows = staticUnits.map((unit) => ({ ...unit, ...(persistedUnits.get(unit.code) || {}) }));
  const visibleFacilityCodes = new Set(capacityRows.map((row) => row.facilityCode));
  const visibleFacilities = facilityRows.filter((facility) => actor.canSeeAllUnits || visibleFacilityCodes.has(facility.code));
  const capacitySummary = {
    total: capacityRows.reduce((sum, row) => sum + row.total, 0),
    occupied: capacityRows.reduce((sum, row) => sum + row.occupied, 0),
    reserved: capacityRows.reduce((sum, row) => sum + row.reserved, 0),
    available: capacityRows.reduce((sum, row) => sum + availableCapacity(row), 0),
    blocked: capacityRows.reduce((sum, row) => sum + row.blocked + row.cleaning, 0),
    dischargeForecast: capacityRows.reduce((sum, row) => sum + row.dischargeForecast, 0),
    incoming: capacityRows.reduce((sum, row) => sum + row.incoming, 0),
    outgoing: capacityRows.reduce((sum, row) => sum + row.outgoing, 0),
    transfersOpen: transferRows.filter((row) => !["completed", "auto_rejected"].includes(row.status)).length,
    autoAccepted: transferRows.filter((row) => ["auto_accepted", "auto_rerouted", "scheduled", "transport_assigned", "in_transit", "completed"].includes(row.status)).length,
    autoRejected: transferRows.filter((row) => row.status === "auto_rejected").length,
    checking: transferRows.filter((row) => ["received", "checking"].includes(row.status)).length,
  };
  const reportResult = {
    generatedAt: new Date().toISOString(),
    facilities: visibleFacilities.length,
    resources: capacityRows.length,
    available: capacitySummary.available,
    dischargeForecast: capacitySummary.dischargeForecast,
    transfersOpen: capacitySummary.transfersOpen,
    autoAccepted: capacitySummary.autoAccepted,
    autoRejected: capacitySummary.autoRejected,
    activeTasks: taskRows.filter((item) => !["completed", "cancelled"].includes(item.status)).length,
    activeShifts: shiftRows.filter((item) => item.status === "active").length,
    handoffs: shiftRows.filter((item) => item.status === "handoff").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    identity: { label: actor.label, role: actor.role, unitCodes: actor.unitCodes, canSeeAllUnits: actor.canSeeAllUnits },
    units: unitRows.map((unit) => ({ ...unit, queue: queueByUnit.get(unit.code) || 0, assignedRole: findUnit(unit.code).assignedRole })),
    tickets: ticketRows.map((ticket) => ({ ...ticket, task: taskRows.find((task) => task.ticketReference === ticket.reference) || null, history: historyRows.filter((event) => event.ticketReference === ticket.reference).reverse() })),
    tasks: taskRows,
    calls: callRows.map((call) => ({ ...call, messages: messageRows.filter((message) => message.callReference === call.reference), task: taskRows.find((task) => task.callReference === call.reference) || null })),
    events: eventRows,
    approvals: approvalRows,
    jobs: summarizeJobs(visibleJobRows),
    automation: {
      pilot,
      controlTower,
      agent: {
        state: agentStatus.state,
        lastRunAt: agentStatus.lastRunAt,
        lastSuccessfulRunAt: agentStatus.lastSuccessfulRunAt,
        lastRunSucceeded: agentStatus.lastRunSucceeded,
        lastCycleStatus: agentStatus.lastCycleStatus,
        lastActor: agentStatus.latestSource,
        ageSeconds: agentStatus.ageSeconds,
        heartbeatWindowSeconds: agentStatus.heartbeatWindowSeconds,
        trigger: "scheduled-worker-or-signed-n8n-webhook",
      },
      connectors: automationConnectorStatus(),
    },
    facilities: visibleFacilities,
    capacity: capacityRows.map((row) => ({ ...row, available: availableCapacity(row) })),
    capacitySummary,
    transfers: transferRows.map((row) => ({ ...row, alternatives: safeJsonArray(row.alternatives) })),
    shifts: shiftRows,
    reports: reportRows
      .filter((row) => actor.canSeeAllUnits || row.scopeType === "network" || Boolean(row.unitCode && unitCodes.includes(row.unitCode)))
      .map((row) => ({
        ...row,
        scopeType: actor.canSeeAllUnits ? row.scopeType : "unit",
        result: actor.canSeeAllUnits ? safeJsonObject(row.resultJson) : reportResult,
      })),
    security: recentSecurity,
    staff: staffRows.map((account) => ({
      accountKey: account.email,
      displayLabel: account.displayLabel,
      systemRole: account.systemRole,
      active: account.active,
      lastSeenAt: account.lastSeenAt,
      memberships: membershipRows.filter((membership) => membership.email === account.email).map((membership) => ({ unitCode: membership.unitCode, unitRole: membership.unitRole, canManageTickets: membership.canManageTickets, canReadCalls: membership.canReadCalls })),
    })),
    audit: auditRows,
  };
}

async function safeQuery<T>(query: Promise<T>, fallback: T): Promise<T> {
  try { return await query; } catch { return fallback; }
}

export function taskStatusFromTicket(status: string) {
  if (status === "Çözüldü") return "completed";
  if (status === "Kabul edildi" || status === "İşlemde" || status === "Personele aktarıldı") return "accepted";
  return "queued";
}

function summarizeJobs(rows: Array<{ status: string }>) {
  return {
    queued: rows.filter((row) => row.status === "queued" || row.status === "running").length,
    completed: rows.filter((row) => row.status === "completed").length,
    deadLetter: rows.filter((row) => row.status === "dead_letter").length,
  };
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function safeJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function emptySnapshot(actor: RequestActor) {
  return {
    generatedAt: new Date().toISOString(),
    identity: { label: actor.label, role: actor.role, unitCodes: [], canSeeAllUnits: false },
    units: [], tickets: [], tasks: [], calls: [], events: [], approvals: [], jobs: { queued: 0, completed: 0, deadLetter: 0 },
    automation: { pilot: null, controlTower: null, agent: { state: "waiting", lastRunAt: null, lastSuccessfulRunAt: null, lastRunSucceeded: false, lastCycleStatus: null, lastActor: null, ageSeconds: null, heartbeatWindowSeconds: 180, trigger: "scheduled-worker-or-signed-n8n-webhook" }, connectors: automationConnectorStatus() }, facilities: [], capacity: [],
    capacitySummary: { total: 0, occupied: 0, reserved: 0, available: 0, blocked: 0, dischargeForecast: 0, incoming: 0, outgoing: 0, transfersOpen: 0, autoAccepted: 0, autoRejected: 0, checking: 0 },
    transfers: [], shifts: [], reports: [], security: [], staff: [], audit: [],
  };
}
