// Hasta süreç takibi: veritabanı işlemleri.
//  - Başvuru: hasta kabulde süreç açılır, hastaya takip kodu + 6 haneli PIN verilir (yalnız bir kez gösterilir).
//  - Her adım ilgili birimin kuyruğuna düşer; birim "Başla", "Tamamla", "Reddet / başka birime aktar" der.
//    Tamamlanınca hasta otomatik olarak sıradaki birime geçer ve o birime bildirim gider.
//  - Klinisyen muayene adımında tetkik/konsültasyon/yatış ekler; tetkikten sonra hasta aynı birime sonuç için döner.
//  - Her işlem tek batch'tir: sürüm kilidi + adımlar + olay + bildirim + denetim izi birlikte yazılır ya da hiçbiri.
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { patientJourneyEvents, patientJourneys, patientJourneySteps } from "../db/schema";
import { auditStatements } from "./audit";
import { notificationStatements, unitRecipients } from "./notifications";
import {
  ADDABLE_STEPS, canAddSteps, canCancelJourney, canOpenJourney, canViewJourney, canWorkStep, clinicOptions, isOverdue, JOURNEY_STATUS_TEXT,
  newPin, newTrackingCode, OPENING_UNITS, PATHWAYS, PATIENT_STATE_TEXT, pathwayByCode, planSteps, unitName, unitSla,
  type JourneyStatus, type StepState,
} from "./patient-journey";
import { HOSPITAL_UNITS } from "./hospital-units";
import { redactPII } from "./privacy";
import { cleanText, SecurityError, sha256, trackingKey, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
type StepRow = typeof patientJourneySteps.$inferSelect;
type JourneyRow = typeof patientJourneys.$inferSelect;

const t = (d: Date | null | undefined) => (d ? d.getTime() : null);
const reasonOf = (v: unknown, field = "Gerekçe") => redactPII(cleanText(v, field, 3, 300)).maskedText;
export const trackingHash = (code: string) => sha256(`takip|${trackingKey()}|${code}`);
const pinHash = (code: string, pin: string) => sha256(`pin|${trackingKey()}|${code}|${pin}`);

function newReference(now: Date) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const r = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `HS-${d}-${r}`;
}

async function stepsOf(db: Db, refs: string[]) {
  if (!refs.length) return new Map<string, StepRow[]>();
  const out = new Map<string, StepRow[]>();
  for (let i = 0; i < refs.length; i += 80) {
    const rows = await db.select().from(patientJourneySteps).where(inArray(patientJourneySteps.journeyReference, refs.slice(i, i + 80))).orderBy(asc(patientJourneySteps.seq));
    for (const r of rows) out.set(r.journeyReference, [...(out.get(r.journeyReference) ?? []), r]);
  }
  return out;
}

function stepView(s: StepRow, now: number) {
  const state = s.state as StepState;
  return { seq: s.seq, unitCode: s.unitCode, unitName: unitName(s.unitCode), label: s.label, kind: s.kind, optional: s.optional, state, enteredAt: t(s.enteredAt), startedAt: t(s.startedAt), finishedAt: t(s.finishedAt), note: s.note, rejectTo: s.rejectTo,
    overdue: isOverdue({ unitCode: s.unitCode, state, enteredAt: t(s.enteredAt) }, now), slaMinutes: unitSla(s.unitCode) };
}

function guardEvent(db: Db, j: { reference: string }, token: string, action: string, unitCode: string | null, actor: string, note: string | null, now: Date): Stmt {
  // Sürüm kilidi alınamadıysa journey_reference NULL olur ve NOT NULL kısıtı tüm batch'i geri alır.
  return db.insert(patientJourneyEvents).values({ journeyReference: sql<string>`(select reference from patient_journeys where reference = ${j.reference} and lock_token = ${token})`, action, unitCode, actor, note, at: now });
}

async function unitNotice(db: Db, unitCode: string, title: string, detail: string, key: string, now: Date) {
  return notificationStatements(db, await unitRecipients(db, unitCode), { kind: "task", title, detail, path: "/hasta-surecleri", key }, now);
}

// ————— Başvuru —————

export async function openJourney(db: Db, actor: RequestActor, body: Record<string, unknown>, now = new Date()) {
  if (!canOpenJourney(actor)) throw new SecurityError(403, "Süreci hasta kabul, acil servis, danışma veya çağrı merkezi açar.", "JOURNEY_OPEN_DENIED");
  const pathway = pathwayByCode(body.pathway);
  if (!pathway) throw new SecurityError(400, "Başvuru türü seçin.", "INVALID_INPUT");
  const clinicUnit = typeof body.clinicUnit === "string" ? body.clinicUnit.trim().toUpperCase().slice(0, 8) : "";
  let steps;
  try { steps = planSteps(pathway, clinicUnit); } catch (e) { throw new SecurityError(400, (e as Error).message, "INVALID_INPUT"); }
  // Takma ad: protokol/sıra numarası gibi kurum içi kısa kimlik. Ad-soyad, TCKN, telefon maskelenir.
  const alias = redactPII(cleanText(body.alias, "Hasta takma adı / protokol no", 2, 40)).maskedText;
  const code = newTrackingCode();
  const pin = newPin();
  const reference = newReference(now);
  const token = crypto.randomUUID();
  const first = steps[0];
  const stmts: Stmt[] = [
    db.insert(patientJourneys).values({ reference, trackingHash: await trackingHash(code), pinHash: await pinHash(code, pin), pathway: pathway.code, clinicUnit, patientAlias: alias, status: "active", currentSeq: 1, version: 1, createdBy: actor.email, createdAt: now, updatedAt: now, lockToken: token }),
    ...steps.map((s, i) => db.insert(patientJourneySteps).values({ journeyReference: reference, seq: i + 1, unitCode: s.unitCode, label: s.label, kind: "path", optional: s.optional, rejectTo: s.rejectTo, rejectLabel: s.rejectLabel, state: i === 0 ? "waiting" : "pending", enteredAt: i === 0 ? now : null })),
    guardEvent(db, { reference }, token, "opened", first.unitCode, actor.email, pathway.label, now),
    ...(await unitNotice(db, first.unitCode, `Yeni hasta: ${first.label}`, `${alias} · ${pathway.label}`, `journey:${reference}:1`, now)),
    ...(await auditStatements(db, [{ actor: actor.email, action: "journey.opened", resource: reference, detail: `${pathway.label} → ${unitName(clinicUnit)}` }])),
  ];
  await db.batch(stmts as [Stmt, ...Stmt[]]);
  return { reference, trackingCode: code, pin, firstUnit: unitName(first.unitCode), pathway: pathway.label };
}

// ————— Adım işlemleri —————

export type JourneyAction = "start" | "complete" | "skip" | "reject" | "add" | "cancel";

export async function actOnJourney(db: Db, actor: RequestActor, body: Record<string, unknown>, now = new Date()) {
  const reference = typeof body.reference === "string" ? body.reference.slice(0, 40) : "";
  const action = body.action as JourneyAction;
  const version = Number(body.version);
  const [j] = await db.select().from(patientJourneys).where(eq(patientJourneys.reference, reference)).limit(1);
  if (!j) throw new SecurityError(404, "Süreç bulunamadı.", "NOT_FOUND");
  const steps = (await stepsOf(db, [reference])).get(reference) ?? [];
  if (!canViewJourney(actor, steps.map((s) => s.unitCode))) throw new SecurityError(404, "Süreç bulunamadı.", "NOT_FOUND");
  if (j.status !== "active") throw new SecurityError(409, "Bu süreç kapanmış.", "JOURNEY_CLOSED");
  if (!Number.isInteger(version) || version !== j.version) throw new SecurityError(409, "Süreç başka biri tarafından güncellendi. Ekranı yenileyin.", "STALE_VERSION");
  const current = steps.find((s) => s.seq === j.currentSeq);
  if (!current) throw new SecurityError(409, "Sürecin aktif adımı bulunamadı.", "JOURNEY_STATE");

  const token = crypto.randomUUID();
  const lock = db.update(patientJourneys).set({ version: j.version + 1, lockToken: token, updatedAt: now }).where(and(eq(patientJourneys.reference, reference), eq(patientJourneys.version, j.version), eq(patientJourneys.status, "active")));
  const stmts: Stmt[] = [lock];
  const audit: { action: string; detail: string }[] = [];
  const advanceFrom = async (seq: number) => {
    const next = steps.filter((s) => s.seq > seq && s.state === "pending").sort((a, b) => a.seq - b.seq)[0];
    if (!next) {
      stmts.push(db.update(patientJourneys).set({ status: "completed", closedAt: now }).where(eq(patientJourneys.reference, reference)));
      audit.push({ action: "journey.completed", detail: "Tüm adımlar tamamlandı" });
      return null;
    }
    stmts.push(db.update(patientJourneySteps).set({ state: "waiting", enteredAt: now }).where(eq(patientJourneySteps.id, next.id)));
    stmts.push(db.update(patientJourneys).set({ currentSeq: next.seq }).where(eq(patientJourneys.reference, reference)));
    stmts.push(...(await unitNotice(db, next.unitCode, `Sıradaki hasta: ${next.label}`, `${j.patientAlias} · ${unitName(current.unitCode)} birimden geldi`, `journey:${reference}:${next.seq}:${now.getTime()}`, now)));
    return next;
  };

  let result: Record<string, unknown> = {};
  if (action === "start") {
    if (!canWorkStep(actor, current.unitCode)) throw new SecurityError(403, "Bu adım başka birimin işidir.", "UNIT_ACCESS_DENIED");
    if (current.state !== "waiting") throw new SecurityError(409, "Bu adım zaten başlatıldı.", "JOURNEY_STATE");
    stmts.push(db.update(patientJourneySteps).set({ state: "active", startedAt: now, actor: actor.email }).where(eq(patientJourneySteps.id, current.id)));
    stmts.push(guardEvent(db, j, token, "started", current.unitCode, actor.email, null, now));
    audit.push({ action: "journey.step_started", detail: `${unitName(current.unitCode)} · ${current.label}` });
  } else if (action === "complete" || action === "skip") {
    if (!canWorkStep(actor, current.unitCode)) throw new SecurityError(403, "Bu adım başka birimin işidir.", "UNIT_ACCESS_DENIED");
    let note: string | null = null;
    if (action === "skip") {
      if (!current.optional) throw new SecurityError(400, "Bu adım atlanamaz; gerekmiyorsa başka birime aktarın.", "STEP_REQUIRED");
      note = reasonOf(body.note);
    }
    stmts.push(db.update(patientJourneySteps).set({ state: action === "skip" ? "skipped" : "done", startedAt: current.startedAt ?? now, finishedAt: now, actor: actor.email, note }).where(eq(patientJourneySteps.id, current.id)));
    stmts.push(guardEvent(db, j, token, action === "skip" ? "skipped" : "completed", current.unitCode, actor.email, note, now));
    audit.push({ action: action === "skip" ? "journey.step_skipped" : "journey.step_completed", detail: `${unitName(current.unitCode)} · ${current.label}` });
    const next = await advanceFrom(current.seq);
    result = { next: next ? `${unitName(next.unitCode)} · ${next.label}` : "Süreç tamamlandı" };
  } else if (action === "reject") {
    if (!canWorkStep(actor, current.unitCode)) throw new SecurityError(403, "Bu adım başka birimin işidir.", "UNIT_ACCESS_DENIED");
    const note = reasonOf(body.note, "Ret / aktarım gerekçesi");
    const target = typeof body.targetUnit === "string" && body.targetUnit ? body.targetUnit.trim().toUpperCase().slice(0, 8) : current.rejectTo;
    if (!target || !HOSPITAL_UNITS.some((u) => u.code === target)) throw new SecurityError(400, "Hastanın aktarılacağı birimi seçin.", "INVALID_INPUT");
    if (target === current.unitCode) throw new SecurityError(400, "Hasta aynı birime aktarılamaz.", "INVALID_INPUT");
    const label = target === current.rejectTo && current.rejectLabel ? current.rejectLabel : `${unitName(current.unitCode)} biriminden yönlendirme`;
    stmts.push(db.update(patientJourneySteps).set({ state: "rejected", startedAt: current.startedAt ?? now, finishedAt: now, actor: actor.email, note }).where(eq(patientJourneySteps.id, current.id)));
    stmts.push(db.update(patientJourneySteps).set({ seq: sql`${patientJourneySteps.seq} + 1` }).where(and(eq(patientJourneySteps.journeyReference, reference), gt(patientJourneySteps.seq, current.seq))));
    stmts.push(db.insert(patientJourneySteps).values({ journeyReference: reference, seq: current.seq + 1, unitCode: target, label, kind: "redirect", state: "waiting", enteredAt: now }));
    stmts.push(db.update(patientJourneys).set({ currentSeq: current.seq + 1 }).where(eq(patientJourneys.reference, reference)));
    stmts.push(guardEvent(db, j, token, "rejected", current.unitCode, actor.email, note, now));
    stmts.push(...(await unitNotice(db, target, `Aktarılan hasta: ${label}`, `${j.patientAlias} · ${note}`, `journey:${reference}:redirect:${now.getTime()}`, now)));
    audit.push({ action: "journey.step_rejected", detail: `${unitName(current.unitCode)} → ${unitName(target)}` });
    result = { next: `${unitName(target)} · ${label}` };
  } else if (action === "add") {
    if (!canAddSteps(actor, current.unitCode)) throw new SecurityError(403, "Tetkik, konsültasyon veya yatış adımını yalnız bu birimin klinisyeni ya da sorumlusu ekler.", "CLINICAL_ROLE_REQUIRED");
    const codes = Array.isArray(body.add) ? [...new Set(body.add.filter((c): c is string => typeof c === "string"))].slice(0, 6) : [];
    const consult = typeof body.consultUnit === "string" && body.consultUnit ? body.consultUnit.trim().toUpperCase().slice(0, 8) : null;
    const picked = codes.map((c) => ADDABLE_STEPS.find((a) => a.code === c));
    if (picked.some((p) => !p)) throw new SecurityError(400, "Geçersiz adım seçimi.", "INVALID_INPUT");
    if (consult && !HOSPITAL_UNITS.some((u) => u.code === consult && u.kind === "clinical" && u.code !== current.unitCode)) throw new SecurityError(400, "Konsültasyon birimi geçersiz.", "INVALID_INPUT");
    const inserted: { unit: string; label: string; kind: string }[] = picked.flatMap((p) => p!.units.map((u) => ({ unit: u.unit, label: u.label, kind: "added" })));
    if (consult) inserted.push({ unit: consult, label: `${unitName(consult)} konsültasyonu`, kind: "added" });
    if (!inserted.length) throw new SecurityError(400, "En az bir tetkik, işlem veya konsültasyon seçin.", "INVALID_INPUT");
    const needsReturn = picked.some((p) => !["recete", "yatis", "ameliyat", "sosyal"].includes(p!.code)) || Boolean(consult);
    if (needsReturn) inserted.push({ unit: current.unitCode, label: "Sonuç değerlendirme", kind: "return" });
    const k = inserted.length;
    stmts.push(db.update(patientJourneySteps).set({ state: "done", startedAt: current.startedAt ?? now, finishedAt: now, actor: actor.email }).where(eq(patientJourneySteps.id, current.id)));
    stmts.push(db.update(patientJourneySteps).set({ seq: sql`${patientJourneySteps.seq} + ${k}` }).where(and(eq(patientJourneySteps.journeyReference, reference), gt(patientJourneySteps.seq, current.seq))));
    inserted.forEach((s, i) => stmts.push(db.insert(patientJourneySteps).values({ journeyReference: reference, seq: current.seq + 1 + i, unitCode: s.unit, label: s.label, kind: s.kind, state: i === 0 ? "waiting" : "pending", enteredAt: i === 0 ? now : null })));
    stmts.push(db.update(patientJourneys).set({ currentSeq: current.seq + 1 }).where(eq(patientJourneys.reference, reference)));
    stmts.push(guardEvent(db, j, token, "steps_added", current.unitCode, actor.email, inserted.map((s) => s.label).join(", ").slice(0, 300), now));
    stmts.push(...(await unitNotice(db, inserted[0].unit, `Sıradaki hasta: ${inserted[0].label}`, `${j.patientAlias} · ${unitName(current.unitCode)} istedi`, `journey:${reference}:add:${now.getTime()}`, now)));
    audit.push({ action: "journey.steps_added", detail: `${unitName(current.unitCode)}: ${inserted.length} adım` });
    result = { next: `${unitName(inserted[0].unit)} · ${inserted[0].label}`, added: inserted.length };
  } else if (action === "cancel") {
    if (!canCancelJourney(actor)) throw new SecurityError(403, "Süreci operasyon yöneticisi veya hasta kabul sorumlusu sonlandırır.", "JOURNEY_CANCEL_DENIED");
    const note = reasonOf(body.note, "Sonlandırma gerekçesi");
    stmts.push(db.update(patientJourneySteps).set({ state: "skipped", finishedAt: now, actor: actor.email, note }).where(and(eq(patientJourneySteps.journeyReference, reference), inArray(patientJourneySteps.state, ["pending", "waiting", "active"]))));
    stmts.push(db.update(patientJourneys).set({ status: "cancelled", closedAt: now, closeReason: note }).where(eq(patientJourneys.reference, reference)));
    stmts.push(guardEvent(db, j, token, "cancelled", null, actor.email, note, now));
    audit.push({ action: "journey.cancelled", detail: note });
  } else {
    throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
  }
  stmts.push(...(await auditStatements(db, audit.map((a) => ({ actor: actor.email, action: a.action, resource: reference, detail: a.detail })))));
  try { await db.batch(stmts as [Stmt, ...Stmt[]]); } catch (error) {
    const [fresh] = await db.select({ version: patientJourneys.version }).from(patientJourneys).where(eq(patientJourneys.reference, reference)).limit(1);
    if (fresh && fresh.version !== j.version) throw new SecurityError(409, "Süreç aynı anda başka biri tarafından güncellendi. Ekranı yenileyin.", "STALE_VERSION");
    throw error;
  }
  return { ok: true, reference, ...result };
}

// ————— Personel görünümü —————

/**
 * Hastane akış panosu: her birimde kaç hasta bekliyor / işlemde / süresi aşıldı (kişisel veri yok, tüm personele açık).
 * Süreç listesi: yönetim ve gözetim rolleri tümünü; diğer personel yolu kendi biriminden geçen hastaları baştan sona görür.
 */
export async function journeyBoard(db: Db, actor: RequestActor, now = Date.now()) {
  const active = await db.select().from(patientJourneys).where(eq(patientJourneys.status, "active")).orderBy(desc(patientJourneys.updatedAt)).limit(400);
  const closedToday = await db.select().from(patientJourneys).where(and(inArray(patientJourneys.status, ["completed", "cancelled"]), gt(patientJourneys.closedAt, new Date(now - 24 * 3600_000)))).orderBy(desc(patientJourneys.closedAt)).limit(100);
  const all = [...active, ...closedToday];
  const stepMap = await stepsOf(db, all.map((j) => j.reference));
  const units = new Map<string, { code: string; name: string; waiting: number; active: number; overdue: number; doneToday: number; avgMinutes: number | null; _sum: number; _n: number }>();
  const u = (code: string) => { if (!units.has(code)) units.set(code, { code, name: unitName(code), waiting: 0, active: 0, overdue: 0, doneToday: 0, avgMinutes: null, _sum: 0, _n: 0 }); return units.get(code)!; };
  for (const j of all) for (const s of stepMap.get(j.reference) ?? []) {
    const row = u(s.unitCode);
    if (s.state === "waiting") row.waiting++;
    if (s.state === "active") row.active++;
    if (isOverdue({ unitCode: s.unitCode, state: s.state as StepState, enteredAt: t(s.enteredAt) }, now)) row.overdue++;
    if (s.state === "done" && s.finishedAt && now - s.finishedAt.getTime() < 24 * 3600_000) {
      row.doneToday++;
      if (s.enteredAt) { row._sum += (s.finishedAt.getTime() - s.enteredAt.getTime()) / 60_000; row._n++; }
    }
  }
  const board = [...units.values()].map(({ _sum, _n, ...r }) => ({ ...r, avgMinutes: _n ? Math.round(_sum / _n) : null })).sort((a, b) => (b.overdue - a.overdue) || (b.waiting + b.active - a.waiting - a.active) || a.name.localeCompare(b.name, "tr"));
  const visible = all.filter((j) => canViewJourney(actor, (stepMap.get(j.reference) ?? []).map((s) => s.unitCode)));
  const journeys = visible.map((j) => journeyView(j, stepMap.get(j.reference) ?? [], actor, now));
  const myQueue = journeys.filter((j) => j.status === "active" && j.current && actor.unitCodes.includes(j.current.unitCode));
  return {
    board, journeys, myQueue,
    totals: { active: active.length, completedToday: closedToday.filter((j) => j.status === "completed").length, overdue: board.reduce((a, b) => a + b.overdue, 0) },
    canOpen: canOpenJourney(actor),
    pathways: PATHWAYS.map((p) => ({ code: p.code, label: p.label, summary: p.summary, clinics: clinicOptions(p) })),
    addable: ADDABLE_STEPS.map((a) => ({ code: a.code, label: a.label })),
    consultUnits: HOSPITAL_UNITS.filter((x) => x.kind === "clinical").map((x) => ({ code: x.code, name: x.name })),
    units: HOSPITAL_UNITS.map((x) => ({ code: x.code, name: x.name })),
    openingUnits: OPENING_UNITS,
  };
}

function journeyView(j: JourneyRow, steps: StepRow[], actor: RequestActor, now: number) {
  const current = j.status === "active" ? steps.find((s) => s.seq === j.currentSeq) ?? null : null;
  const done = steps.filter((s) => ["done", "skipped", "rejected"].includes(s.state)).length;
  return {
    reference: j.reference, alias: j.patientAlias, pathway: pathwayByCode(j.pathway)?.label ?? j.pathway, clinic: unitName(j.clinicUnit),
    status: j.status as JourneyStatus, version: j.version, createdAt: t(j.createdAt), closedAt: t(j.closedAt), closeReason: j.closeReason,
    progress: steps.length ? Math.round((done / steps.length) * 100) : 0,
    steps: steps.map((s) => stepView(s, now)),
    current: current ? stepView(current, now) : null,
    can: current ? {
      start: current.state === "waiting" && canWorkStep(actor, current.unitCode),
      complete: canWorkStep(actor, current.unitCode),
      skip: current.optional && canWorkStep(actor, current.unitCode),
      reject: canWorkStep(actor, current.unitCode),
      add: canAddSteps(actor, current.unitCode),
      cancel: canCancelJourney(actor),
    } : null,
  };
}

// ————— Hasta görünümü (takip kodu + PIN) —————

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

/**
 * Hastanın kendi sürecini görmesi. Yanlış kod ile yanlış PIN aynı yanıtı döner (kod tahmini yapılamaz).
 * 5 hatalı PIN sonrası kod 15 dakika kilitlenir. Yanıtta takma ad, personel, not veya ret gerekçesi yoktur.
 */
export async function patientStatus(db: Db, code: string, pin: string, now = new Date()) {
  const fail = () => new SecurityError(404, "Takip kodu veya PIN hatalı.", "TRACKING_NOT_FOUND");
  const [j] = await db.select().from(patientJourneys).where(eq(patientJourneys.trackingHash, await trackingHash(code))).limit(1);
  if (!j) throw fail();
  if (j.lockedUntil && j.lockedUntil.getTime() > now.getTime()) throw new SecurityError(429, "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin veya danışmaya başvurun.", "TRACKING_LOCKED");
  if ((await pinHash(code, pin)) !== j.pinHash) {
    const attempts = j.failedAttempts + 1;
    await db.update(patientJourneys).set({ failedAttempts: attempts >= LOCK_AFTER ? 0 : attempts, lockedUntil: attempts >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : j.lockedUntil }).where(eq(patientJourneys.reference, j.reference));
    throw fail();
  }
  if (j.failedAttempts) await db.update(patientJourneys).set({ failedAttempts: 0 }).where(eq(patientJourneys.reference, j.reference));
  // Kapanıştan 7 gün sonra hasta görünümü kapanır (veri en az tutma).
  if (j.closedAt && now.getTime() - j.closedAt.getTime() > 7 * 24 * 3600_000) throw fail();
  const steps = (await stepsOf(db, [j.reference])).get(j.reference) ?? [];
  const current = j.status === "active" ? steps.find((s) => s.seq === j.currentSeq) ?? null : null;
  let ahead: number | null = null;
  if (current?.state === "waiting" && current.enteredAt) {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(patientJourneySteps)
      .innerJoin(patientJourneys, and(eq(patientJourneys.reference, patientJourneySteps.journeyReference), eq(patientJourneys.status, "active"), eq(patientJourneys.currentSeq, patientJourneySteps.seq)))
      .where(and(eq(patientJourneySteps.unitCode, current.unitCode), eq(patientJourneySteps.state, "waiting"), sql`${patientJourneySteps.enteredAt} < ${current.enteredAt.getTime()}`));
    ahead = Number(row?.n ?? 0);
  }
  return {
    status: j.status, statusText: JOURNEY_STATUS_TEXT[j.status as JourneyStatus] ?? "",
    pathway: pathwayByCode(j.pathway)?.label ?? "", startedAt: t(j.createdAt), updatedAt: t(j.updatedAt),
    current: current ? { unit: unitName(current.unitCode), label: current.label, state: PATIENT_STATE_TEXT[current.state as StepState], ahead, typicalMinutes: unitSla(current.unitCode) } : null,
    steps: steps.map((s) => ({ unit: unitName(s.unitCode), label: s.label, state: s.state, stateText: PATIENT_STATE_TEXT[s.state as StepState], at: t(s.finishedAt) ?? t(s.startedAt) ?? t(s.enteredAt) })),
  };
}
