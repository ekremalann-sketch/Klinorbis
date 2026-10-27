// Temizlik bağımsız kontrolü (bulut uygulaması). Kurallar:
//  - Temizlik adımı "Tamamla" ile bitince akış ilerlemez; birimde "Temizlik kontrolü" işi açılır (birim sorumlusu kuyruğu).
//  - Temizliği yapan kişi kendi işini kontrol edemez (rolü ne olursa olsun).
//  - Geçti → akış bir sonraki adıma (teknik kontrol → yatağı kapasiteye açma) ilerler.
//  - Geçmedi → gerekçe zorunlu; aynı adım için "Yeniden temizlik" işi açılır, akış temizlik adımında kalır.
//  - Akış ekranından temizlik adımını doğrudan geçmek engellenir (kontrol atlanamaz).
// Yatak bileşen durumu (dolu/kirli/engelli/ayrılmış) Türkiye çekirdeğinde tutulur; bulut uygulaması yalnız akışı izler.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import { cleaningInspections, operationalTasks, playbookRuns, playbookSteps } from "../db/schema";
import { auditStatements } from "./audit";
import { findUnit } from "./hospital-units";
import { notificationStatements, unitRecipients } from "./notifications";
import type { Playbook } from "./playbooks";
import { redactPII } from "./privacy";
import { canAccessUnit, SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const MANAGERS = ["operations_manager", "unit_manager"];

// Hasta odası/yatak temizlikleri (taburcu sonrası, onarım sonrası, izolasyon odası). Atık alanı temizliği gibi
// hasta yatağını etkilemeyen işler kapsam dışıdır.
const ROOM_CLEANING = /^(Oda temizliği|Onarım sonrası temizlik|Özel temizlik)/i;
export function isCleaningStep(step: Playbook["steps"][number] | null | undefined) {
  return !!step && step.unitCode === "CTM" && !step.approval && ROOM_CLEANING.test(step.task);
}

export async function passedInspection(db: Db, runReference: string, stepIndex: number) {
  const [row] = await db.select({ id: cleaningInspections.id }).from(cleaningInspections)
    .where(and(eq(cleaningInspections.runReference, runReference), eq(cleaningInspections.stepIndex, stepIndex), eq(cleaningInspections.status, "passed"))).limit(1);
  return !!row;
}

export async function inspectionsFor(db: Db, taskReferences: string[]) {
  if (!taskReferences.length) return [];
  return db.select().from(cleaningInspections).where(inArray(cleaningInspections.inspectionTaskReference, taskReferences));
}

export function inspectionPermission(actor: RequestActor, cleanedBy: string, unitCode: string) {
  if (actor.email === cleanedBy) return { ok: false, why: "Temizliği yapan kişi kendi işini kontrol edemez." };
  if (!MANAGERS.includes(actor.role) || !canAccessUnit(actor, unitCode)) return { ok: false, why: "Kontrolü birim sorumlusu yapar." };
  return { ok: true, why: "" };
}

/** Temizlikçi "Tamamla" dedi: temizlik işi kapanır, kontrol işi açılır. Akış ilerlemez. */
export async function submitForInspection(db: Db, actor: RequestActor, task: { reference: string; unitCode: string; priority: string; location: string | null; title: string | null }, run: { reference: string; title: string }, stepIndex: number, now = new Date()) {
  const closed = await db.update(operationalTasks).set({ status: "completed", acceptedBy: actor.label, updatedAt: now })
    .where(and(eq(operationalTasks.reference, task.reference), eq(operationalTasks.assignedUser, actor.email), inArray(operationalTasks.status, ["accepted", "in_progress"]))).returning({ reference: operationalTasks.reference });
  if (!closed.length) throw new SecurityError(409, "İş bu arada değişti; liste yenilendi.", "TASK_STATE");
  const count = (await db.select({ id: cleaningInspections.id }).from(cleaningInspections).where(and(eq(cleaningInspections.runReference, run.reference), eq(cleaningInspections.stepIndex, stepIndex)))).length;
  const ref = `KNT-${run.reference}-${stepIndex + 1}-${count + 1}`.slice(0, 80);
  try {
    await db.batch([
      db.insert(operationalTasks).values({ reference: ref, unitCode: task.unitCode, assignedRole: "unit_manager", sourceType: "inspection", status: "queued", priority: task.priority,
        dueAt: new Date(now.getTime() + 15 * 60_000), title: "Temizlik kontrolü", location: task.location, createdAt: now, updatedAt: now }),
      db.insert(cleaningInspections).values({ runReference: run.reference, stepIndex, cleaningTaskReference: task.reference, inspectionTaskReference: ref, cleanedBy: actor.email, createdAt: now }),
      ...notificationStatements(db, await unitRecipients(db, task.unitCode, ["unit_manager"]), { kind: "task", title: "Temizlik kontrol bekliyor", detail: `${task.location ?? run.title} · temizleyen: ${actor.label}`, path: "/birimim", key: `inspect:${ref}` }, now),
      ...(await auditStatements(db, [{ actor: actor.email, action: "cleaning.submitted", resource: run.reference, detail: `${stepIndex + 1}. adım → kontrol ${ref}` }])),
    ] as [Stmt, ...Stmt[]]);
  } catch (error) {
    // Kontrol kaydı açılamadıysa temizlik işini geri aç (iş kaybolmasın).
    await db.update(operationalTasks).set({ status: "in_progress", updatedAt: now }).where(eq(operationalTasks.reference, task.reference));
    if (/UNIQUE|constraint/i.test(`${String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`)) throw new SecurityError(409, "Bu temizlik için bekleyen bir kontrol zaten var.", "INSPECTION_PENDING");
    throw error;
  }
  return { inspection: ref, next: "Temizlik kontrolü birim sorumlusuna gönderildi. Kontrolden geçince yatak hazırlığı devam eder." };
}

/** Bağımsız kontrol kararı. pass=false → gerekçeli yeniden temizlik işi. */
export async function decideInspection(db: Db, actor: RequestActor, inspectionTaskReference: string, pass: boolean, rawReason: unknown, completeStep: (runRef: string, version: number, note: string) => Promise<unknown>, now = new Date()) {
  const [ins] = await db.select().from(cleaningInspections).where(eq(cleaningInspections.inspectionTaskReference, inspectionTaskReference)).limit(1);
  if (!ins) throw new SecurityError(404, "Kontrol işi bulunamadı.", "NOT_FOUND");
  const [task] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, inspectionTaskReference)).limit(1);
  if (!task || !canAccessUnit(actor, task.unitCode)) throw new SecurityError(404, "Kontrol işi bulunamadı.", "NOT_FOUND");
  const perm = inspectionPermission(actor, ins.cleanedBy, task.unitCode);
  if (!perm.ok) throw new SecurityError(403, perm.why, ins.cleanedBy === actor.email ? "SELF_INSPECTION_BLOCKED" : "INSPECTOR_ROLE_REQUIRED");
  if (ins.status !== "pending") throw new SecurityError(409, "Bu kontrol zaten sonuçlandı.", "INSPECTION_DECIDED");
  const reason = typeof rawReason === "string" ? redactPII(rawReason.trim().slice(0, 200)).maskedText : "";
  if (!pass && reason.length < 5) throw new SecurityError(400, "Geçmeme gerekçesini en az 5 karakterle yazın (hasta bilgisi yazmayın).", "INVALID_INPUT");
  const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.reference, ins.runReference)).limit(1);
  if (!run || run.status !== "active" || run.currentStep !== ins.stepIndex) throw new SecurityError(409, "Akış bu adımda değil; liste yenilendi.", "VERSION_CONFLICT");
  // Kontrolü sahiplen (çift tıklama / iki sorumlu aynı anda): yalnız biri kazanır.
  const claimed = await db.update(cleaningInspections).set({ status: pass ? "passed" : "failed", inspectorEmail: actor.email, reason: reason || null, decidedAt: now })
    .where(and(eq(cleaningInspections.id, ins.id), eq(cleaningInspections.status, "pending"))).returning({ id: cleaningInspections.id });
  if (!claimed.length) throw new SecurityError(409, "Bu kontrol zaten sonuçlandı.", "INSPECTION_DECIDED");
  const closeTask = db.update(operationalTasks).set({ status: "completed", assignedUser: actor.email, acceptedBy: actor.label, acceptedAt: now, updatedAt: now }).where(eq(operationalTasks.reference, inspectionTaskReference));
  if (pass) {
    try {
      await completeStep(run.reference, run.version, `Temizlik bağımsız kontrolden geçti (kontrol eden: ${actor.label})`);
    } catch (error) {
      await db.update(cleaningInspections).set({ status: "pending", inspectorEmail: null, reason: null, decidedAt: null }).where(eq(cleaningInspections.id, ins.id));
      throw error;
    }
    await db.batch([closeTask, ...(await auditStatements(db, [{ actor: actor.email, action: "cleaning.inspection_passed", resource: run.reference, detail: `${ins.stepIndex + 1}. adım` }]))] as [Stmt, ...Stmt[]]);
    return { passed: true, next: "Kontrolden geçti. Akış bir sonraki adıma ilerledi." };
  }
  const reworkRef = `TSK-${run.reference}-${ins.stepIndex + 1}-R${ins.id}`.slice(0, 80);
  const [orig] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, ins.cleaningTaskReference)).limit(1);
  await db.batch([
    closeTask,
    db.insert(operationalTasks).values({ reference: reworkRef, unitCode: task.unitCode, assignedRole: orig?.assignedRole ?? "unit_staff", sourceType: "playbook", status: "queued", priority: "Yüksek",
      dueAt: new Date(now.getTime() + 30 * 60_000), title: `Yeniden temizlik: ${reason}`.slice(0, 160), location: task.location, createdAt: now, updatedAt: now }),
    db.update(playbookSteps).set({ taskReference: reworkRef }).where(and(eq(playbookSteps.runReference, run.reference), eq(playbookSteps.stepIndex, ins.stepIndex))),
    ...notificationStatements(db, await unitRecipients(db, task.unitCode), { kind: "task", title: "Yeniden temizlik gerekiyor", detail: `${task.location ?? run.title}: ${reason}`, path: "/islerim", key: `rework:${reworkRef}` }, now),
    ...(await auditStatements(db, [{ actor: actor.email, action: "cleaning.inspection_failed", resource: run.reference, detail: `${ins.stepIndex + 1}. adım: ${reason}` }])),
  ] as [Stmt, ...Stmt[]]);
  return { passed: false, rework: reworkRef, next: "Yeniden temizlik işi açıldı ve birime bildirildi. Akış temizlik adımında bekliyor." };
}

/** Birimim için: bekleyen kontroller. */
export async function pendingInspections(db: Db, unitCode: string) {
  const rows = await db.select().from(cleaningInspections).where(eq(cleaningInspections.status, "pending")).orderBy(desc(cleaningInspections.createdAt)).limit(100);
  if (!rows.length) return [];
  const tasks = await db.select().from(operationalTasks).where(and(inArray(operationalTasks.reference, rows.map((r) => r.inspectionTaskReference)), eq(operationalTasks.unitCode, unitCode)));
  return rows.filter((r) => tasks.some((t) => t.reference === r.inspectionTaskReference)).map((r) => ({ ...r, unitName: findUnit(unitCode).name }));
}
