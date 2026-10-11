import { automationStopped } from "./automation-policy";
// Operasyon akışlarının veri işlemleri: başlatma (elle veya olaydan), adım tamamlama, iptal, gecikmeli adımların
// etkinleşmesi, akış ağındaki zincirleme başlatma ve performans raporu.
//
// Tutarlılık: her işlem tek bir D1 batch'idir (hepsi yazılır ya da hiçbiri). Batch'in ilk ifadesi bir "kilit"
// satırıdır (integration_events birincil anahtarı, akış + okunan sürüm). Aynı sürüm üzerinde iki işlem (iki kişi aynı
// adımı tamamlar ya da biri tamamlarken öteki iptal eder) yarışırsa ikinci batch kilitte takılır ve tamamı geri alınır. Denetim izi de aynı batch içinde yazılır.
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { getDb } from "../db";
import { integrationEvents, operationalTasks, playbookRuns, playbookSteps } from "../db/schema";
import { auditStatements } from "./audit";
import { findUnit } from "./hospital-units";
import { triggerFor } from "./playbook-triggers";
import { playbookOf, PLAYBOOKS, type Playbook } from "./playbooks";
import { redactPII } from "./privacy";
import { canAccessUnit, SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const MANAGER_ROLES = ["operations_manager", "unit_manager"];
const MAX_CHAIN = 4;
const MIN = 60_000;

function newReference(code: string) {
  return `AKS-${code.slice(0, 12).toUpperCase()}-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
}
function cleanNote(value: unknown) {
  const text = typeof value === "string" ? value.trim().slice(0, 300) : "";
  return text ? redactPII(text).maskedText : null;
}
const isConflict = (error: unknown) => /UNIQUE|constraint/i.test(`${String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`);
const lock = (db: Db, key: string, type: string) => db.insert(integrationEvents).values({ eventId: key, source: "klinorbis", eventType: type, payloadHash: "-", status: "lock" });

/** Bir adımı açan ifadeler: adım kaydı + birimin iş kutusuna görev (gecikmeliyse "scheduled"). */
function stepStatements(db: Db, runReference: string, playbook: Playbook, index: number, now: Date): Stmt[] {
  const step = playbook.steps[index];
  const unit = findUnit(step.unitCode);
  const taskReference = `TSK-${runReference}-${index + 1}`;
  const activateAt = step.waitMinutes ? new Date(now.getTime() + step.waitMinutes * MIN) : null;
  const dueAt = new Date((activateAt ?? now).getTime() + step.minutes * MIN);
  return [
    db.insert(playbookSteps).values({ runReference, stepIndex: index, unitCode: step.unitCode, task: step.task, approval: step.approval, taskReference, startedAt: now, activateAt, dueAt }),
    db.insert(operationalTasks).values({
      reference: taskReference, unitCode: step.unitCode, assignedRole: unit.assignedRole, sourceType: "playbook",
      status: activateAt ? "scheduled" : "queued", priority: step.approval ? "Yüksek" : "Normal", dueAt, createdAt: now, updatedAt: now,
    }),
  ];
}

function runStatements(db: Db, playbook: Playbook, opts: { reference: string; startedBy: string; note: string | null; parentReference: string | null; triggerEvent: string | null; now: Date }): Stmt[] {
  return [
    db.insert(playbookRuns).values({
      reference: opts.reference, playbookCode: playbook.code, title: playbook.title, status: "active", currentStep: 0, stepCount: playbook.steps.length,
      note: opts.note, parentReference: opts.parentReference, startedBy: opts.startedBy, triggerEvent: opts.triggerEvent, createdAt: opts.now, updatedAt: opts.now,
    }),
    ...stepStatements(db, opts.reference, playbook, 0, opts.now),
  ];
}

async function runBatch(db: Db, statements: Stmt[], conflictMessage: string) {
  try {
    await db.batch(statements as [Stmt, ...Stmt[]]);
  } catch (error) {
    if (isConflict(error)) throw new SecurityError(409, conflictMessage, "CONFLICT");
    throw error;
  }
}

/** Elle başlatma: ilk adımın birimi veya tüm birimleri gören operasyon yöneticisi başlatır. */
export async function startPlaybook(db: Db, actor: RequestActor, code: string, rawNote: unknown) {
  const playbook = playbookOf(code);
  if (!playbook) throw new SecurityError(404, "Akış bulunamadı.", "PLAYBOOK_NOT_FOUND");
  if (!canAccessUnit(actor, playbook.steps[0].unitCode)) {
    throw new SecurityError(403, `Bu akışı ilk adımın birimi (${findUnit(playbook.steps[0].unitCode).name}) veya operasyon yöneticisi başlatır.`, "UNIT_ACCESS_DENIED");
  }
  const now = new Date();
  const reference = newReference(code);
  const audit = await auditStatements(db, [{ actor: actor.email, action: "playbook.started", resource: reference, detail: playbook.title }]);
  await runBatch(db, [...runStatements(db, playbook, { reference, startedBy: actor.email, note: cleanNote(rawNote), parentReference: null, triggerEvent: null, now }), ...audit], "Akış başlatılamadı; tekrar deneyin.");
  return reference;
}

/** Olaydan başlatma (imzalı entegrasyon, iç kayıt veya yönetici simülasyonu). Aynı olay iki kez akış açmaz. */
export async function startFromEvent(db: Db, input: { type: string; eventId: string; note?: unknown; source: string; simulatedBy?: string }) {
  const trigger = triggerFor(input.type);
  if (!trigger) throw new SecurityError(422, "Bu olay türü için tanımlı akış yok.", "UNKNOWN_EVENT");
  const playbook = playbookOf(trigger.playbook)!;
  const triggerEvent = `${input.type}:${input.eventId}`.slice(0, 160);
  const [existing] = await db.select({ reference: playbookRuns.reference }).from(playbookRuns).where(eq(playbookRuns.triggerEvent, triggerEvent)).limit(1);
  if (existing) return { reference: existing.reference, duplicate: true, playbook: playbook.title };
  const now = new Date();
  const reference = newReference(playbook.code);
  const startedBy = input.simulatedBy ? input.simulatedBy : `olay:${input.source}`;
  const audit = await auditStatements(db, [{ actor: startedBy, action: "playbook.triggered", resource: reference, detail: `${trigger.label} → ${playbook.title} (${triggerEvent})` }]);
  try {
    await db.batch([...runStatements(db, playbook, { reference, startedBy, note: cleanNote(input.note) ?? `Olay: ${trigger.label}`, parentReference: null, triggerEvent, now }), ...audit] as [Stmt, ...Stmt[]]);
  } catch (error) {
    if (!isConflict(error)) throw error;
    const [again] = await db.select({ reference: playbookRuns.reference }).from(playbookRuns).where(eq(playbookRuns.triggerEvent, triggerEvent)).limit(1);
    if (again) return { reference: again.reference, duplicate: true, playbook: playbook.title };
    throw new SecurityError(409, "Akış başlatılamadı; tekrar deneyin.", "CONFLICT");
  }
  return { reference, duplicate: false, playbook: playbook.title };
}

/** Zamanı gelen gecikmeli adımların görevlerini iş kutusuna açar (okuma ve otomasyon döngüsünde çağrılır). */
export async function activateDueSteps(db: Db, now = new Date()) {
  if (await automationStopped(db)) return;
  const due = db.select({ ref: playbookSteps.taskReference }).from(playbookSteps).where(and(lte(playbookSteps.activateAt, now), isNull(playbookSteps.completedAt)));
  const changed = await db.update(operationalTasks).set({ status: "queued", updatedAt: now })
    .where(and(eq(operationalTasks.status, "scheduled"), inArray(operationalTasks.reference, due))).returning({ reference: operationalTasks.reference });
  return changed.length;
}

function assertCanComplete(actor: RequestActor, run: { startedBy: string }, step: Playbook["steps"][number]) {
  if (!canAccessUnit(actor, step.unitCode)) throw new SecurityError(403, `Bu adımı ${findUnit(step.unitCode).name} birimi tamamlar.`, "UNIT_ACCESS_DENIED");
  if (!step.approval) return;
  // Görevler ayrılığı: akışı başlatan kişi, rolü ne olursa olsun, kendi akışının onay adımını geçemez.
  // Tek yetkili kişinin olduğu birimde onay adımı ikinci yetkili atanana kadar bekler.
  if (run.startedBy === actor.email) throw new SecurityError(403, "Akışı başlatan kişi onay adımını geçiremez; başka bir yetkili onaylamalı.", "SELF_APPROVAL_BLOCKED");
  if (step.clinical) {
    if (actor.role !== "clinician") throw new SecurityError(403, "Bu adım klinik karardır; yalnız birimin yetkili hekimi/klinisyeni geçirir.", "CLINICAL_APPROVER_REQUIRED");
  } else if (!MANAGER_ROLES.includes(actor.role)) {
    throw new SecurityError(403, "Onay adımını birim yöneticisi veya operasyon yöneticisi geçirir.", "APPROVER_ROLE_REQUIRED");
  }
}

export async function completeStep(db: Db, actor: RequestActor, reference: string, version: number, rawNote: unknown) {
  const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.reference, reference)).limit(1);
  if (!run) throw new SecurityError(404, "Akış bulunamadı.", "PLAYBOOK_NOT_FOUND");
  if (run.status !== "active") throw new SecurityError(409, "Akış kapanmış.", "PLAYBOOK_CLOSED");
  if (run.version !== version) throw new SecurityError(409, "Akış başka biri tarafından ilerletildi; sayfayı yenileyin.", "VERSION_CONFLICT");
  const playbook = playbookOf(run.playbookCode);
  if (!playbook) throw new SecurityError(409, "Akış tanımı artık yok.", "PLAYBOOK_NOT_FOUND");
  const step = playbook.steps[run.currentStep];
  assertCanComplete(actor, run, step);
  const now = new Date();
  const [current] = await db.select().from(playbookSteps).where(and(eq(playbookSteps.runReference, reference), eq(playbookSteps.stepIndex, run.currentStep))).limit(1);
  if (current?.activateAt && current.activateAt.getTime() > now.getTime()) {
    throw new SecurityError(409, `Bu adım ${current.activateAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} tarihinde etkinleşecek.`, "STEP_NOT_ACTIVE");
  }
  const note = cleanNote(rawNote);
  const last = run.currentStep + 1 >= playbook.steps.length;
  const statements: Stmt[] = [
    lock(db, `playbook:${reference}:v${run.version}`, "lock.playbook_step"),
    db.update(playbookRuns).set(last ? { version: run.version + 1, updatedAt: now, status: "done", closedAt: now } : { version: run.version + 1, updatedAt: now, currentStep: run.currentStep + 1 })
      .where(and(eq(playbookRuns.reference, reference), eq(playbookRuns.version, run.version))),
    db.update(playbookSteps).set({ completedBy: actor.email, completedAt: now, note }).where(and(eq(playbookSteps.runReference, reference), eq(playbookSteps.stepIndex, run.currentStep))),
    db.update(operationalTasks).set({ status: "completed", acceptedBy: actor.label, acceptedAt: now, updatedAt: now }).where(eq(operationalTasks.reference, `TSK-${reference}-${run.currentStep + 1}`)),
  ];
  const auditEntries: { actor: string; action: string; resource: string; detail: string }[] = [
    { actor: actor.email, action: last ? "playbook.done" : step.approval ? "playbook.approved" : "playbook.step", resource: reference, detail: `${run.currentStep + 1}. ${step.task}` },
  ];
  const started: { reference: string; title: string }[] = [];
  if (!last) {
    statements.push(...stepStatements(db, reference, playbook, run.currentStep + 1, now));
  } else {
    // Akış ağı: kapanan akış bağlı akışları aynı işlemde başlatır (zincir derinliği sınırlı).
    let depth = 0, parent = run.parentReference;
    while (parent && depth < MAX_CHAIN) {
      const [p] = await db.select({ parentReference: playbookRuns.parentReference }).from(playbookRuns).where(eq(playbookRuns.reference, parent)).limit(1);
      parent = p?.parentReference ?? null; depth++;
    }
    if (depth < MAX_CHAIN) {
      for (const code of playbook.next) {
        const child = playbookOf(code);
        if (!child) continue;
        const childRef = newReference(code);
        statements.push(...runStatements(db, child, { reference: childRef, startedBy: run.startedBy, note: `Otomatik: ${playbook.title} (${reference})`, parentReference: reference, triggerEvent: null, now }));
        auditEntries.push({ actor: actor.email, action: "playbook.chained", resource: childRef, detail: `${child.title} ← ${reference}` });
        started.push({ reference: childRef, title: child.title });
      }
    }
  }
  statements.push(...await auditStatements(db, auditEntries));
  await runBatch(db, statements, "Bu adım başka bir işlemle tamamlandı; sayfayı yenileyin.");
  return { done: last, started };
}

export async function cancelRun(db: Db, actor: RequestActor, reference: string, version: number, rawNote: unknown) {
  const note = cleanNote(rawNote);
  if (!note || note.length < 5) throw new SecurityError(400, "İptal nedenini yazın.", "NOTE_REQUIRED");
  const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.reference, reference)).limit(1);
  if (!run) throw new SecurityError(404, "Akış bulunamadı.", "PLAYBOOK_NOT_FOUND");
  if (run.status !== "active") throw new SecurityError(409, "Akış kapanmış.", "PLAYBOOK_CLOSED");
  if (run.version !== version) throw new SecurityError(409, "Akış değişti; sayfayı yenileyin.", "VERSION_CONFLICT");
  const playbook = playbookOf(run.playbookCode);
  const involved = (playbook?.steps ?? []).some((s) => canAccessUnit(actor, s.unitCode));
  const allowed = run.startedBy === actor.email || actor.role === "operations_manager" || (actor.role === "unit_manager" && involved);
  if (!allowed) throw new SecurityError(403, "Akışı başlatan kişi, akışta görevi olan birimin yöneticisi veya operasyon yöneticisi iptal eder.", "CANCEL_NOT_ALLOWED");
  const now = new Date();
  await runBatch(db, [
    lock(db, `playbook:${reference}:v${run.version}`, "lock.playbook_cancel"),
    db.update(playbookRuns).set({ status: "cancelled", closedAt: now, updatedAt: now, version: run.version + 1, note: `${run.note ? run.note + " · " : ""}İptal: ${note}` }).where(and(eq(playbookRuns.reference, reference), eq(playbookRuns.version, run.version))),
    db.update(operationalTasks).set({ status: "cancelled", updatedAt: now }).where(eq(operationalTasks.reference, `TSK-${reference}-${run.currentStep + 1}`)),
    ...await auditStatements(db, [{ actor: actor.email, action: "playbook.cancelled", resource: reference, detail: note }]),
  ], "Akış başka bir işlemle değişti; sayfayı yenileyin.");
}

export async function listRuns(db: Db, actor: RequestActor) {
  const codes = PLAYBOOKS.filter(p => p.steps.some(s => actor.unitCodes.includes(s.unitCode))).map(p => p.code);
  const scope = actor.canSeeAllUnits ? undefined : or(eq(playbookRuns.startedBy, actor.email), codes.length ? inArray(playbookRuns.playbookCode, codes) : undefined);
  const runs = await db.select().from(playbookRuns).where(scope).orderBy(desc(playbookRuns.updatedAt)).limit(100);
  const visible = runs.filter((r) => actor.canSeeAllUnits || r.startedBy === actor.email || (playbookOf(r.playbookCode)?.steps.some((s) => actor.unitCodes.includes(s.unitCode)) ?? false)).slice(0, 100);
  const steps = visible.length ? await db.select().from(playbookSteps).where(inArray(playbookSteps.runReference, visible.map((r) => r.reference))) : [];
  return visible.map((r) => ({ ...r, steps: steps.filter((s) => s.runReference === r.reference).sort((a, b) => a.stepIndex - b.stepIndex) }));
}

/** Performans: akış başına süre, birim başına bekleme, hedef süreye uyum ve şu an bekleyen/geciken adımlar. */
export async function playbookReport(db: Db, actor: RequestActor, now = new Date()) {
  const codes = PLAYBOOKS.filter(p => p.steps.some(s => actor.unitCodes.includes(s.unitCode))).map(p => p.code);
  const scope = actor.canSeeAllUnits ? undefined : or(eq(playbookRuns.startedBy, actor.email), codes.length ? inArray(playbookRuns.playbookCode, codes) : undefined);
  const runs = await db.select().from(playbookRuns).where(scope).orderBy(desc(playbookRuns.createdAt)).limit(2000);
  const steps: (typeof playbookSteps.$inferSelect)[] = [];
  for (let i = 0; i < runs.length; i += 80) steps.push(...await db.select().from(playbookSteps).where(inArray(playbookSteps.runReference, runs.slice(i, i + 80).map(r => r.reference))));
  const byPlaybook = new Map<string, { code: string; title: string; started: number; done: number; cancelled: number; minutes: number[] }>();
  for (const r of runs) {
    const row = byPlaybook.get(r.playbookCode) ?? { code: r.playbookCode, title: r.title, started: 0, done: 0, cancelled: 0, minutes: [] };
    row.started++;
    if (r.status === "done") { row.done++; if (r.closedAt) row.minutes.push((r.closedAt.getTime() - r.createdAt.getTime()) / MIN); }
    if (r.status === "cancelled") row.cancelled++;
    byPlaybook.set(r.playbookCode, row);
  }
  const target = (runRef: string, index: number) => { const run = runs.find((r) => r.reference === runRef); return run ? playbookOf(run.playbookCode)?.steps[index]?.minutes ?? null : null; };
  const byUnit = new Map<string, { unitCode: string; completed: number; onTime: number; waits: number[]; open: number; overdue: number }>();
  for (const s of steps) {
    if (!actor.canSeeAllUnits && !actor.unitCodes.includes(s.unitCode)) continue;
    const row = byUnit.get(s.unitCode) ?? { unitCode: s.unitCode, completed: 0, onTime: 0, waits: [], open: 0, overdue: 0 };
    const begin = (s.activateAt ?? s.startedAt).getTime();
    if (s.completedAt) {
      const wait = Math.max(0, (s.completedAt.getTime() - begin) / MIN);
      row.completed++; row.waits.push(wait);
      const t = target(s.runReference, s.stepIndex);
      if (t !== null && wait <= t) row.onTime++;
    } else if (begin <= now.getTime() && runs.find((r) => r.reference === s.runReference)?.status === "active") {
      row.open++;
      if (s.dueAt && s.dueAt.getTime() < now.getTime()) row.overdue++;
    }
    byUnit.set(s.unitCode, row);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const units = [...byUnit.values()].map((u) => ({ unitCode: u.unitCode, unitName: findUnit(u.unitCode).name, completed: u.completed, avgWaitMinutes: avg(u.waits), onTimeRate: u.completed ? Math.round((u.onTime / u.completed) * 100) : null, open: u.open, overdue: u.overdue }))
    .sort((a, b) => (b.overdue - a.overdue) || ((b.avgWaitMinutes ?? 0) - (a.avgWaitMinutes ?? 0)));
  const playbooks = [...byPlaybook.values()].map((p) => ({ code: p.code, title: p.title, started: p.started, done: p.done, cancelled: p.cancelled, avgMinutes: avg(p.minutes), targetMinutes: PLAYBOOKS.find((x) => x.code === p.code)?.steps.reduce((a, s) => a + s.minutes + s.waitMinutes, 0) ?? null }))
    .sort((a, b) => b.started - a.started);
  const completedSteps = units.reduce((a, u) => a + u.completed, 0);
  const onTime = [...byUnit.values()].reduce((a, u) => a + u.onTime, 0);
  return {
    totals: { runs: runs.length, active: runs.filter((r) => r.status === "active").length, done: runs.filter((r) => r.status === "done").length, cancelled: runs.filter((r) => r.status === "cancelled").length, completedSteps, onTimeRate: completedSteps ? Math.round((onTime / completedSteps) * 100) : null, overdueNow: units.reduce((a, u) => a + u.overdue, 0), automatic: runs.filter((r) => r.startedBy.startsWith("olay:") || r.parentReference).length },
    units, playbooks,
  };
}
