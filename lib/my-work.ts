// "İşlerim": kişinin işlem yapabileceği işler ve her iş için tek ana eylem (Kabul et → Başla → Tamamla).
// Sahiplik sunucuda korunur: başkasının kabul ettiği iş devralınamaz, başlatılamaz, tamamlanamaz. Devir, hedef kişi
// kabul edene kadar eski sahipliği değiştirmez. Akış adımlarında tamamlama mevcut kurallarla (completeStep: birim,
// görevler ayrılığı, klinik onay) yapılır; bu katman kuralları gevşetmez, yalnız sahiplik ekler.
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { faultReports, operationalTasks, playbookRuns, playbookSteps, staffAccounts, staffShifts, taskHandoffs, unitMemberships } from "../db/schema";
import { auditStatements } from "./audit";
import { demoEnabled } from "./automation-policy";
import { findUnit } from "./hospital-units";
import { notificationStatements, unitRecipients } from "./notifications";
import { completeStep } from "./playbook-store";
import { completeRequestTask, myRequests, requestCatalog } from "./routing";
import { decideInspection, inspectionPermission, inspectionsFor, isCleaningStep, submitForInspection } from "./cleaning-inspection";
import { playbookOf } from "./playbooks";
import { redactPII } from "./privacy";
import { canAccessUnit, SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const OPEN = ["queued", "accepted", "in_progress"];
const MANAGER_ROLES = ["operations_manager", "unit_manager"];
export type NextAction = "accept" | "start" | "complete" | "approve" | "inspect" | "open" | "wait" | "none";
export const ACTION_LABELS: Record<NextAction, string> = { accept: "Kabul et", start: "Başla", complete: "Tamamla", approve: "Onayla ve ilerlet", inspect: "Kontrol et", open: "Kaydı aç", wait: "Bekleniyor", none: "" };

function sourcePath(t: { sourceType: string; ticketReference: string | null; callReference: string | null }) {
  if (t.ticketReference) return `/requests/${t.ticketReference}`;
  if (t.callReference) return `/calls/${t.callReference}`;
  if (t.sourceType === "appointment" || t.sourceType === "calendar_confirmation") return "/access";
  if (t.sourceType === "service_request" || t.sourceType === "inspection") return "";
  return "/playbooks";
}
const SOURCE_TITLES: Record<string, string> = { ticket: "Hasta talebi", call: "Çağrı", appointment: "Randevu bilgilendirme", calendar_confirmation: "Randevu teyidi", playbook: "Operasyon işi", pilot_task: "Eğitim görevi (kurgusal)", inspection: "Temizlik kontrolü", service_request: "Birim talebi" };
/** Başlığı olmayan eski kayıtlar için anlaşılır ad (ör. "Yoğun Bakım · hasta talebi"). */
export function fallbackTitle(t: { sourceType: string; unitCode: string }) { return `${SOURCE_TITLES[t.sourceType] ?? "Birim görevi"} · ${findUnit(t.unitCode).name}`; }

function canApprove(actor: RequestActor, step: { approval: boolean; clinical: boolean }, startedBy: string) {
  if (!step.approval) return { ok: true, why: "" };
  if (startedBy === actor.email) return { ok: false, why: "Akışı siz başlattınız; onayı başka bir yetkili verir." };
  if (step.clinical) return actor.role === "clinician" ? { ok: true, why: "" } : { ok: false, why: "Klinik onay: yetkili hekim/klinisyen verir." };
  return MANAGER_ROLES.includes(actor.role) ? { ok: true, why: "" } : { ok: false, why: "Onayı birim sorumlusu verir." };
}

type TaskRow = typeof operationalTasks.$inferSelect;
export async function myWorkDecorate(db: Db, actor: RequestActor, rows: TaskRow[], now: Date) { return decorate(db, actor, rows, now); }
async function decorate(db: Db, actor: RequestActor, rows: TaskRow[], now: Date) {
  const refs = rows.filter((t) => t.sourceType === "playbook").map((t) => t.reference);
  const steps = refs.length ? await db.select().from(playbookSteps).where(inArray(playbookSteps.taskReference, refs)) : [];
  const runRefs = [...new Set(steps.map((s) => s.runReference))];
  const runs = runRefs.length ? await db.select().from(playbookRuns).where(inArray(playbookRuns.reference, runRefs)) : [];
  const owners = [...new Set(rows.map((t) => t.assignedUser).filter((x): x is string => !!x))];
  const inspections = await inspectionsFor(db, rows.filter((t) => t.sourceType === "inspection").map((t) => t.reference));
  const labels = owners.length ? new Map((await db.select({ email: staffAccounts.email, label: staffAccounts.displayLabel }).from(staffAccounts).where(inArray(staffAccounts.email, owners))).map((r) => [r.email, r.label])) : new Map<string, string>();
  return rows.map((t) => {
    const step = steps.find((s) => s.taskReference === t.reference);
    const run = step ? runs.find((r) => r.reference === step.runReference) : undefined;
    const pb = run ? playbookOf(run.playbookCode) : null;
    const def = pb && step ? pb.steps[step.stepIndex] : null;
    const nextDef = pb && step ? pb.steps[step.stepIndex + 1] : null;
    const mine = t.assignedUser === actor.email;
    const free = !t.assignedUser;
    let action: NextAction = "none", why = "";
    const approval = def ? canApprove(actor, def, run!.startedBy) : { ok: true, why: "" };
    const ins = t.sourceType === "inspection" ? inspections.find((i) => i.inspectionTaskReference === t.reference) : undefined;
    if (!canAccessUnit(actor, t.unitCode)) { action = "none"; why = "Bu iş biriminizin dışında."; }
    else if (ins) { const p = inspectionPermission(actor, ins.cleanedBy, t.unitCode); action = ins.status === "pending" && p.ok ? "inspect" : "wait"; why = ins.status === "pending" ? p.why : "Kontrol sonuçlandı."; }
    else if (!free && !mine) { action = "none"; why = `${labels.get(t.assignedUser!) ?? "Başka bir görevli"} üstlendi.`; }
    else if (def && def.approval && !approval.ok) { action = "wait"; why = approval.why; }
    else if (run && run.currentStep !== step!.stepIndex) { action = "none"; why = "Akış bu adımda değil."; }
    else if (t.status === "queued") action = "accept";
    else if (t.status === "accepted") action = "start";
    else if (t.status === "in_progress") action = def ? (def.approval ? "approve" : "complete") : t.sourceType === "service_request" ? "complete" : "open";
    if (!def && (action === "complete")) action = t.sourceType === "service_request" ? "complete" : "open";
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return {
      reference: t.reference, title: t.title ?? (def ? def.task : fallbackTitle(t)), location: t.location ?? null,
      unitCode: t.unitCode, unitName: findUnit(t.unitCode).name, priority: t.priority, status: t.status, dueAt: due?.toISOString() ?? null,
      overdue: !!due && due.getTime() < now.getTime(), minutesLeft: due ? Math.round((due.getTime() - now.getTime()) / 60_000) : null,
      owner: t.assignedUser ? { mine, label: mine ? "Siz" : labels.get(t.assignedUser) ?? "Başka bir görevli" } : null,
      blockedReason: t.blockedReason ?? null, helpRequested: !!t.helpRequestedAt, escalationLevel: t.escalationLevel,
      action, actionLabel: ACTION_LABELS[action], why,
      flow: run && def ? { reference: run.reference, title: run.title, version: run.version, step: step!.stepIndex + 1, steps: run.stepCount, approval: def.approval } : null,
      nextStep: nextDef ? `${findUnit(nextDef.unitCode).name}: ${nextDef.task}` : def ? "Akış bu adımla tamamlanır." : t.sourceType === "service_request" ? "Tamamlayınca talep eden kişiye bildirilir." : null,
      link: sourcePath(t),
      inspection: ins ? { cleanedBy: labels.get(ins.cleanedBy) ?? (ins.cleanedBy === actor.email ? "Siz" : "Birim görevlisi"), flow: ins.runReference } : null,
    };
  });
}

const notPilot = () => (demoEnabled() ? undefined : sql`${operationalTasks.sourceType} not like 'pilot_%'`);

export async function myWork(db: Db, actor: RequestActor, now = new Date()) {
  const units = actor.unitCodes;
  const scope = units.length ? or(eq(operationalTasks.assignedUser, actor.email), inArray(operationalTasks.unitCode, units)) : eq(operationalTasks.assignedUser, actor.email);
  const rows = await db.select().from(operationalTasks).where(and(inArray(operationalTasks.status, OPEN), scope, notPilot())).orderBy(desc(operationalTasks.updatedAt)).limit(300);
  const tasks = await decorate(db, actor, rows, now);
  const rank = (t: (typeof tasks)[number]) => (t.overdue ? 0 : 1) * 10 + (t.priority === "Acil" || t.priority === "Yüksek" ? 0 : 1);
  const byDue = (a: (typeof tasks)[number], b: (typeof tasks)[number]) => rank(a) - rank(b) || (a.minutesLeft ?? 1e9) - (b.minutesLeft ?? 1e9);
  const mine = tasks.filter((t) => t.owner?.mine).sort(byDue);
  const available = tasks.filter((t) => !t.owner && t.action !== "none" && (!t.inspection || t.action === "inspect")).sort(byDue);
  const team = tasks.filter((t) => t.owner && !t.owner.mine);
  const handoffs = await db.select().from(taskHandoffs).where(and(eq(taskHandoffs.toEmail, actor.email), eq(taskHandoffs.status, "pending"))).limit(20);
  const handoffTasks = handoffs.length ? await decorate(db, actor, await db.select().from(operationalTasks).where(inArray(operationalTasks.reference, handoffs.map((h) => h.taskReference))), now) : [];
  const faults = await db.select().from(faultReports).where(and(eq(faultReports.reporterEmail, actor.email), inArray(faultReports.status, ["open", "awaiting_confirmation"]))).orderBy(desc(faultReports.createdAt)).limit(20);
  return {
    mine, available, teamCount: team.length,
    handoffs: handoffs.map((h) => ({ id: h.id, task: handoffTasks.find((t) => t.reference === h.taskReference) ?? null, note: h.note })),
    faults: faults.map((f) => ({ reference: f.reference, category: f.category, status: f.status, createdAt: f.createdAt })),
    canReportFault: ["operations_manager", "unit_manager", "clinician", "call_agent"].includes(actor.role),
    // Birimden talep: türler, gideceği birim ve o birimde işi dağıtan kişi; kişinin açık talepleri.
    requestTypes: ["operations_manager", "unit_manager", "clinician", "call_agent"].includes(actor.role) ? await requestCatalog(db) : [],
    requests: await myRequests(db, actor),
    myUnits: units.map((u) => ({ code: u, name: findUnit(u).name })),
    // Devir önerisi için: aynı birimin etkin üyeleri (yalnız ad ve birim; kişi kendisi hariç).
    teammates: units.length ? (await db.select({ email: unitMemberships.email, unitCode: unitMemberships.unitCode, label: staffAccounts.displayLabel }).from(unitMemberships)
      .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
      .where(and(inArray(unitMemberships.unitCode, units), eq(unitMemberships.active, true), eq(staffAccounts.active, true), notInArray(staffAccounts.systemRole, ["privacy_officer", "security_officer"])))
      .limit(200)).filter((m) => m.email !== actor.email) : [],
  };
}

async function load(db: Db, reference: string) {
  const [t] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, reference)).limit(1);
  if (!t) throw new SecurityError(404, "İş bulunamadı.", "TASK_NOT_FOUND");
  return t;
}
async function ownerLabel(db: Db, email: string | null) {
  if (!email) return "başka bir görevli";
  const [r] = await db.select({ label: staffAccounts.displayLabel }).from(staffAccounts).where(eq(staffAccounts.email, email)).limit(1);
  return r?.label ?? "başka bir görevli";
}

export async function acceptTask(db: Db, actor: RequestActor, reference: string, now = new Date()) {
  const t = await load(db, reference);
  if (!canAccessUnit(actor, t.unitCode)) throw new SecurityError(403, "Bu iş biriminizin dışında.", "UNIT_ACCESS_DENIED");
  const [decorated] = await decorate(db, actor, [t], now);
  if (decorated.action === "wait") throw new SecurityError(403, decorated.why, "APPROVER_REQUIRED");
  const changed = await db.update(operationalTasks).set({ status: "accepted", assignedUser: actor.email, acceptedBy: actor.label, acceptedAt: now, updatedAt: now })
    .where(and(eq(operationalTasks.reference, reference), eq(operationalTasks.status, "queued"), or(isNull(operationalTasks.assignedUser), eq(operationalTasks.assignedUser, actor.email)))).returning({ reference: operationalTasks.reference });
  if (!changed.length) {
    const fresh = await load(db, reference);
    throw new SecurityError(409, fresh.assignedUser && fresh.assignedUser !== actor.email ? `Bu işi ${await ownerLabel(db, fresh.assignedUser)} kabul etti.` : "İş artık kabul bekleyen durumda değil; liste yenilendi.", "TASK_TAKEN");
  }
  await db.batch((await auditStatements(db, [{ actor: actor.email, action: "task.accepted", resource: reference, detail: t.unitCode }])) as unknown as [Stmt, ...Stmt[]]);
}

export async function startTask(db: Db, actor: RequestActor, reference: string, now = new Date()) {
  const current = await load(db, reference);
  if (!canAccessUnit(actor, current.unitCode)) throw new SecurityError(403, "Bu iş biriminizin dışında.", "UNIT_ACCESS_DENIED");
  const changed = await db.update(operationalTasks).set({ status: "in_progress", startedAt: now, updatedAt: now })
    .where(and(eq(operationalTasks.reference, reference), eq(operationalTasks.status, "accepted"), eq(operationalTasks.assignedUser, actor.email))).returning({ reference: operationalTasks.reference });
  if (!changed.length) {
    const t = await load(db, reference);
    throw new SecurityError(409, t.assignedUser !== actor.email ? "Yalnız işi kabul eden kişi başlatabilir." : "İş başlatılabilir durumda değil.", "TASK_STATE");
  }
}

export async function completeTask(db: Db, actor: RequestActor, reference: string, note?: unknown, conditions?: unknown) {
  const t = await load(db, reference);
  if (!canAccessUnit(actor, t.unitCode)) throw new SecurityError(403, "Bu iş biriminizin dışında.", "UNIT_ACCESS_DENIED");
  if (t.assignedUser !== actor.email) throw new SecurityError(403, t.assignedUser ? "Yalnız işi üstlenen kişi tamamlayabilir." : "Önce işi kabul edin.", "NOT_OWNER");
  if (!["accepted", "in_progress"].includes(t.status)) throw new SecurityError(409, "İş tamamlanabilir durumda değil.", "TASK_STATE");
  if (t.sourceType === "service_request") return completeRequestTask(db, actor, reference);
  if (t.sourceType !== "playbook") throw new SecurityError(400, "Bu iş kendi kayıt ekranında tamamlanır.", "OPEN_RECORD");
  const [step] = await db.select().from(playbookSteps).where(eq(playbookSteps.taskReference, reference)).limit(1);
  const [run] = step ? await db.select().from(playbookRuns).where(eq(playbookRuns.reference, step.runReference)).limit(1) : [];
  if (!step || !run) throw new SecurityError(404, "İşin akışı bulunamadı.", "PLAYBOOK_NOT_FOUND");
  if (run.currentStep !== step.stepIndex) throw new SecurityError(409, "Akış bu adımda değil; liste yenilendi.", "VERSION_CONFLICT");
  const def = playbookOf(run.playbookCode)?.steps[step.stepIndex];
  if (isCleaningStep(def)) return submitForInspection(db, actor, t, run, step.stepIndex);
  return completeStep(db, actor, run.reference, run.version, note, conditions);
}

export async function inspectTask(db: Db, actor: RequestActor, reference: string, pass: boolean, reason: unknown) {
  return decideInspection(db, actor, reference, pass, reason, (runRef, version, note) => completeStep(db, actor, runRef, version, note));
}

async function managersOf(db: Db, unitCode: string) {
  return unitRecipients(db, unitCode, ["unit_manager"]);
}

export async function reportBlocker(db: Db, actor: RequestActor, reference: string, reason: unknown, now = new Date()) {
  const text = typeof reason === "string" ? redactPII(reason.trim().slice(0, 200)).maskedText : "";
  if (text.length < 5) throw new SecurityError(400, "Engeli en az 5 karakterle yazın (hasta bilgisi yazmayın).", "INVALID_INPUT");
  const t = await load(db, reference);
  if (t.assignedUser !== actor.email) throw new SecurityError(403, "Engeli işi üstlenen kişi bildirir.", "NOT_OWNER");
  const unit = findUnit(t.unitCode);
  await db.batch([
    db.update(operationalTasks).set({ blockedReason: text, blockedAt: now, updatedAt: now }).where(eq(operationalTasks.reference, reference)),
    ...notificationStatements(db, await managersOf(db, t.unitCode), { kind: "escalation", title: `Engel bildirildi: ${unit.name}`, detail: `${t.title ?? reference}: ${text}`, path: "/birimim", key: `block:${reference}:${now.getTime()}` }, now),
    ...(await auditStatements(db, [{ actor: actor.email, action: "task.blocked", resource: reference, detail: text }])),
  ] as [Stmt, ...Stmt[]]);
}
export async function clearBlocker(db: Db, actor: RequestActor, reference: string, now = new Date()) {
  const t = await load(db, reference);
  if (t.assignedUser !== actor.email && !(MANAGER_ROLES.includes(actor.role) && canAccessUnit(actor, t.unitCode))) throw new SecurityError(403, "Engeli işi üstlenen kişi veya birim sorumlusu kaldırır.", "NOT_OWNER");
  await db.update(operationalTasks).set({ blockedReason: null, blockedAt: null, updatedAt: now }).where(eq(operationalTasks.reference, reference));
}

export async function requestHelp(db: Db, actor: RequestActor, reference: string, now = new Date()) {
  const t = await load(db, reference);
  if (t.assignedUser !== actor.email) throw new SecurityError(403, "Yardımı işi üstlenen kişi ister.", "NOT_OWNER");
  if (t.helpRequestedAt && now.getTime() - new Date(t.helpRequestedAt).getTime() < 15 * 60_000) throw new SecurityError(409, "Yardım isteği zaten iletildi; birim sorumlusu bilgilendirildi.", "ALREADY_REQUESTED");
  await db.batch([
    db.update(operationalTasks).set({ helpRequestedAt: now, updatedAt: now }).where(eq(operationalTasks.reference, reference)),
    ...notificationStatements(db, await managersOf(db, t.unitCode), { kind: "task", title: `Yardım istendi: ${findUnit(t.unitCode).name}`, detail: `${actor.label} · ${t.title ?? reference}`, path: "/birimim", key: `help:${reference}:${Math.floor(now.getTime() / 900_000)}` }, now),
    ...(await auditStatements(db, [{ actor: actor.email, action: "task.help_requested", resource: reference, detail: t.unitCode }])),
  ] as [Stmt, ...Stmt[]]);
}

/** Devir önerisi: hedef kişi aynı birimin etkin üyesi olmalı; kabul edene kadar sahiplik değişmez. */
export async function proposeHandoff(db: Db, actor: RequestActor, reference: string, toEmail: string, note: unknown, now = new Date()) {
  const t = await load(db, reference);
  if (t.assignedUser !== actor.email) throw new SecurityError(403, "Devri işi üstlenen kişi önerir.", "NOT_OWNER");
  if (!["accepted", "in_progress"].includes(t.status)) throw new SecurityError(409, "İş devredilebilir durumda değil.", "TASK_STATE");
  const to = toEmail.trim().toLowerCase();
  if (to === actor.email) throw new SecurityError(400, "İşi kendinize devredemezsiniz.", "INVALID_INPUT");
  const [member] = await db.select({ email: unitMemberships.email }).from(unitMemberships).innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
    .where(and(eq(unitMemberships.email, to), eq(unitMemberships.unitCode, t.unitCode), eq(unitMemberships.active, true), eq(staffAccounts.active, true))).limit(1);
  if (!member) throw new SecurityError(400, "Kişi bu birimin etkin üyesi değil.", "INVALID_ASSIGNEE");
  const text = typeof note === "string" && note.trim() ? redactPII(note.trim().slice(0, 200)).maskedText : null;
  try {
    await db.batch([
      db.insert(taskHandoffs).values({ taskReference: reference, fromEmail: actor.email, toEmail: to, note: text, createdAt: now }),
      ...notificationStatements(db, [to], { kind: "task", title: "Size iş devri önerildi", detail: `${actor.label} · ${t.title ?? reference}`, path: "/islerim", key: `handoff:${reference}:${now.getTime()}` }, now),
      ...(await auditStatements(db, [{ actor: actor.email, action: "task.handoff_proposed", resource: reference, detail: to }])),
    ] as [Stmt, ...Stmt[]]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(`${String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`)) throw new SecurityError(409, "Bu iş için bekleyen bir devir önerisi zaten var.", "HANDOFF_PENDING");
    throw error;
  }
}

export async function decideHandoff(db: Db, actor: RequestActor, id: number, accept: boolean, now = new Date()) {
  const [h] = await db.select().from(taskHandoffs).where(eq(taskHandoffs.id, id)).limit(1);
  if (!h || h.toEmail !== actor.email) throw new SecurityError(404, "Devir önerisi bulunamadı.", "NOT_FOUND");
  if (h.status !== "pending") throw new SecurityError(409, "Devir önerisi zaten yanıtlandı.", "HANDOFF_DECIDED");
  const statements: Stmt[] = [db.update(taskHandoffs).set({ status: accept ? "accepted" : "rejected", decidedAt: now }).where(and(eq(taskHandoffs.id, id), eq(taskHandoffs.status, "pending")))];
  if (accept) statements.push(db.update(operationalTasks).set({ assignedUser: actor.email, acceptedBy: actor.label, updatedAt: now })
    .where(and(eq(operationalTasks.reference, h.taskReference), eq(operationalTasks.assignedUser, h.fromEmail), notInArray(operationalTasks.status, ["completed", "cancelled"]))));
  statements.push(...notificationStatements(db, [h.fromEmail], { kind: "task", title: accept ? "Devir kabul edildi" : "Devir reddedildi", detail: `${actor.label} · ${h.taskReference}`, path: "/islerim", key: `handoff-decided:${id}` }, now));
  statements.push(...await auditStatements(db, [{ actor: actor.email, action: accept ? "task.handoff_accepted" : "task.handoff_rejected", resource: h.taskReference, detail: h.fromEmail }]));
  await db.batch(statements as [Stmt, ...Stmt[]]);
  if (accept) {
    const t = await load(db, h.taskReference);
    if (t.assignedUser !== actor.email) throw new SecurityError(409, "İş bu arada kapandı veya sahibi değişti; devir uygulanmadı.", "HANDOFF_STALE");
  }
}

/** Vardiya uygunluğu: kişinin bu birimde vardiya kaydı varsa ve şu an etkin değilse "vardiya dışı". Kayıt yoksa "bilinmiyor". */
export async function shiftAvailability(db: Db, emails: string[], unitCode: string, now = new Date()) {
  const out = new Map<string, "vardiyada" | "vardiya_disi" | "bilinmiyor">();
  if (!emails.length) return out;
  const rows = await db.select({ email: staffShifts.staffEmail, status: staffShifts.status, startedAt: staffShifts.startedAt, endsAt: staffShifts.endsAt })
    .from(staffShifts).where(and(inArray(staffShifts.staffEmail, emails), eq(staffShifts.unitCode, unitCode)));
  for (const e of emails) {
    const mine = rows.filter((r) => r.email === e);
    if (!mine.length) { out.set(e, "bilinmiyor"); continue; }
    const on = mine.some((r) => r.status === "active" && new Date(r.startedAt).getTime() <= now.getTime() && new Date(r.endsAt).getTime() > now.getTime());
    out.set(e, on ? "vardiyada" : "vardiya_disi");
  }
  return out;
}
