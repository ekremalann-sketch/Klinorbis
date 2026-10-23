// "Birimim": birim sorumlusunun ekranı. Sahipsiz, geciken, devam eden, onay/kontrol bekleyen ve engelli işler;
// ekip iş yükü ve vardiya uygunluğu. Yalnız sorumlu olunan birimler (operasyon yöneticisi seçili birimi görür).
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { operationalTasks, staffAccounts, unitMemberships } from "../db/schema";
import { demoEnabled } from "./automation-policy";
import { findUnit } from "./hospital-units";
import { myWorkDecorate, shiftAvailability } from "./my-work";
import { SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;

export async function myUnit(db: Db, actor: RequestActor, unitCode?: string, now = new Date()) {
  if (!["unit_manager", "operations_manager"].includes(actor.role)) throw new SecurityError(403, "Birimim ekranını birim sorumlusu ve operasyon yöneticisi kullanır.", "MANAGER_REQUIRED");
  const units = actor.role === "operations_manager" ? (unitCode ? [unitCode] : actor.unitCodes.length ? actor.unitCodes : ["YTK"]) : actor.unitCodes;
  const selected = unitCode && units.includes(unitCode) ? unitCode : units[0];
  if (!selected) return { units: [], selected: null, groups: null, people: [] };
  if (actor.role !== "operations_manager" && !actor.unitCodes.includes(selected)) throw new SecurityError(403, "Bu birimin sorumlusu değilsiniz.", "UNIT_ACCESS_DENIED");
  const rows = await db.select().from(operationalTasks).where(and(eq(operationalTasks.unitCode, selected), notInArray(operationalTasks.status, ["completed", "cancelled", "scheduled"]),
    demoEnabled() ? undefined : sql`${operationalTasks.sourceType} not like 'pilot_%'`)).limit(400);
  const tasks = await myWorkDecorate(db, actor, rows, now);
  const work = tasks.filter((t) => t.status !== "completed");
  const groups = {
    inspection: work.filter((t) => t.inspection),
    unassigned: work.filter((t) => !t.owner && !t.inspection),
    overdue: work.filter((t) => t.overdue && !t.inspection),
    blocked: work.filter((t) => t.blockedReason || t.helpRequested),
    awaitingApproval: work.filter((t) => t.flow?.approval),
    inProgress: work.filter((t) => t.owner && !t.flow?.approval && !t.inspection),
  };
  const members = await db.select({ email: unitMemberships.email, label: staffAccounts.displayLabel, role: staffAccounts.systemRole }).from(unitMemberships)
    .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
    .where(and(eq(unitMemberships.unitCode, selected), eq(unitMemberships.active, true), eq(staffAccounts.active, true), notInArray(staffAccounts.systemRole, ["privacy_officer", "security_officer"])));
  const shifts = await shiftAvailability(db, members.map((m) => m.email), selected, now);
  const load = rows.length ? await db.select({ email: operationalTasks.assignedUser, n: sql<number>`count(*)` }).from(operationalTasks)
    .where(and(inArray(operationalTasks.assignedUser, members.map((m) => m.email).concat("—")), notInArray(operationalTasks.status, ["completed", "cancelled", "scheduled"]))).groupBy(operationalTasks.assignedUser) : [];
  const people = members.map((m) => ({ email: m.email, label: m.label, open: Number(load.find((l) => l.email === m.email)?.n ?? 0), shift: shifts.get(m.email) ?? "bilinmiyor" }))
    .sort((a, b) => (a.shift === "vardiya_disi" ? 1 : 0) - (b.shift === "vardiya_disi" ? 1 : 0) || a.open - b.open);
  return { units: units.map((u) => ({ code: u, name: findUnit(u).name })), selected: { code: selected, name: findUnit(selected).name }, groups, people };
}
