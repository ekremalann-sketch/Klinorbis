// Gecikme yükseltmesi: hedef süresi geçen açık görev önce birim sorumlusuna, ESCALATE_SECOND_MINUTES sonra
// operasyon yöneticisine bildirilir. Görev yeniden atanmaz ve kapatılmaz; karar insandadır.
//
// Her yükseltme tek batch: görevin seviyesi (iyimser kilit: eski seviye koşulu), denetim kaydı ve bildirimler.
// Acil durdurma açıksa çalışmaz. Eğitim/pilot görevleri (source_type "pilot_%") yükseltilmez.
import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { operationalTasks } from "../db/schema";
import { auditHeadConflict, auditStatements } from "./audit";
import { automationStopped } from "./automation-policy";
import { findUnit } from "./hospital-units";
import { notificationStatements, roleRecipients, unitRecipients } from "./notifications";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const MIN = 60_000;
export const ESCALATE_SECOND_MINUTES = 30;
const CLOSED = ["completed", "cancelled", "scheduled"];
const PATH: Record<string, string> = { playbook: "/playbooks", appointment: "/access", calendar_confirmation: "/access" };

/** Gecikme süresine göre hedef seviye. Birim sorumlusu yoksa doğrudan operasyon yöneticisine çıkar. */
export function targetLevel(overdueMinutes: number, hasUnitManager: boolean) {
  if (overdueMinutes < 0) return 0;
  return overdueMinutes >= ESCALATE_SECOND_MINUTES || !hasUnitManager ? 2 : 1;
}

export async function escalateOverdueTasks(db: Db, now = new Date(), limit = 100) {
  if (await automationStopped(db)) return { checked: 0, escalated: 0, paused: true };
  const rows = await db.select().from(operationalTasks).where(and(
    notInArray(operationalTasks.status, CLOSED), lt(operationalTasks.dueAt, now), lt(operationalTasks.escalationLevel, 2),
    sql`${operationalTasks.sourceType} not like 'pilot_%'`,
    sql`not exists (select 1 from call_sessions c where c.reference = ${operationalTasks.callReference} and c.training = 1)`,
  )).limit(limit);
  if (!rows.length) return { checked: 0, escalated: 0, paused: false };
  const opsManagers = await roleRecipients(db, "operations_manager");
  const managerCache = new Map<string, string[]>();
  let escalated = 0;
  for (const task of rows) {
    if (!managerCache.has(task.unitCode)) managerCache.set(task.unitCode, await unitRecipients(db, task.unitCode, ["unit_manager"]));
    const unitManagers = managerCache.get(task.unitCode)!;
    const overdue = Math.floor((now.getTime() - (task.dueAt as Date).getTime()) / MIN);
    const level = targetLevel(overdue, unitManagers.length > 0);
    if (level <= task.escalationLevel) continue;
    const unit = findUnit(task.unitCode);
    const path = task.ticketReference ? `/requests/${task.ticketReference}` : PATH[task.sourceType] ?? "/inbox";
    const statements: Stmt[] = [
      db.update(operationalTasks).set({ escalationLevel: level, escalatedAt: now, updatedAt: now })
        .where(and(eq(operationalTasks.reference, task.reference), eq(operationalTasks.escalationLevel, task.escalationLevel))),
    ];
    for (let l = task.escalationLevel + 1; l <= level; l++) {
      const recipients = l === 1 ? unitManagers : opsManagers;
      statements.push(...notificationStatements(db, recipients, {
        kind: "escalation",
        title: l === 1 ? `Geciken iş: ${unit.name}` : `Yönetime yükseldi: ${unit.name}`,
        detail: `${task.reference} hedef süresini ${overdue} dk aştı${l === 2 ? " · birim düzeyinde çözülmedi" : ""}.`,
        path, key: `esc:${task.reference}:${l}`,
      }, now));
    }
    statements.push(...await auditStatements(db, [{ actor: "klinorbis-otomasyon", action: "task.escalated", resource: task.reference, detail: `${unit.code} · seviye ${level} · ${overdue} dk gecikme` }]));
    try {
      await db.batch(statements as [Stmt, ...Stmt[]]);
      escalated++;
    } catch (error) {
      // Aynı anda başka bir döngü yükselttiyse (kilit veya denetim zinciri çakışması) bu görev sonraki turda yeniden değerlendirilir.
      if (!auditHeadConflict(error) && !/UNIQUE|constraint/i.test(`${String(error)} ${String((error as { cause?: unknown })?.cause ?? "")}`)) throw error;
    }
  }
  return { checked: rows.length, escalated, paused: false };
}

/** Kısa özet (gösterge ve testler için). */
export async function escalationSummary(db: Db, unitCodes: string[]) {
  if (!unitCodes.length) return { level1: 0, level2: 0 };
  const rows = await db.select({ level: operationalTasks.escalationLevel, n: sql<number>`count(*)` }).from(operationalTasks)
    .where(and(inArray(operationalTasks.unitCode, unitCodes), notInArray(operationalTasks.status, CLOSED))).groupBy(operationalTasks.escalationLevel);
  return { level1: Number(rows.find((r) => r.level === 1)?.n ?? 0), level2: Number(rows.find((r) => r.level === 2)?.n ?? 0) };
}
