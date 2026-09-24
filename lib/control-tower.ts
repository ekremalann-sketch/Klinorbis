import { and, asc, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import {
  automationEvents,
  capacitySnapshots,
  facilities,
  integrationEvents,
  operationalTasks,
  reportAssignments,
  staffShifts,
  ticketEvents,
  tickets,
  transferRequests,
  workflowJobs,
} from "../db/schema";
import { appendAudit } from "./audit";
import { findUnit } from "./hospital-units";

type Db = ReturnType<typeof getDb>;

export const PILOT_FACILITIES = [
  { code: "F01", name: "Merkez Eğitim Kampüsü · Pilot", campusType: "3. basamak eğitim kampüsü", city: "İzmir", totalBeds: 620 },
  { code: "F02", name: "Şehir Hastanesi Kampüsü · Pilot", campusType: "bölgesel şehir kampüsü", city: "İzmir", totalBeds: 900 },
  { code: "F03", name: "Kadın ve Çocuk Kampüsü · Pilot", campusType: "kadın-doğum ve çocuk kampüsü", city: "İzmir", totalBeds: 380 },
  { code: "F04", name: "FTR ve Rehabilitasyon Kampüsü · Pilot", campusType: "rehabilitasyon kampüsü", city: "İzmir", totalBeds: 180 },
] as const;

const CAPACITY_SEED = [
  ["F01", "YOG", "ICU_BED", "Yoğun bakım yatağı", 24, 20, 1, 0, 1, 24, 2],
  ["F01", "KOR", "CCU_BED", "Koroner yoğun bakım yatağı", 18, 15, 1, 0, 0, 18, 2],
  ["F01", "KVC", "WARD_BED", "Kalp-damar cerrahisi yatağı", 32, 27, 1, 1, 1, 31, 3],
  ["F01", "AML", "OR_ROOM", "Ameliyathane salonu", 12, 8, 1, 1, 0, 11, 0],
  ["F01", "TRF", "TRANSFER_SLOT", "Saatlik transfer slotu", 18, 10, 2, 0, 0, 16, 0],
  ["F01", "ULS", "TRANSPORT_TEAM", "Hasta transport ekibi", 9, 6, 1, 0, 0, 9, 0],
  ["F01", "CTM", "TURNOVER_TEAM", "Oda dönüş ekibi", 14, 9, 1, 0, 0, 13, 0],
  ["F01", "TBR", "DISCHARGE_SLOT", "Bugünkü taburculuk planı", 42, 25, 4, 0, 0, 40, 13],
  ["F02", "YOG", "ICU_BED", "Yoğun bakım yatağı", 40, 37, 1, 1, 0, 39, 1],
  ["F02", "ORT", "WARD_BED", "Ortopedi servis yatağı", 64, 51, 3, 1, 2, 62, 8],
  ["F02", "KRD", "WARD_BED", "Kardiyoloji servis yatağı", 52, 45, 2, 0, 1, 51, 5],
  ["F02", "AML", "OR_ROOM", "Ameliyathane salonu", 18, 13, 2, 0, 1, 17, 0],
  ["F02", "TRF", "TRANSFER_SLOT", "Saatlik transfer slotu", 24, 17, 2, 0, 0, 23, 0],
  ["F02", "ULS", "TRANSPORT_TEAM", "Hasta transport ekibi", 12, 9, 1, 0, 0, 12, 0],
  ["F02", "CTM", "TURNOVER_TEAM", "Oda dönüş ekibi", 20, 15, 1, 0, 0, 19, 0],
  ["F02", "TBR", "DISCHARGE_SLOT", "Bugünkü taburculuk planı", 70, 46, 7, 0, 0, 68, 19],
  ["F03", "NEO", "NICU_BED", "Yenidoğan yoğun bakım yatağı", 36, 34, 1, 0, 1, 36, 1],
  ["F03", "KDH", "WARD_BED", "Kadın-doğum servis yatağı", 58, 48, 2, 1, 1, 57, 6],
  ["F03", "CDH", "WARD_BED", "Çocuk servis yatağı", 70, 59, 3, 0, 1, 68, 7],
  ["F03", "AML", "OR_ROOM", "Ameliyathane salonu", 10, 7, 1, 0, 0, 10, 0],
  ["F03", "TRF", "TRANSFER_SLOT", "Saatlik transfer slotu", 12, 8, 1, 0, 0, 12, 0],
  ["F03", "TBR", "DISCHARGE_SLOT", "Bugünkü taburculuk planı", 40, 26, 3, 0, 0, 39, 9],
  ["F04", "FTR", "REHAB_BED", "Rehabilitasyon yatağı", 120, 91, 5, 2, 1, 116, 12],
  ["F04", "ULS", "TRANSPORT_TEAM", "Hasta transport ekibi", 6, 4, 0, 0, 0, 6, 0],
  ["F04", "TBR", "DISCHARGE_SLOT", "Bugünkü taburculuk planı", 26, 16, 2, 0, 0, 25, 6],
] as const;

const SHIFT_SEED = [
  ["F01", "YOG", "Yoğun Bakım Sorumlu Rolü"], ["F01", "KOR", "Koroner Yoğun Bakım Rolü"],
  ["F01", "KVC", "Kalp Damar Cerrahisi Birim Rolü"], ["F01", "TRF", "Transfer Merkezi Koordinatörü"],
  ["F01", "TBR", "Taburculuk Koordinasyon Rolü"], ["F01", "ULS", "Hasta Transport Rolü"],
  ["F02", "YOG", "Yoğun Bakım Sorumlu Rolü"], ["F02", "ORT", "Ortopedi Birim Rolü"],
  ["F02", "KRD", "Kardiyoloji Birim Rolü"], ["F02", "TRF", "Transfer Merkezi Koordinatörü"],
  ["F02", "CTM", "Çevre Hizmetleri Rolü"], ["F02", "TBR", "Taburculuk Koordinasyon Rolü"],
  ["F03", "NEO", "Yenidoğan Yoğun Bakım Rolü"], ["F03", "KDH", "Kadın Doğum Birim Rolü"],
  ["F03", "CDH", "Pediatri Birim Rolü"], ["F03", "TRF", "Transfer Merkezi Koordinatörü"],
  ["F04", "FTR", "FTR Birim Rolü"], ["F04", "ULS", "Hasta Transport Rolü"],
] as const;

const REPORT_SEED = [
  ["RPT-NETWORK", "NETWORK_SUMMARY", "Hastane ağı operasyon özeti", "network", null, null, "Operasyon Yöneticisi", "Her 20 saniye · pilot", "dashboard+csv"],
  ["RPT-CAPACITY", "CAPACITY", "Kapasite, yatak ve kaynak uygunluğu", "network", null, "YTK", "Yatak Yönetim Koordinatörü", "Her 20 saniye · pilot", "dashboard+csv"],
  ["RPT-TRANSFER", "TRANSFER", "Sevk ve otomatik karar sonuçları", "network", null, "TRF", "Transfer Merkezi Koordinatörü", "Her 20 saniye · pilot", "dashboard+csv"],
  ["RPT-DISCHARGE", "DISCHARGE", "Taburculuk tahmini ve darboğazlar", "network", null, "TBR", "Taburculuk Koordinasyon Rolü", "Her 20 saniye · pilot", "dashboard+csv"],
  ["RPT-SHIFT", "SHIFT", "Vardiya, devir ve birim kapsaması", "network", null, null, "Operasyon Yöneticisi", "Her 20 saniye · pilot", "dashboard+csv"],
  ["RPT-AUTOMATION", "AUTOMATION", "Otomasyon, retry ve karantina", "network", null, null, "Bilgi Teknolojileri", "Her 20 saniye · pilot", "dashboard+csv"],
] as const;

const TRANSFER_BASELINE = [
  ["XFR-PILOT-001", "KRM-PİLOT-01", "Kurum-A", "F01", "YOG", "ICU_BED", "Yoğun bakım yatağı", "Acil", "auto_accepted", "capacity_available", "Kapasite ön kabulü otomatik verildi; klinik uygunluk kararı ayrı yetkili süreçtedir."],
  ["XFR-PILOT-002", "KRM-PİLOT-02", "Kurum-B", "F03", "NEO", "NICU_BED", "Yenidoğan yoğun bakım yatağı", "Acil", "auto_rejected", "capacity_unavailable", "Güvenli kullanılabilir kaynak yok; kabul verilmedi ve alternatif ağı tarandı."],
  ["XFR-PILOT-003", "KRM-PİLOT-03", "Kurum-C", "F02", "ORT", "WARD_BED", "Ortopedi servis yatağı", "Yüksek", "scheduled", "capacity_available", "Kapasite ayrıldı; transport ve varış penceresi otomatik planlandı."],
  ["XFR-PILOT-004", "KRM-PİLOT-04", "Kurum-D", "F01", "KVC", "WARD_BED", "Kalp-damar cerrahisi yatağı", "Yüksek", "checking", null, "Kaynak, personel ve blokaj verileri kontrol ediliyor."],
  ["XFR-PILOT-005", "KRM-PİLOT-05", "Kurum-E", "F02", "YOG", "ICU_BED", "Yoğun bakım yatağı", "Acil", "auto_rerouted", "alternate_capacity", "İlk hedef dolu; uygun kaynak bulunan alternatif kampüse otomatik yönlendirildi."],
  ["XFR-PILOT-006", "KRM-PİLOT-06", "Kurum-F", "F04", "FTR", "REHAB_BED", "Rehabilitasyon yatağı", "Normal", "auto_accepted", "capacity_available", "Uygun kaynak ve vardiya kapsaması doğrulandı."],
] as const;

type TransferScenario = {
  code: string;
  patientAlias: string;
  sourceFacilityCode: string;
  targetFacilityCode: string;
  unitCode: string;
  resourceCode: string;
  resourceLabel: string;
  priority: "Normal" | "Yüksek" | "Acil";
  requestedCount: number;
};

const LIVE_TRANSFER_SCENARIOS: TransferScenario[] = [
  { code: "ICU", patientAlias: "KRM-CANLI-ICU", sourceFacilityCode: "Kurum-G", targetFacilityCode: "F01", unitCode: "YOG", resourceCode: "ICU_BED", resourceLabel: "Yoğun bakım yatağı", priority: "Acil", requestedCount: 1 },
  { code: "ORT", patientAlias: "KRM-CANLI-ORT", sourceFacilityCode: "Kurum-H", targetFacilityCode: "F02", unitCode: "ORT", resourceCode: "WARD_BED", resourceLabel: "Ortopedi servis yatağı", priority: "Yüksek", requestedCount: 1 },
  { code: "NEO", patientAlias: "KRM-CANLI-NEO", sourceFacilityCode: "Kurum-I", targetFacilityCode: "F03", unitCode: "NEO", resourceCode: "NICU_BED", resourceLabel: "Yenidoğan yoğun bakım yatağı", priority: "Acil", requestedCount: 1 },
  { code: "KRD", patientAlias: "KRM-CANLI-KRD", sourceFacilityCode: "Kurum-J", targetFacilityCode: "F02", unitCode: "KRD", resourceCode: "WARD_BED", resourceLabel: "Kardiyoloji servis yatağı", priority: "Yüksek", requestedCount: 1 },
  { code: "FTR", patientAlias: "KRM-CANLI-FTR", sourceFacilityCode: "Kurum-K", targetFacilityCode: "F04", unitCode: "FTR", resourceCode: "REHAB_BED", resourceLabel: "Rehabilitasyon yatağı", priority: "Normal", requestedCount: 1 },
  { code: "KVC", patientAlias: "KRM-CANLI-KVC", sourceFacilityCode: "Kurum-L", targetFacilityCode: "F01", unitCode: "KVC", resourceCode: "WARD_BED", resourceLabel: "Kalp-damar cerrahisi yatağı", priority: "Yüksek", requestedCount: 1 },
];

const STEP_MS = 6_000;
const STEP_COUNT = 10;
const CYCLE_MS = STEP_MS * STEP_COUNT;
const REPORT_INTERVAL_MS = 20_000;

export type ControlTowerHeartbeat = {
  enabled: true;
  disclosure: "Kimliksiz sistemler arası pilot verisi";
  runReference: string;
  transferReference: string;
  ticketReference: string;
  scenarioCode: string;
  sourceFacilityCode: string;
  targetFacilityCode: string;
  unitCode: string;
  step: number;
  totalSteps: number;
  stepLabel: string;
  nextStepAt: string;
  engine: "KLINORBIS Capacity Orchestrator";
};

export async function ensureControlTowerBaseline(db: Db, at = new Date()) {
  const seedState = globalThis as typeof globalThis & { __KLINORBIS_CONTROL_TOWER_SEEDED?: boolean };
  if (seedState.__KLINORBIS_CONTROL_TOWER_SEEDED) return;
  await db.insert(facilities).values(PILOT_FACILITIES.map((facility) => ({ ...facility, training: true, updatedAt: at }))).onConflictDoNothing();
  const capacitySeedRows = CAPACITY_SEED.map(([facilityCode, unitCode, resourceCode, resourceLabel, total, occupied, reserved, blocked, cleaning, staffed, dischargeForecast]) => ({
    facilityCode, unitCode, resourceCode, resourceLabel, total, occupied, reserved, blocked, cleaning, staffed,
    dischargeForecast, incoming: 0, outgoing: 0, status: capacityState({ total, occupied, reserved, blocked, cleaning, staffed }), training: true, updatedAt: at,
  }));
  for (let index = 0; index < capacitySeedRows.length; index += 4) {
    await db.insert(capacitySnapshots).values(capacitySeedRows.slice(index, index + 4)).onConflictDoNothing();
  }

  const shiftWindow = currentShiftWindow(at);
  for (const [index, [facilityCode, unitCode, role]] of SHIFT_SEED.entries()) {
    await db.insert(staffShifts).values({
      reference: `SHF-${facilityCode}-${unitCode}-${String(index + 1).padStart(2, "0")}`,
      staffLabel: `Pilot vardiya ekibi ${String(index + 1).padStart(2, "0")}`,
      facilityCode, unitCode, role, shiftCode: shiftWindow.code,
      status: index % 9 === 4 ? "handoff" : index % 7 === 3 ? "break" : "active",
      handoffTo: index % 9 === 4 ? `Pilot vardiya ekibi ${String(((index + 1) % SHIFT_SEED.length) + 1).padStart(2, "0")}` : null,
      training: true, startedAt: shiftWindow.startedAt, endsAt: shiftWindow.endsAt, updatedAt: at,
    }).onConflictDoUpdate({
      target: staffShifts.reference,
      set: { shiftCode: shiftWindow.code, startedAt: shiftWindow.startedAt, endsAt: shiftWindow.endsAt, updatedAt: at },
    });
  }

  for (const [reference, reportCode, title, scopeType, facilityCode, unitCode, assignedRole, schedule, delivery] of REPORT_SEED) {
    await db.insert(reportAssignments).values({
      reference, reportCode, title, scopeType, facilityCode, unitCode, assignedRole, schedule, delivery,
      status: "active", resultJson: "{}", training: true, nextRunAt: new Date(at.getTime() + REPORT_INTERVAL_MS), createdAt: at, updatedAt: at,
    }).onConflictDoNothing();
  }

  for (const [index, [reference, patientAlias, sourceFacilityCode, targetFacilityCode, requestedUnitCode, resourceCode, resourceLabel, priority, status, decisionCode, decisionDetail]] of TRANSFER_BASELINE.entries()) {
    const ticketReference = `S2S-${reference}`;
    const unit = findUnit(requestedUnitCode);
    const createdAt = new Date(at.getTime() - (TRANSFER_BASELINE.length - index) * 4 * 60_000);
    await db.insert(transferRequests).values({
      reference, patientAlias, sourceFacilityCode, targetFacilityCode, requestedUnitCode, resourceCode, resourceLabel,
      requestedCount: 1, priority, status, decisionCode, decisionDetail, alternatives: "[]", ticketReference, training: true,
      createdAt, decidedAt: decisionCode ? new Date(createdAt.getTime() + 40_000) : null, updatedAt: new Date(createdAt.getTime() + 55_000),
    }).onConflictDoNothing();
    const inserted = await db.insert(tickets).values({
      reference: ticketReference, patientAlias, subject: `${sourceFacilityCode} → ${targetFacilityCode} · ${resourceLabel} sistemler arası koordinasyonu`,
      maskedSubject: `${sourceFacilityCode} → ${targetFacilityCode} · ${resourceLabel} sistemler arası koordinasyonu`, detectedPii: "[]",
      urgencyLevel: priority === "Acil" ? 5 : priority === "Yüksek" ? 4 : 2, humanApprovalRequired: false,
      unit: unit.name, unitCode: unit.code, assignedRole: "Kapasite Karar Motoru", acceptedBy: status === "checking" ? null : "capacity-orchestrator",
      acceptedAt: status === "checking" ? null : new Date(createdAt.getTime() + 40_000), priority,
      status: transferTicketStatus(status), channel: "Sistemler Arası · Pilot", createdAt, updatedAt: new Date(createdAt.getTime() + 55_000),
      slaDueAt: new Date(createdAt.getTime() + unit.slaMinutes * 60_000),
    }).onConflictDoNothing().returning({ reference: tickets.reference });
    if (!inserted.length) continue;
    await db.insert(operationalTasks).values({
      reference: `TSK-${ticketReference}`, ticketReference, unitCode: unit.code, assignedRole: "Kapasite Karar Motoru",
      assignedUser: status === "checking" ? null : "capacity-orchestrator", sourceType: "system_transfer", status: transferTaskStatus(status), priority,
      dueAt: new Date(createdAt.getTime() + unit.slaMinutes * 60_000), acceptedBy: status === "checking" ? null : "capacity-orchestrator",
      acceptedAt: status === "checking" ? null : new Date(createdAt.getTime() + 40_000), createdAt, updatedAt: new Date(createdAt.getTime() + 55_000),
    }).onConflictDoNothing();
    await db.insert(ticketEvents).values({
      ticketReference, eventType: "capacity_baseline", actor: "capacity-orchestrator", toUnitCode: unit.code,
      detail: `${statusLabel(status)} · ${decisionDetail}`, createdAt,
    });
  }
  seedState.__KLINORBIS_CONTROL_TOWER_SEEDED = true;
}

export async function advanceControlTower(db: Db, at = new Date()): Promise<ControlTowerHeartbeat> {
  await ensureControlTowerBaseline(db, at);
  const cycle = Math.floor(at.getTime() / CYCLE_MS);
  const cycleStartedAt = cycle * CYCLE_MS;
  const scenario = LIVE_TRANSFER_SCENARIOS[Math.abs(cycle) % LIVE_TRANSFER_SCENARIOS.length];
  const step = Math.min(STEP_COUNT - 1, Math.floor((at.getTime() - cycleStartedAt) / STEP_MS));
  const suffix = Math.abs(cycle).toString(36).toUpperCase().padStart(7, "0");
  const runReference = `CTL-${scenario.code}-${suffix}`;
  const transferReference = `XFR-${suffix}`;
  const ticketReference = `S2S-${suffix}`;

  for (let index = 0; index <= step; index += 1) {
    await applyControlStep(db, scenario, { index, runReference, transferReference, ticketReference, stepAt: new Date(cycleStartedAt + index * STEP_MS) });
  }
  await runScheduledReports(db, at);
  await refreshShiftTelemetry(db, at);

  return {
    enabled: true,
    disclosure: "Kimliksiz sistemler arası pilot verisi",
    runReference, transferReference, ticketReference, scenarioCode: scenario.code,
    sourceFacilityCode: scenario.sourceFacilityCode, targetFacilityCode: scenario.targetFacilityCode, unitCode: scenario.unitCode,
    step, totalSteps: STEP_COUNT, stepLabel: controlStepLabel(step), nextStepAt: new Date(cycleStartedAt + (step + 1) * STEP_MS).toISOString(),
    engine: "KLINORBIS Capacity Orchestrator",
  };
}

export function currentControlTowerHeartbeat(at = new Date()): ControlTowerHeartbeat {
  const cycle = Math.floor(at.getTime() / CYCLE_MS);
  const cycleStartedAt = cycle * CYCLE_MS;
  const scenario = LIVE_TRANSFER_SCENARIOS[Math.abs(cycle) % LIVE_TRANSFER_SCENARIOS.length];
  const step = Math.min(STEP_COUNT - 1, Math.floor((at.getTime() - cycleStartedAt) / STEP_MS));
  const suffix = Math.abs(cycle).toString(36).toUpperCase().padStart(7, "0");
  return {
    enabled: true,
    disclosure: "Kimliksiz sistemler arası pilot verisi",
    runReference: `CTL-${scenario.code}-${suffix}`,
    transferReference: `XFR-${suffix}`,
    ticketReference: `S2S-${suffix}`,
    scenarioCode: scenario.code,
    sourceFacilityCode: scenario.sourceFacilityCode,
    targetFacilityCode: scenario.targetFacilityCode,
    unitCode: scenario.unitCode,
    step,
    totalSteps: STEP_COUNT,
    stepLabel: controlStepLabel(step),
    nextStepAt: new Date(cycleStartedAt + (step + 1) * STEP_MS).toISOString(),
    engine: "KLINORBIS Capacity Orchestrator",
  };
}

async function applyControlStep(
  db: Db,
  scenario: TransferScenario,
  state: { index: number; runReference: string; transferReference: string; ticketReference: string; stepAt: Date },
) {
  const eventId = `${state.runReference}:step:${state.index}`;
  const claimed = await db.insert(integrationEvents).values({
    eventId, source: "klinorbis-capacity-orchestrator", eventType: `capacity.step.${state.index}`,
    payloadHash: `${scenario.code}:${state.index}`, status: "running", receivedAt: state.stepAt,
  }).onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
  if (!claimed.length) return;
  try {
    await executeControlStep(db, scenario, state);
    await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
  } catch (error) {
    await db.delete(integrationEvents).where(eq(integrationEvents.eventId, eventId));
    throw error;
  }
}

async function executeControlStep(
  db: Db,
  scenario: TransferScenario,
  state: { index: number; runReference: string; transferReference: string; ticketReference: string; stepAt: Date },
) {
  const unit = findUnit(scenario.unitCode);
  const taskReference = `TSK-${state.ticketReference}`;

  if (state.index === 0) {
    await db.insert(transferRequests).values({
      reference: state.transferReference, patientAlias: scenario.patientAlias, sourceFacilityCode: scenario.sourceFacilityCode,
      targetFacilityCode: scenario.targetFacilityCode, requestedUnitCode: scenario.unitCode, resourceCode: scenario.resourceCode,
      resourceLabel: scenario.resourceLabel, requestedCount: scenario.requestedCount, priority: scenario.priority, status: "received",
      alternatives: "[]", ticketReference: state.ticketReference, training: true, createdAt: state.stepAt, updatedAt: state.stepAt,
    }).onConflictDoNothing();
    await db.insert(tickets).values({
      reference: state.ticketReference, patientAlias: scenario.patientAlias,
      subject: `${scenario.sourceFacilityCode} → ${scenario.targetFacilityCode} · ${scenario.resourceLabel} sistemler arası talebi`,
      maskedSubject: `${scenario.sourceFacilityCode} → ${scenario.targetFacilityCode} · ${scenario.resourceLabel} sistemler arası talebi`, detectedPii: "[]",
      urgencyLevel: scenario.priority === "Acil" ? 5 : scenario.priority === "Yüksek" ? 4 : 2, humanApprovalRequired: false,
      unit: unit.name, unitCode: unit.code, assignedRole: "Kapasite Karar Motoru", priority: scenario.priority, status: "Sistem talebi alındı",
      channel: "Sistemler Arası · Pilot", createdAt: state.stepAt, updatedAt: state.stepAt,
      slaDueAt: new Date(state.stepAt.getTime() + unit.slaMinutes * 60_000),
    }).onConflictDoNothing();
    await db.insert(operationalTasks).values({
      reference: taskReference, ticketReference: state.ticketReference, unitCode: unit.code, assignedRole: "Kapasite Karar Motoru",
      sourceType: "system_transfer", status: "queued", priority: scenario.priority,
      dueAt: new Date(state.stepAt.getTime() + unit.slaMinutes * 60_000), createdAt: state.stepAt, updatedAt: state.stepAt,
    }).onConflictDoNothing();
  }

  if (state.index === 1) {
    await db.update(transferRequests).set({ status: "checking", decisionDetail: "Kapasite, vardiya, blokaj, temizlik ve rezervasyon verileri birlikte kontrol ediliyor.", updatedAt: state.stepAt }).where(eq(transferRequests.reference, state.transferReference));
    await db.update(tickets).set({ status: "Otomatik kontrol", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
  }

  if (state.index === 2) {
    await decideCapacity(db, scenario, state);
  }

  if (state.index === 3) {
    const [request] = await db.select().from(transferRequests).where(eq(transferRequests.reference, state.transferReference)).limit(1);
    if (request?.status === "auto_rejected") await rerouteToAlternative(db, request, state.stepAt);
    else if (request?.status === "auto_accepted") {
      await db.update(transferRequests).set({ status: "scheduled", decisionDetail: `${request.decisionDetail} Transfer ve kaynak rezervasyonu otomatik planlandı.`, updatedAt: state.stepAt }).where(eq(transferRequests.reference, request.reference));
      await db.update(operationalTasks).set({ status: "in_progress", updatedAt: state.stepAt }).where(eq(operationalTasks.ticketReference, state.ticketReference));
      await db.update(tickets).set({ status: "Otomatik planlandı", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
    }
  }

  if (state.index === 4) {
    const [request] = await db.select().from(transferRequests).where(eq(transferRequests.reference, state.transferReference)).limit(1);
    if (request && ["scheduled", "auto_rerouted", "auto_accepted"].includes(request.status)) {
      await db.update(transferRequests).set({ status: "transport_assigned", decisionDetail: `${request.decisionDetail || "Kapasite ayrıldı."} Transport penceresi ve hedef birim eşleştirildi.`, updatedAt: state.stepAt }).where(eq(transferRequests.reference, request.reference));
    }
  }

  if (state.index === 5) {
    const [request] = await db.select().from(transferRequests).where(eq(transferRequests.reference, state.transferReference)).limit(1);
    if (request && ["transport_assigned", "scheduled", "auto_rerouted"].includes(request.status)) {
      await db.update(transferRequests).set({ status: "in_transit", updatedAt: state.stepAt }).where(eq(transferRequests.reference, request.reference));
      await db.update(tickets).set({ status: "Sevk başladı", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
    }
  }

  if (state.index === 7) {
    const [request] = await db.select().from(transferRequests).where(eq(transferRequests.reference, state.transferReference)).limit(1);
    if (request?.status === "in_transit") {
      await db.update(transferRequests).set({ status: "completed", decisionDetail: `${request.decisionDetail || ""} Sistemler arası devir kapalı döngü teyidiyle tamamlandı.`.trim(), updatedAt: state.stepAt }).where(eq(transferRequests.reference, request.reference));
      await db.update(operationalTasks).set({ status: "completed", updatedAt: state.stepAt }).where(eq(operationalTasks.ticketReference, state.ticketReference));
      await db.update(tickets).set({ status: "Çözüldü", updatedAt: state.stepAt }).where(eq(tickets.reference, state.ticketReference));
      await db.update(capacitySnapshots).set({
        reserved: sql`max(0, ${capacitySnapshots.reserved} - ${request.requestedCount})`,
        occupied: sql`min(${capacitySnapshots.total}, ${capacitySnapshots.occupied} + ${request.requestedCount})`,
        incoming: sql`${capacitySnapshots.incoming} + ${request.requestedCount}`,
        updatedAt: state.stepAt,
      }).where(and(eq(capacitySnapshots.facilityCode, request.targetFacilityCode), eq(capacitySnapshots.unitCode, request.requestedUnitCode), eq(capacitySnapshots.resourceCode, request.resourceCode)));
    }
  }

  const outcome = await controlOutcome(db, scenario, state);
  await db.insert(automationEvents).values({
    ticketReference: state.ticketReference, rule: controlRule(state.index), outcome, unitCode: scenario.unitCode,
    eventType: "capacity_automation", actor: "capacity-orchestrator", createdAt: state.stepAt,
  });
  await db.insert(ticketEvents).values({
    ticketReference: state.ticketReference, eventType: `capacity_step_${state.index}`, actor: "capacity-orchestrator",
    toUnitCode: scenario.unitCode, detail: outcome, createdAt: state.stepAt,
  });
  await db.insert(workflowJobs).values({
    jobKey: `${state.runReference}:job:${state.index}`, ticketReference: state.ticketReference, ruleCode: "CAPACITY_DECISION",
    payload: JSON.stringify({ transferReference: state.transferReference, unitCode: scenario.unitCode, step: state.index, pilot: true }),
    idempotencyKey: `${state.runReference}:job:${state.index}`, correlationId: state.runReference, status: "queued", attempts: 0,
    maxAttempts: 3, nextRunAt: state.stepAt, createdAt: state.stepAt,
  }).onConflictDoNothing();
  await appendAudit(db, { actor: "capacity-orchestrator", action: `capacity.step.${state.index}`, resource: state.transferReference, detail: outcome });
}

async function decideCapacity(
  db: Db,
  scenario: TransferScenario,
  state: { transferReference: string; ticketReference: string; stepAt: Date },
) {
  const [target] = await db.select().from(capacitySnapshots).where(and(
    eq(capacitySnapshots.facilityCode, scenario.targetFacilityCode),
    eq(capacitySnapshots.unitCode, scenario.unitCode),
    eq(capacitySnapshots.resourceCode, scenario.resourceCode),
  )).limit(1);
  const alternatives = await db.select().from(capacitySnapshots).where(and(
    eq(capacitySnapshots.unitCode, scenario.unitCode), eq(capacitySnapshots.resourceCode, scenario.resourceCode),
  )).orderBy(asc(capacitySnapshots.facilityCode));
  const ranked = alternatives
    .map((row) => ({ facilityCode: row.facilityCode, available: availableCapacity(row) }))
    .filter((row) => row.facilityCode !== scenario.targetFacilityCode && row.available >= scenario.requestedCount)
    .sort((a, b) => b.available - a.available);
  const available = target ? availableCapacity(target) : 0;
  const accepted = Boolean(target && available >= scenario.requestedCount && target.status !== "unavailable");
  const detail = accepted
    ? `${scenario.targetFacilityCode} için ${available} güvenli kullanılabilir ${scenario.resourceLabel.toLocaleLowerCase("tr-TR")} bulundu. Kapasite ön kabulü otomatik verildi; klinik uygunluk kararı üretilmedi.`
    : `${scenario.targetFacilityCode} için güvenli kullanılabilir ${scenario.resourceLabel.toLocaleLowerCase("tr-TR")} yok. Kabul verilmedi${ranked.length ? `; ${ranked[0].facilityCode} alternatifi bulundu` : "; uygun alternatif bulunamadı"}.`;
  await db.update(transferRequests).set({
    status: accepted ? "auto_accepted" : "auto_rejected", decisionCode: accepted ? "capacity_available" : "capacity_unavailable",
    decisionDetail: detail, alternatives: JSON.stringify(ranked), decidedAt: state.stepAt, updatedAt: state.stepAt,
  }).where(eq(transferRequests.reference, state.transferReference));
  await db.update(tickets).set({
    status: accepted ? "Otomatik kabul" : "Kapasite yok", acceptedBy: "capacity-orchestrator", acceptedAt: state.stepAt, updatedAt: state.stepAt,
  }).where(eq(tickets.reference, state.ticketReference));
  await db.update(operationalTasks).set({
    status: accepted ? "accepted" : "completed", assignedUser: "capacity-orchestrator", acceptedBy: "capacity-orchestrator", acceptedAt: state.stepAt, updatedAt: state.stepAt,
  }).where(eq(operationalTasks.ticketReference, state.ticketReference));
  if (accepted && target) {
    await db.update(capacitySnapshots).set({ reserved: sql`${capacitySnapshots.reserved} + ${scenario.requestedCount}`, updatedAt: state.stepAt })
      .where(and(eq(capacitySnapshots.facilityCode, target.facilityCode), eq(capacitySnapshots.unitCode, target.unitCode), eq(capacitySnapshots.resourceCode, target.resourceCode)));
  }
}

async function rerouteToAlternative(db: Db, request: typeof transferRequests.$inferSelect, at: Date) {
  const alternatives = safeAlternatives(request.alternatives);
  const next = alternatives[0];
  if (!next) return;
  await db.update(capacitySnapshots).set({ reserved: sql`${capacitySnapshots.reserved} + ${request.requestedCount}`, updatedAt: at })
    .where(and(eq(capacitySnapshots.facilityCode, next.facilityCode), eq(capacitySnapshots.unitCode, request.requestedUnitCode), eq(capacitySnapshots.resourceCode, request.resourceCode)));
  const detail = `${request.targetFacilityCode} kapasitesi uygun değildi; ${next.facilityCode} kampüsündeki ${next.available} uygun kaynak doğrulandı ve talep otomatik yeniden yönlendirildi.`;
  await db.update(transferRequests).set({ targetFacilityCode: next.facilityCode, status: "auto_rerouted", decisionCode: "alternate_capacity", decisionDetail: detail, decidedAt: at, updatedAt: at }).where(eq(transferRequests.reference, request.reference));
  await db.update(tickets).set({ status: "Alternatife otomatik aktarıldı", acceptedBy: "capacity-orchestrator", acceptedAt: at, updatedAt: at }).where(eq(tickets.reference, request.ticketReference || ""));
  await db.update(operationalTasks).set({ status: "in_progress", assignedUser: "capacity-orchestrator", acceptedBy: "capacity-orchestrator", acceptedAt: at, updatedAt: at }).where(eq(operationalTasks.ticketReference, request.ticketReference || ""));
}

async function runScheduledReports(db: Db, at: Date) {
  const bucket = Math.floor(at.getTime() / REPORT_INTERVAL_MS);
  const eventId = `control-reports:${bucket}`;
  const claimed = await db.insert(integrationEvents).values({ eventId, source: "klinorbis-report-scheduler", eventType: "reports.refresh", payloadHash: String(bucket), status: "running", receivedAt: at })
    .onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
  if (!claimed.length) return;
  const [capacityRows, transfers, tasks, shifts] = await Promise.all([
    db.select().from(capacitySnapshots), db.select().from(transferRequests), db.select().from(operationalTasks), db.select().from(staffShifts),
  ]);
  const available = capacityRows.reduce((sum, row) => sum + availableCapacity(row), 0);
  const dischargeForecast = capacityRows.reduce((sum, row) => sum + row.dischargeForecast, 0);
  const result = {
    generatedAt: at.toISOString(), facilities: PILOT_FACILITIES.length, resources: capacityRows.length, available,
    dischargeForecast, transfersOpen: transfers.filter((item) => !["completed", "auto_rejected"].includes(item.status)).length,
    autoAccepted: transfers.filter((item) => ["auto_accepted", "auto_rerouted", "scheduled", "transport_assigned", "in_transit", "completed"].includes(item.status)).length,
    autoRejected: transfers.filter((item) => item.status === "auto_rejected").length,
    activeTasks: tasks.filter((item) => !["completed", "cancelled"].includes(item.status)).length,
    activeShifts: shifts.filter((item) => item.status === "active").length,
    handoffs: shifts.filter((item) => item.status === "handoff").length,
  };
  await db.update(reportAssignments).set({ resultJson: JSON.stringify(result), lastRunAt: at, nextRunAt: new Date(at.getTime() + REPORT_INTERVAL_MS), updatedAt: at }).where(eq(reportAssignments.status, "active"));
  await db.insert(automationEvents).values({ ticketReference: `REPORT-${bucket}`, rule: "Zamanlanmış rapor → kapsam hesabı → görevli rol", outcome: `${REPORT_SEED.length} rapor kalıcı veriden yenilendi`, unitCode: "KLT", eventType: "report_scheduler", actor: "report-scheduler", createdAt: at });
  await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
}

async function refreshShiftTelemetry(db: Db, at: Date) {
  const bucket = Math.floor(at.getTime() / 60_000);
  const eventId = `shift-telemetry:${bucket}`;
  const claimed = await db.insert(integrationEvents).values({ eventId, source: "klinorbis-shift-engine", eventType: "shift.refresh", payloadHash: String(bucket), status: "running", receivedAt: at })
    .onConflictDoNothing().returning({ eventId: integrationEvents.eventId });
  if (!claimed.length) return;
  const window = currentShiftWindow(at);
  const rotatingIndex = Math.abs(bucket) % SHIFT_SEED.length;
  for (const [index, [facilityCode, unitCode]] of SHIFT_SEED.entries()) {
    const status = index === rotatingIndex ? "handoff" : index === (rotatingIndex + 5) % SHIFT_SEED.length ? "break" : "active";
    await db.update(staffShifts).set({ shiftCode: window.code, status, handoffTo: status === "handoff" ? `Pilot vardiya ekibi ${String(((index + 1) % SHIFT_SEED.length) + 1).padStart(2, "0")}` : null, startedAt: window.startedAt, endsAt: window.endsAt, updatedAt: at })
      .where(and(eq(staffShifts.facilityCode, facilityCode), eq(staffShifts.unitCode, unitCode)));
  }
  await db.update(integrationEvents).set({ status: "completed" }).where(eq(integrationEvents.eventId, eventId));
}

export function availableCapacity(row: { total: number; occupied: number; reserved: number; blocked: number; cleaning: number; staffed: number }) {
  return Math.max(0, Math.min(row.total, row.staffed) - row.occupied - row.reserved - row.blocked - row.cleaning);
}

function capacityState(row: { total: number; occupied: number; reserved: number; blocked: number; cleaning: number; staffed: number }) {
  const available = availableCapacity(row);
  if (available <= 0) return "unavailable";
  if (available / Math.max(1, row.total) <= 0.1) return "critical";
  if (available / Math.max(1, row.total) <= 0.25) return "constrained";
  return "available";
}

function currentShiftWindow(at: Date) {
  const start = new Date(at);
  const hour = start.getUTCHours();
  const block = hour < 8 ? 0 : hour < 16 ? 8 : 16;
  start.setUTCHours(block, 0, 0, 0);
  const endsAt = new Date(start.getTime() + 8 * 60 * 60_000);
  return { code: `${String(block).padStart(2, "0")}-${String((block + 8) % 24).padStart(2, "0")}`, startedAt: start, endsAt };
}

function safeAlternatives(value: string): Array<{ facilityCode: string; available: number }> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is { facilityCode: string; available: number } => Boolean(item && typeof item === "object" && "facilityCode" in item && "available" in item)) : [];
  } catch { return []; }
}

function transferTaskStatus(status: string) {
  if (["auto_rejected", "completed"].includes(status)) return "completed";
  if (["scheduled", "auto_rerouted", "transport_assigned", "in_transit"].includes(status)) return "in_progress";
  if (status === "auto_accepted") return "accepted";
  return "queued";
}

function transferTicketStatus(status: string) {
  const labels: Record<string, string> = {
    received: "Sistem talebi alındı", checking: "Otomatik kontrol", auto_accepted: "Otomatik kabul",
    auto_rejected: "Kapasite yok", auto_rerouted: "Alternatife otomatik aktarıldı", scheduled: "Otomatik planlandı",
    transport_assigned: "Transport atandı", in_transit: "Sevk başladı", completed: "Çözüldü",
  };
  return labels[status] || status;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    received: "Sistem talebi alındı", checking: "Otomatik kontrol sürüyor", auto_accepted: "Kapasite ön kabulü verildi",
    auto_rejected: "Kapasite olmadığı için kabul edilmedi", auto_rerouted: "Alternatif kampüse yönlendirildi",
    scheduled: "Transfer planlandı", transport_assigned: "Transport atandı", in_transit: "Sevk sürüyor", completed: "Devir tamamlandı",
  };
  return labels[status] || status;
}

function controlRule(index: number) {
  return [
    "Kurum sistemi → sevk talebi", "Talep → kapasite matrisi", "Kapasite + vardiya + blokaj → otomatik karar",
    "Karar → kabul veya alternatif kampüs", "Kabul → transport ve varış penceresi", "Plan → sevk başlangıcı",
    "Sevk → kapalı döngü izleme", "Devir → kaynak ve görev kapanışı", "Sonuç → rapor metrikleri", "Döngü → sonraki sistem olayı",
  ][index] || "Kapasite otomasyon adımı";
}

function controlStepLabel(index: number) {
  return [
    "Kurumlar arası sevk talebi otomatik alındı", "Yatak, ekip, blokaj ve vardiya verileri kontrol ediliyor",
    "Kapasite kararı kural motorunda veriliyor", "Kabul veya alternatif hastane sonucu kaynak sisteme dönüyor",
    "Transport ve hedef birim eşleştiriliyor", "Sevk durumu sistemler arasında izleniyor",
    "Kapalı döngü teslim teyidi bekleniyor", "Devir tamamlandı; kaynak sayıları güncellendi",
    "Raporlar ve denetim izi yenileniyor", "Yeni sistemler arası talep döngüsü hazırlanıyor",
  ][index] || "Otomasyon ilerliyor";
}

async function controlOutcome(
  db: Db,
  scenario: TransferScenario,
  state: { index: number; transferReference: string; ticketReference: string },
) {
  const [request] = await db.select().from(transferRequests).where(eq(transferRequests.reference, state.transferReference)).limit(1);
  const current = request?.decisionDetail || statusLabel(request?.status || "received");
  const labels = [
    `${state.transferReference} otomatik operasyon kuyruğuna alındı`,
    `${scenario.targetFacilityCode} kapasite matrisi ve vardiya kapsaması taranıyor`,
    current,
    current,
    `${request?.targetFacilityCode || scenario.targetFacilityCode} için transport ve varış penceresi eşleştirildi`,
    "Kaynak ve hedef sistemlerde sevk durumu eşitlendi",
    "Kapalı döngü teslim teyidi izleniyor",
    request?.status === "completed" ? "Devir tamamlandı; kaynak rezervasyonu doluluğa dönüştürüldü" : current,
    "Operasyon raporları ve denetim izi güncellendi",
    "Sonraki kimliksiz sistem olayı hazır",
  ];
  return labels[state.index] || current;
}
