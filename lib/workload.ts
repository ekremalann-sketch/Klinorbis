// Personel iş yükü dengesi: birim başına açık iş, geciken iş, kişi başına düşen iş ve "işi kime verelim" önerisi.
// Öneri yalnız öneridir; atamayı birim sorumlusu veya operasyon yöneticisi yapar. Atanan kişiye bildirim gider.
// Pilot/eğitim görevleri ve sistem (otomasyon) kullanıcıları hesaba katılmaz.
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { operationalTasks, staffAccounts, unitMemberships } from "../db/schema";
import { auditStatements } from "./audit";
import { findUnit, HOSPITAL_UNITS } from "./hospital-units";
import { notificationStatements } from "./notifications";
import { SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const CLOSED = ["completed", "cancelled", "scheduled"];
export const BUSY_PER_PERSON = 6;

export function loadLevel(open: number, overdue: number, people: number) {
  const perPerson = open / Math.max(1, people);
  if (people === 0 && open > 0) return "kimse-yok" as const;
  if (perPerson >= BUSY_PER_PERSON || overdue >= 3) return "yogun" as const;
  if (perPerson < 1) return "sakin" as const;
  return "normal" as const;
}

const canManage = (actor: RequestActor, unitCode: string) => actor.role === "operations_manager" || (actor.role === "unit_manager" && actor.unitCodes.includes(unitCode));

export async function workloadView(db: Db, actor: RequestActor, now = new Date()) {
  const unitCodes = actor.canSeeAllUnits ? HOSPITAL_UNITS.map((u) => u.code) : actor.unitCodes;
  if (!unitCodes.length) return { units: [], suggestions: [], canAssign: false, threshold: BUSY_PER_PERSON };
  const [tasks, members] = await Promise.all([
    db.select({ reference: operationalTasks.reference, unitCode: operationalTasks.unitCode, assignedUser: operationalTasks.assignedUser, dueAt: operationalTasks.dueAt, priority: operationalTasks.priority, escalationLevel: operationalTasks.escalationLevel, sourceType: operationalTasks.sourceType })
      .from(operationalTasks).where(and(inArray(operationalTasks.unitCode, unitCodes), notInArray(operationalTasks.status, CLOSED), sql`${operationalTasks.sourceType} not like 'pilot_%'`, sql`not exists (select 1 from call_sessions c where c.reference = ${operationalTasks.callReference} and c.training = 1)`)).limit(2000),
    db.select({ email: unitMemberships.email, unitCode: unitMemberships.unitCode, label: staffAccounts.displayLabel, role: staffAccounts.systemRole }).from(unitMemberships)
      .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
      .where(and(inArray(unitMemberships.unitCode, unitCodes), eq(unitMemberships.active, true), eq(staffAccounts.active, true), notInArray(staffAccounts.systemRole, ["privacy_officer", "security_officer"]))),
  ]);
  const units = unitCodes.map((code) => {
    const own = tasks.filter((t) => t.unitCode === code);
    const people = members.filter((m) => m.unitCode === code);
    const overdue = own.filter((t) => t.dueAt && t.dueAt.getTime() < now.getTime()).length;
    const perPerson = people.map((m) => ({ email: m.email, label: m.label, open: own.filter((t) => t.assignedUser === m.email).length }))
      .sort((a, b) => a.open - b.open || a.label.localeCompare(b.label, "tr"));
    const unassigned = own.filter((t) => !t.assignedUser || !people.some((m) => m.email === t.assignedUser));
    return {
      unitCode: code, unitName: findUnit(code).name, open: own.length, overdue, escalated: own.filter((t) => t.escalationLevel > 0).length,
      people: people.length, perPersonAvg: Math.round((own.length / Math.max(1, people.length)) * 10) / 10,
      level: loadLevel(own.length, overdue, people.length), members: perPerson,
      unassigned: unassigned.sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity)).slice(0, 8)
        .map((t) => ({ reference: t.reference, overdue: !!t.dueAt && t.dueAt.getTime() < now.getTime(), priority: t.priority })),
      canAssign: canManage(actor, code),
    };
  }).filter((u) => u.open > 0 || u.people > 0)
    .sort((a, b) => rank(b.level) - rank(a.level) || b.overdue - a.overdue || b.open - a.open);
  // Öneri: yoğun birimde sahipsiz (en eski hedefli) işi, o birimde en az işi olan kişiye ver.
  const suggestions = units.filter((u) => u.canAssign && u.unassigned.length && u.members.length && (u.level === "yogun" || u.overdue > 0))
    .slice(0, 6).map((u) => ({ unitCode: u.unitCode, unitName: u.unitName, reference: u.unassigned[0].reference, to: u.members[0].email, toLabel: u.members[0].label, toOpen: u.members[0].open,
      reason: `${u.unitName}: kişi başı ${u.perPersonAvg} açık iş${u.overdue ? `, ${u.overdue} geciken` : ""}. En az işi olan: ${u.members[0].label} (${u.members[0].open}).` }));
  const shortStaffed = units.filter((u) => u.level === "kimse-yok").map((u) => u.unitName);
  return { units, suggestions, shortStaffed, canAssign: units.some((u) => u.canAssign), threshold: BUSY_PER_PERSON };
}
const rank = (level: string) => ({ "kimse-yok": 3, yogun: 2, normal: 1, sakin: 0 }[level] ?? 0);

/** İşi birimdeki bir kişiye ata. Yetki: o birimin sorumlusu veya operasyon yöneticisi. Hedef kişi o birimin etkin üyesi olmalı. */
export async function assignTask(db: Db, actor: RequestActor, reference: string, email: string, now = new Date()) {
  const [task] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, reference)).limit(1);
  if (!task || CLOSED.includes(task.status)) throw new SecurityError(404, "Açık görev bulunamadı.", "TASK_NOT_FOUND");
  if (!canManage(actor, task.unitCode)) throw new SecurityError(403, "İşi bu birimin sorumlusu veya operasyon yöneticisi atar.", "ASSIGN_NOT_ALLOWED");
  const [target] = await db.select({ email: unitMemberships.email, label: staffAccounts.displayLabel }).from(unitMemberships)
    .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
    .where(and(eq(unitMemberships.email, email), eq(unitMemberships.unitCode, task.unitCode), eq(unitMemberships.active, true), eq(staffAccounts.active, true))).limit(1);
  if (!target) throw new SecurityError(400, "Kişi bu birimin etkin üyesi değil.", "INVALID_ASSIGNEE");
  const unit = findUnit(task.unitCode);
  const statements: Stmt[] = [
    db.update(operationalTasks).set({ assignedUser: target.email, updatedAt: now }).where(eq(operationalTasks.reference, reference)),
    ...notificationStatements(db, [target.email], { kind: "task", title: `Size iş atandı: ${unit.name}`, detail: `${reference} · atayan ${actor.label}`, path: "/inbox", key: `assign:${reference}:${now.getTime()}` }, now),
    ...await auditStatements(db, [{ actor: actor.email, action: "task.assigned", resource: reference, detail: `${unit.code} → ${target.label}` }]),
  ];
  await db.batch(statements as [Stmt, ...Stmt[]]);
  return { reference, assignedTo: target.label };
}
