// Hasta erişimi veri işlemleri: hekim yokluğu kaydı, onay sonrası uygulama, hasta yanıtı ve bildirim kuyruğu.
// Kurallar lib/patient-access.ts içindedir; burada yalnız veri tabanına yazılır ve denetim izi bırakılır.
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { getDb } from "../db";
import {
  appointmentChanges, appointments, approvals, facilities, integrationEvents, operationalTasks, patientNotifications, physicianAbsences, physicians,
} from "../db/schema";
import { appendAudit, auditStatements } from "./audit";
import { findUnit } from "./hospital-units";
import {
  ABSENCE_REASONS, MAX_ATTEMPTS, OPTION_LABEL, assertSafeMessage, chooseChannel, localDay, planAbsence, renderMessage, sendTime,
  type Appointment, type ChannelCode, type PatientResponse, type TemplateCode,
} from "./patient-access";
import { SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
const DAY = 86_400_000;
// D1 tek ifadede en fazla 100 bağlı parametre kabul eder; çok satırlı eklemeler parçalanır.
function chunks<T>(rows: T[], columns: number) { const size = Math.max(1, Math.floor(90 / columns)); const out: T[][] = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out; }
const ref = (prefix: string) => `${prefix}-${Date.now().toString(36).slice(-6).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

export function canHandlePatientContact(actor: RequestActor, unitCode: string) {
  return actor.canSeeAllUnits || actor.unitCodes.includes(unitCode) || (actor.role === "call_agent" && actor.unitCodes.includes("CAG"));
}

function toPlanAppointment(row: typeof appointments.$inferSelect): Appointment {
  let consent: ChannelCode[] = [];
  try { consent = JSON.parse(row.consentChannels) as ChannelCode[]; } catch { consent = []; }
  return {
    reference: row.reference, patientAlias: row.patientAlias, physicianCode: row.physicianCode, unitCode: row.unitCode, facilityCode: row.facilityCode,
    startsAt: row.startsAt.getTime(), status: row.status, clinicalPriority: row.clinicalPriority, allowOtherPhysician: row.allowOtherPhysician,
    preferredChannel: (row.preferredChannel as ChannelCode | null) ?? null, consentChannels: consent,
  };
}

type Stmt = Parameters<Db["batch"]>[0][number];
const isConflict = (error: unknown) => /UNIQUE|constraint/i.test(`${String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`);
// Kilit satırı: aynı işlem iki kez (çift tıklama, iki görevli, tekrar gelen mesaj) batch'e girerse birincil anahtar
// çakışır ve ikinci batch tamamen geri alınır. Böylece yarım veya mükerrer kayıt oluşmaz.
const lockStmt = (db: Db, key: string, type: string) => db.insert(integrationEvents).values({ eventId: key, source: "klinorbis", eventType: type, payloadHash: "-", status: "lock" });
async function commit(db: Db, statements: Stmt[], conflict: SecurityError) {
  try { return await db.batch(statements as [Stmt, ...Stmt[]]); }
  catch (error) { if (isConflict(error)) throw conflict; throw error; }
}

/** 1) Hekim yokluğu bildirilir: etkilenen randevular bulunur, plan çıkarılır, birim onayı açılır (tek işlem). */
export async function reportAbsence(db: Db, actor: RequestActor, input: { physicianCode: string; day: string; reason: string }) {
  if (!["operations_manager", "unit_manager", "clinician"].includes(actor.role)) throw new SecurityError(403, "Hekim yokluğunu birim sorumlusu, hekimin kendisi veya operasyon yöneticisi bildirir.", "ABSENCE_ROLE_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !Number.isFinite(Date.parse(input.day + "T00:00:00Z")) || new Date(input.day+"T00:00:00Z").toISOString().slice(0,10)!==input.day) throw new SecurityError(400, "Gün YYYY-AA-GG biçiminde olmalı.", "INVALID_INPUT");
  if (!(input.reason in ABSENCE_REASONS)) throw new SecurityError(400, "Yokluk nedeni listeden seçilmeli.", "INVALID_INPUT");
  if (input.day < localDay(Date.now())) throw new SecurityError(400, "Geçmiş bir gün için yokluk bildirilemez.", "INVALID_INPUT");
  const [physician] = await db.select().from(physicians).where(eq(physicians.code, input.physicianCode)).limit(1);
  if (!physician) throw new SecurityError(404, "Hekim bulunamadı.", "NOT_FOUND");
  if (!actor.canSeeAllUnits && !actor.unitCodes.includes(physician.unitCode)) throw new SecurityError(403, "Bu birimde yetkiniz yok.", "UNIT_FORBIDDEN");

  const dayStart = Date.parse(input.day + "T00:00:00Z") - 3 * 3_600_000; // İstanbul gece yarısı
  const horizon = dayStart + 21 * DAY;
  const unitPhysicians = await db.select().from(physicians).where(eq(physicians.unitCode, physician.unitCode));
  const codes = unitPhysicians.map((p) => p.code);
  const window = await db.select().from(appointments).where(and(
    inArray(appointments.physicianCode, codes),
    gte(appointments.startsAt, new Date(dayStart)), lt(appointments.startsAt, new Date(horizon)),
    inArray(appointments.status, ["scheduled", "confirmed", "offered", "rescheduled", "needs_action"]),
  ));
  const booked: Record<string, number> = {};
  for (const a of window) { const k = `${a.physicianCode}|${localDay(a.startsAt.getTime())}`; booked[k] = (booked[k] ?? 0) + 1; }
  const open = await db.select().from(physicianAbsences).where(and(inArray(physicianAbsences.physicianCode, codes), inArray(physicianAbsences.status, ["planned", "approved"])));
  if (open.some((a) => a.physicianCode === physician.code && a.day === input.day)) throw new SecurityError(409, "Bu hekim için bu güne açık bir yokluk kaydı zaten var.", "ABSENCE_EXISTS");
  const absentDays: Record<string, string[]> = {};
  for (const a of open) (absentDays[a.physicianCode] ??= []).push(a.day);
  (absentDays[physician.code] ??= []).push(input.day);
  // Başka açık planların önerdiği saatler de dolu sayılır.
  const reserved = await db.select({ physicianCode: appointmentChanges.proposedPhysicianCode, startsAt: appointmentChanges.proposedStartsAt }).from(appointmentChanges)
    .where(and(inArray(appointmentChanges.proposedPhysicianCode, codes), inArray(appointmentChanges.status, ["proposed", "offered", "accepted"])));

  const plan = planAbsence({
    physician: { ...physician, active: physician.active }, day: input.day,
    appointments: window.map(toPlanAppointment), physicians: unitPhysicians.map((p) => ({ ...p })), booked, absentDays,
    reservedSlots: reserved.filter((r) => r.physicianCode && r.startsAt).map((r) => ({ physicianCode: r.physicianCode!, startsAt: r.startsAt!.getTime() })),
  });
  const reference = ref("YOK");
  const now = new Date();
  const statements: Stmt[] = [
    db.insert(physicianAbsences).values({ reference, physicianCode: physician.code, unitCode: physician.unitCode, day: input.day, reason: input.reason, status: plan.length ? "planned" : "closed", affectedCount: plan.length, reportedBy: actor.email, createdAt: now, ...(plan.length ? {} : { decidedAt: now, decidedBy: "system" }) }),
  ];
  for (const part of chunks(plan, 12)) statements.push(db.insert(appointmentChanges).values(part.map((p) => ({
    absenceReference: reference, appointmentReference: p.appointmentReference, option: p.option,
    proposedPhysicianCode: p.physicianCode, proposedFacilityCode: p.facilityCode, proposedStartsAt: p.startsAt ? new Date(p.startsAt) : null,
    reason: p.reason, status: p.option === "clinical_review" ? "review" : "proposed", updatedAt: now,
  }))));
  for (const part of chunks(plan, 1)) statements.push(db.update(appointments).set({ status: "needs_action", updatedAt: now, version: sql`${appointments.version} + 1` }).where(inArray(appointments.reference, part.map(p => p.appointmentReference))));
  // Toplu değişiklik birim onayına gider; bildirimler onaydan önce çıkmaz.
  statements.push(db.insert(approvals).values({ reference: `ONAY-${reference}`, unitCode: physician.unitCode, approvalType: "absence_reschedule", status: plan.length ? "pending" : "approved", requestedBy: actor.email, createdAt: now, decidedAt: plan.length ? null : now, decidedBy: plan.length ? null : "system", decisionNote: plan.length ? null : "Etkilenen randevu yok." }));
  statements.push(...await auditStatements(db, [{ actor: actor.email, action: "absence.reported", resource: reference, detail: `physician:${physician.code}; day:${input.day}; reason:${input.reason}; affected:${plan.length}` }]));
  await commit(db, statements, new SecurityError(409, "Bu hekim için bu güne açık bir yokluk kaydı var ya da önerilen saatlerden biri başka bir planla çakıştı. Sayfayı yenileyip tekrar deneyin.", "ABSENCE_CONFLICT"));
  return { reference, approvalReference: `ONAY-${reference}`, plan };
}

/**
 * 2) Onay kararı. Onaylar rotası bu ifadeleri onay kaydıyla aynı batch'te çalıştırır: onay, yokluk durumu,
 * öneriler, randevular, bildirim kuyruğu, arama görevleri ve denetim izi birlikte yazılır ya da hiçbiri yazılmaz.
 */
export async function absenceDecisionStatements(db: Db, actor: RequestActor, absenceReference: string, decision: "approve" | "reject") {
  const [absence] = await db.select().from(physicianAbsences).where(eq(physicianAbsences.reference, absenceReference)).limit(1);
  if (!absence || absence.status !== "planned") throw new SecurityError(409, "Yokluk planı onay bekleyen durumda değil.", "APPROVAL_STATE_CHANGED");
  const now = new Date();
  const changes = await db.select().from(appointmentChanges).where(eq(appointmentChanges.absenceReference, absenceReference));
  const refs = changes.map((c) => c.appointmentReference);
  const statements: Stmt[] = [lockStmt(db, `absence-decision:${absenceReference}`, "lock.absence_decision")];
  if (decision === "reject") {
    statements.push(db.update(physicianAbsences).set({ status: "rejected", decidedBy: actor.email, decidedAt: now }).where(and(eq(physicianAbsences.reference, absenceReference), eq(physicianAbsences.status, "planned"))));
    for (const part of chunks(refs, 1)) statements.push(db.update(appointments).set({ status: "scheduled", updatedAt: now }).where(and(inArray(appointments.reference, part), eq(appointments.status, "needs_action"))));
    statements.push(db.update(appointmentChanges).set({ status: "cancelled", updatedAt: now }).where(eq(appointmentChanges.absenceReference, absenceReference)));
    statements.push(...await auditStatements(db, [{ actor: actor.email, action: "absence.rejected", resource: absenceReference }]));
    return { statements, result: { offered: 0, review: 0, callbacks: 0 } };
  }
  statements.push(db.update(physicianAbsences).set({ status: "approved", decidedBy: actor.email, decidedAt: now }).where(and(eq(physicianAbsences.reference, absenceReference), eq(physicianAbsences.status, "planned"))));
  const rows: (typeof appointments.$inferSelect)[] = []; for (const part of chunks(refs, 1)) rows.push(...await db.select().from(appointments).where(inArray(appointments.reference, part)));
  const docs = await db.select().from(physicians).where(eq(physicians.unitCode, absence.unitCode));
  const facs = await db.select().from(facilities);
  let offered = 0, review = 0, callbacks = 0;
  for (const change of changes) {
    const appt = rows.find((r) => r.reference === change.appointmentReference);
    if (!appt) continue;
    const plan = toPlanAppointment(appt);
    const hoursUntil = (appt.startsAt.getTime() - now.getTime()) / 3_600_000;
    const unit = findUnit(appt.unitCode);
    const template: TemplateCode = change.option === "clinical_review" ? "appointment_review" : change.option === "callback" ? "callback_planned" : "appointment_changed";
    const body = renderMessage(template, {
      reference: appt.reference, unitCode: appt.unitCode, unitLabel: unit.name,
      facilityLabel: facs.find((f) => f.code === (change.proposedFacilityCode ?? appt.facilityCode))?.name.replace(/ · Pilot$/, ""),
      physicianLabel: docs.find((d) => d.code === change.proposedPhysicianCode)?.displayLabel,
      startsAt: change.proposedStartsAt?.getTime() ?? null, oldStartsAt: appt.startsAt.getTime(),
    });
    const route = chooseChannel(plan, hoursUntil);
    statements.push(notificationInsert(db, { appointmentReference: appt.reference, patientAlias: appt.patientAlias, channel: route.channel ?? "phone", template, body, urgent: hoursUntil < 24, createdBy: actor.email, forceCall: route.channel === null }));
    if (route.alsoCall || change.option === "callback") {
      callbacks++;
      statements.push(db.insert(operationalTasks).values({ reference: `ARA-${change.id}-${appt.reference}`, unitCode: "CAG", assignedRole: "Çağrı Merkezi Görevlisi", sourceType: "appointment", status: "queued", priority: hoursUntil < 24 ? "Yüksek" : "Normal", dueAt: new Date(now.getTime() + Math.max(15, Math.min(240, hoursUntil * 30)) * 60_000), createdAt: now, updatedAt: now }).onConflictDoNothing());
    }
    if (change.option === "clinical_review") {
      review++;
      statements.push(db.insert(operationalTasks).values({ reference: `HKM-${change.id}-${appt.reference}`, unitCode: appt.unitCode, assignedRole: unit.assignedRole, sourceType: "appointment_review", status: "queued", priority: "Yüksek", dueAt: new Date(now.getTime() + 4 * 3_600_000), createdAt: now, updatedAt: now }).onConflictDoNothing());
      continue;
    }
    offered++;
    statements.push(db.update(appointmentChanges).set({ status: "offered", updatedAt: now }).where(eq(appointmentChanges.id, change.id)));
    statements.push(db.update(appointments).set({ status: "offered", updatedAt: now, version: sql`${appointments.version} + 1` }).where(eq(appointments.reference, appt.reference)));
  }
  statements.push(...await auditStatements(db, [{ actor: actor.email, action: "absence.approved", resource: absenceReference, detail: `offered:${offered}; review:${review}; callbacks:${callbacks}` }]));
  return { statements, result: { offered, review, callbacks } };
}

/** Tek başına karar (onay kaydı olmadan çağrılırsa); kilit ve tüm değişiklikler tek batch. */
export async function decideAbsence(db: Db, actor: RequestActor, absenceReference: string, decision: "approve" | "reject") {
  const { statements, result } = await absenceDecisionStatements(db, actor, absenceReference, decision);
  await commit(db, statements, new SecurityError(409, "Bu yokluk planı başka bir işlemle karara bağlandı.", "APPROVAL_STATE_CHANGED"));
  return result;
}

function notificationInsert(db: Db, n: { appointmentReference?: string | null; ticketReference?: string | null; patientAlias: string; channel: ChannelCode; template: TemplateCode; body: string; urgent: boolean; createdBy: string; forceCall?: boolean }) {
  const now = Date.now();
  const after = sendTime(now, n.urgent);
  return db.insert(patientNotifications).values({
    reference: ref("BLG"), appointmentReference: n.appointmentReference ?? null, ticketReference: n.ticketReference ?? null, patientAlias: n.patientAlias,
    channel: n.forceCall ? "phone" : n.channel, template: n.template, body: assertSafeMessage(n.body),
    status: n.forceCall || n.channel === "phone" ? "call_task" : after > now ? "held" : "queued",
    sendAfter: new Date(after), createdBy: n.createdBy, createdAt: new Date(now),
  });
}

export async function queueNotification(db: Db, n: Parameters<typeof notificationInsert>[1]) {
  await notificationInsert(db, n);
}

/** 3) Klinik öncelikli randevu: hekim karar verir (başka hekim / ileri tarih / görevli arasın). Tek işlem. */
export async function decideReview(db: Db, actor: RequestActor, input: { changeId: number; physicianCode?: string; startsAt?: number; callback?: boolean }) {
  if (actor.role !== "clinician") throw new SecurityError(403, "Klinik öncelikli randevuya yalnız hekim karar verir.", "REVIEW_ROLE_REQUIRED");
  const [change] = await db.select().from(appointmentChanges).where(eq(appointmentChanges.id, input.changeId)).limit(1);
  if (!change || change.status !== "review") throw new SecurityError(409, "Bu randevu hekim değerlendirmesi beklemiyor.", "REVIEW_STATE_CHANGED");
  const [absence] = await db.select().from(physicianAbsences).where(eq(physicianAbsences.reference, change.absenceReference)).limit(1);
  if (!absence || absence.status !== "approved") throw new SecurityError(409, "Önce yokluk planı onaylanmalı.", "ABSENCE_NOT_APPROVED");
  const [appt] = await db.select().from(appointments).where(eq(appointments.reference, change.appointmentReference)).limit(1);
  if (!appt) throw new SecurityError(404, "Randevu bulunamadı.", "NOT_FOUND");
  if (!actor.canSeeAllUnits && !actor.unitCodes.includes(appt.unitCode)) throw new SecurityError(403, "Bu birimde yetkiniz yok.", "UNIT_FORBIDDEN");
  const now = new Date();
  const statements: Stmt[] = [lockStmt(db, `change-review:${change.id}`, "lock.change_review")];
  if (input.callback) {
    statements.push(db.update(appointmentChanges).set({ option: "callback", status: "offered", reason: "Hekim: hasta öncelikli aranıp planlansın.", respondedBy: actor.email, updatedAt: now }).where(and(eq(appointmentChanges.id, change.id), eq(appointmentChanges.status, "review"))));
  } else {
    const [doc] = input.physicianCode ? await db.select().from(physicians).where(eq(physicians.code, input.physicianCode)).limit(1) : [];
    if (!doc || doc.unitCode !== appt.unitCode || doc.code === absence.physicianCode) throw new SecurityError(400, "Aynı branştan başka bir hekim seçin.", "INVALID_INPUT");
    const startsAt = Number(input.startsAt);
    if (!Number.isFinite(startsAt) || startsAt < now.getTime()) throw new SecurityError(400, "Gelecekte bir zaman seçin.", "INVALID_INPUT");
    const [busy] = await db.select({ reference: appointments.reference }).from(appointments).where(and(eq(appointments.physicianCode, doc.code), eq(appointments.startsAt, new Date(startsAt)), inArray(appointments.status, ["scheduled", "confirmed", "offered", "rescheduled", "needs_action"]))).limit(1);
    if (busy) throw new SecurityError(409, "Seçilen hekimin bu saatinde başka randevu var.", "SLOT_TAKEN");
    statements.push(db.update(appointmentChanges).set({ option: "substitute_same_day", proposedPhysicianCode: doc.code, proposedFacilityCode: doc.facilityCode, proposedStartsAt: new Date(startsAt), status: "offered", reason: "Hekim değerlendirmesiyle belirlendi.", respondedBy: actor.email, updatedAt: now }).where(and(eq(appointmentChanges.id, change.id), eq(appointmentChanges.status, "review"))));
    const fac = (await db.select().from(facilities).where(eq(facilities.code, doc.facilityCode)).limit(1))[0];
    statements.push(notificationInsert(db, { appointmentReference: appt.reference, patientAlias: appt.patientAlias, channel: chooseChannel(toPlanAppointment(appt), (startsAt - now.getTime()) / 3_600_000).channel ?? "phone", template: "appointment_changed", body: renderMessage("appointment_changed", { reference: appt.reference, unitCode: appt.unitCode, unitLabel: findUnit(appt.unitCode).name, facilityLabel: fac?.name.replace(/ · Pilot$/, ""), physicianLabel: doc.displayLabel, startsAt, oldStartsAt: appt.startsAt.getTime() }), urgent: false, createdBy: actor.email }));
  }
  statements.push(db.update(appointments).set({ status: "offered", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
  statements.push(...await auditStatements(db, [{ actor: actor.email, action: "appointment.review_decided", resource: appt.reference, detail: input.callback ? "callback" : `physician:${input.physicianCode}` }]));
  await commit(db, statements, new SecurityError(409, "Bu karar başka bir işlemle verildi ya da seçilen saat başka bir plana önerildi.", "REVIEW_STATE_CHANGED"));
}

/** 4) Hastanın yanıtı: görevli telefonda kaydeder veya mesaj yanıt kodundan gelir. Tek işlem; aynı yanıt iki kez işlenmez. */
export async function recordResponse(db: Db, actor: { email: string }, input: { changeId: number; response: PatientResponse }) {
  const [change] = await db.select().from(appointmentChanges).where(eq(appointmentChanges.id, input.changeId)).limit(1);
  if (!change) throw new SecurityError(404, "Değişiklik kaydı bulunamadı.", "NOT_FOUND");
  if (change.status !== "offered") throw new SecurityError(409, "Bu öneri yanıt beklemiyor.", "CHANGE_STATE_CHANGED");
  const [appt] = await db.select().from(appointments).where(eq(appointments.reference, change.appointmentReference)).limit(1);
  if (!appt) throw new SecurityError(404, "Randevu bulunamadı.", "NOT_FOUND");
  if (!PATIENT_RESPONSES_LIST.includes(input.response)) throw new SecurityError(400, "Geçersiz hasta yanıtı.", "INVALID_INPUT");
  const now = new Date();
  // Kilit: aynı öneri + aynı deneme sayısı için yalnız bir yanıt işlenir.
  const statements: Stmt[] = [lockStmt(db, `change-response:${change.id}:${change.attempts}`, "lock.change_response")];
  const claim = (status: string, extra: Partial<typeof appointmentChanges.$inferInsert> = {}) =>
    db.update(appointmentChanges).set({ status, respondedBy: actor.email, updatedAt: now, ...extra })
      .where(and(eq(appointmentChanges.id, change.id), eq(appointmentChanges.status, "offered"), eq(appointmentChanges.attempts, change.attempts)));
  const plan = toPlanAppointment(appt);
  const facs = await db.select().from(facilities);
  let closesChange = true;
  if (input.response === "accepted") {
    if (change.option === "callback" || !change.proposedStartsAt) throw new SecurityError(400, "Bu kayıtta önerilen zaman yok; görevli yeni zamanı HBYS'de açıp hastaya bildirir.", "NO_PROPOSAL");
    statements.push(claim("accepted"));
    if (!appt.training) {
      statements.push(db.update(appointments).set({ status: "needs_action", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
      statements.push(db.insert(operationalTasks).values({ reference: `HBYS-TEYIT-${change.id}`, unitCode: appt.unitCode, assignedRole: "Randevu görevlisi", sourceType: "calendar_confirmation", status: "queued", priority: "Yüksek", dueAt: new Date(now.getTime() + 3600000) }).onConflictDoNothing());
    } else {
      statements.push(db.update(appointments).set({ status: "rescheduled", physicianCode: change.proposedPhysicianCode ?? appt.physicianCode, facilityCode: change.proposedFacilityCode ?? appt.facilityCode, startsAt: change.proposedStartsAt, updatedAt: now, version: sql`${appointments.version} + 1` }).where(eq(appointments.reference, appt.reference)));
      const startsAt = change.proposedStartsAt.getTime();
      statements.push(notificationInsert(db, { appointmentReference: appt.reference, patientAlias: appt.patientAlias, channel: chooseChannel(plan, 48).channel ?? "phone", template: "appointment_confirmed", body: renderMessage("appointment_confirmed", { reference: appt.reference, startsAt, facilityLabel: facs.find(f => f.code === (change.proposedFacilityCode ?? appt.facilityCode))?.name.replace(/ · Pilot$/, "") }), urgent: false, createdBy: actor.email }));
    }
  } else if (input.response === "declined") {
    statements.push(claim("declined"));
    statements.push(db.update(appointments).set({ status: "needs_action", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
    statements.push(db.insert(operationalTasks).values({ reference: `ARA-RED-${change.id}`, unitCode: "CAG", assignedRole: "Çağrı Merkezi Görevlisi", sourceType: "appointment", status: "queued", priority: "Normal", dueAt: new Date(now.getTime() + 4 * 3_600_000), createdAt: now, updatedAt: now }).onConflictDoNothing());
  } else if (input.response === "cancelled") {
    statements.push(claim("cancelled"));
    if (!appt.training) {
      statements.push(db.update(appointments).set({ status: "needs_action", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
      statements.push(db.insert(operationalTasks).values({ reference: `HBYS-IPTAL-${change.id}`, unitCode: appt.unitCode, assignedRole: "Randevu görevlisi", sourceType: "calendar_cancellation", status: "queued", priority: "Yüksek", dueAt: new Date(now.getTime() + 3600000) }).onConflictDoNothing());
    } else {
      statements.push(db.update(appointments).set({ status: "cancelled", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
      statements.push(notificationInsert(db, { appointmentReference: appt.reference, patientAlias: appt.patientAlias, channel: chooseChannel(plan, 48).channel ?? "phone", template: "appointment_cancelled", body: renderMessage("appointment_cancelled", { reference: appt.reference }), urgent: false, createdBy: actor.email }));
    }
  } else {
    const attempts = change.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      statements.push(claim("unreachable", { attempts }));
      statements.push(db.update(appointments).set({ status: "needs_action", updatedAt: now }).where(eq(appointments.reference, appt.reference)));
    } else {
      closesChange = false;
      statements.push(db.update(appointmentChanges).set({ attempts, respondedBy: actor.email, updatedAt: now })
        .where(and(eq(appointmentChanges.id, change.id), eq(appointmentChanges.status, "offered"), eq(appointmentChanges.attempts, change.attempts))));
    }
  }
  statements.push(...await auditStatements(db, [{ actor: actor.email, action: `appointment.response.${input.response}`, resource: appt.reference, detail: `change:${change.id}; option:${change.option}` }]));
  // Tüm öneriler sonuçlandıysa yokluk kaydı aynı işlemde kapanır.
  if (closesChange) statements.push(db.update(physicianAbsences).set({ status: "closed" }).where(and(
    eq(physicianAbsences.reference, change.absenceReference), eq(physicianAbsences.status, "approved"),
    sql`not exists (select 1 from appointment_changes where absence_reference = ${change.absenceReference} and status in ('proposed','offered','review'))`,
  )));
  await commit(db, statements, new SecurityError(409, "Bu öneri başka bir işlemle güncellendi.", "CHANGE_STATE_CHANGED"));
}
const PATIENT_RESPONSES_LIST: PatientResponse[] = ["accepted", "declined", "cancelled", "unreachable"];

/**
 * 5) Bildirim kuyruğu. SMS/WhatsApp sağlayıcısı bağlı değilse gerçek gönderim yapılmaz:
 * eğitim kayıtları "simülasyon" olarak işaretlenir, gerçek kayıtlar çağrı merkezi görevine düşer.
 * Böylece "gönderildi" görünüp hastaya ulaşmayan mesaj olmaz.
 */
export async function dispatchNotifications(db: Db, actor: { email: string; role?: string; canSeeAllUnits?: boolean; unitCodes?: string[] }, providerConfigured = false) {
  const now = new Date();
  const due = await db.select().from(patientNotifications).where(and(inArray(patientNotifications.status, ["queued", "held"]), lte(patientNotifications.sendAfter, now))).limit(50);
  let simulated = 0, toCall = 0;
  for (const n of due) {
    const [appt] = n.appointmentReference ? await db.select().from(appointments).where(eq(appointments.reference, n.appointmentReference)).limit(1) : [];
    if(actor.role && !actor.canSeeAllUnits && !(actor.role === "call_agent" && actor.unitCodes?.includes("CAG")) && (!appt || !actor.unitCodes?.includes(appt.unitCode))) continue;
    const training = appt?.training ?? false;
    if (providerConfigured) continue; // gerçek sağlayıcı adaptörü burada çağrılır (bkz. docs/ISLEYIS-MODELI.md)
    if (training) {
      await db.update(patientNotifications).set({ status: "simulated", provider: "simulation", attempts: n.attempts + 1, sentAt: now }).where(and(eq(patientNotifications.id, n.id), inArray(patientNotifications.status, ["queued", "held"])));
      simulated++;
    } else {
      await db.update(patientNotifications).set({ status: "call_task", attempts: n.attempts + 1, lastError: "Mesaj sağlayıcısı bağlı değil; hasta telefonla aranacak." }).where(eq(patientNotifications.id, n.id));
      await db.insert(operationalTasks).values({ reference: `ARA-${n.reference}`, unitCode: "CAG", assignedRole: "Çağrı Merkezi Görevlisi", sourceType: "notification", status: "queued", priority: "Normal", dueAt: new Date(now.getTime() + 2 * 3_600_000), createdAt: now, updatedAt: now }).onConflictDoNothing();
      toCall++;
    }
  }
  if (due.length) await appendAudit(db, { actor: actor.email, action: "notifications.dispatched", resource: "patient_notifications", detail: `simulated:${simulated}; call:${toCall}` });
  return { processed: due.length, simulated, toCall };
}

/** Eğitim senaryosu: sentetik hekim ve randevular (gerçek kişi yok; takma kodlar). */
export async function ensureAppointmentSeed(db: Db) {
  const [any] = await db.select({ reference: appointments.reference }).from(appointments).limit(1);
  if (any) return;
  const docs = [
    { code: "KRD-H01", displayLabel: "Kardiyoloji Hekimi 1", unitCode: "KRD", facilityCode: "F01", dailyCapacity: 6 },
    { code: "KRD-H02", displayLabel: "Kardiyoloji Hekimi 2", unitCode: "KRD", facilityCode: "F01", dailyCapacity: 6 },
    { code: "KRD-H03", displayLabel: "Kardiyoloji Hekimi 3", unitCode: "KRD", facilityCode: "F02", dailyCapacity: 6 },
    { code: "ORT-H01", displayLabel: "Ortopedi Hekimi 1", unitCode: "ORT", facilityCode: "F02", dailyCapacity: 8 },
    { code: "ORT-H02", displayLabel: "Ortopedi Hekimi 2", unitCode: "ORT", facilityCode: "F02", dailyCapacity: 8 },
  ];
  await db.insert(physicians).values(docs.map((d) => ({ ...d, training: true }))).onConflictDoNothing();
  // İlk iş günü 09:00'dan itibaren; KRD-H01'in günü dolu, H02 kısmen dolu.
  let day = Date.now() + DAY;
  while ([0, 6].includes(new Date(day + 3 * 3_600_000).getUTCDay())) day += DAY;
  const base = Date.parse(localDay(day) + "T09:00:00Z") - 3 * 3_600_000;
  const slot = (i: number) => new Date(base + i * 30 * 60_000);
  const rows: (typeof appointments.$inferInsert)[] = [
    ["EGT-HST-101", "KRD-H01", 0, false, true, "sms", ["sms", "phone"]],
    ["EGT-HST-102", "KRD-H01", 1, true, false, "phone", ["phone"]],
    ["EGT-HST-103", "KRD-H01", 2, false, true, "whatsapp", ["whatsapp", "phone"]],
    ["EGT-HST-104", "KRD-H01", 3, false, false, "sms", ["sms"]],
    ["EGT-HST-105", "KRD-H01", 4, false, true, null, []],
    ["EGT-HST-106", "KRD-H01", 5, false, false, "email", ["email", "sms"]],
    ["EGT-HST-201", "KRD-H02", 0, false, false, "sms", ["sms"]],
    ["EGT-HST-202", "KRD-H02", 1, false, false, "sms", ["sms"]],
    ["EGT-HST-301", "ORT-H01", 0, false, true, "sms", ["sms", "phone"]],
  ].map(([alias, doc, i, clinical, other, pref, consent], n) => {
    const d = docs.find((x) => x.code === doc)!;
    return { reference: `RDV-EGT-${100 + n}`, patientAlias: String(alias), physicianCode: d.code, unitCode: d.unitCode, facilityCode: d.facilityCode, startsAt: slot(Number(i)), clinicalPriority: Boolean(clinical), allowOtherPhysician: Boolean(other), preferredChannel: (pref as string | null), consentChannels: JSON.stringify(consent), contactMasked: (consent as string[]).length ? `5** *** 4${n} ${10 + n * 7}` : null, source: "Eğitim", training: true };
  });
  for (const part of chunks(rows, 17)) await db.insert(appointments).values(part).onConflictDoNothing();
}

export { OPTION_LABEL };
