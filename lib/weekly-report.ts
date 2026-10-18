// Haftalık yönetim raporu: "nerede zaman ve para kaybediyoruz?"
// Son 7 gün ile önceki 7 gün: akışlar, hedef süreyi aşan bekleme (saat), en çok bekleten birimler, en yavaş akışlar,
// yükselen işler ve öneriler. TL karşılığı yalnız açık bir varsayımla (gecikme başına takip süresi × saatlik maliyet) verilir.
import { and, gte, inArray, lt, or, eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { auditLogs, playbookRuns, playbookSteps } from "../db/schema";
import { findUnit } from "./hospital-units";
import { playbookOf, PLAYBOOKS } from "./playbooks";
import type { RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
const MIN = 60_000, DAY = 86_400_000;
export const REPORT_ASSUMPTIONS = { followUpMinutesPerLateStep: 6, staffHourlyCostTL: 400 };

async function windowStats(db: Db, actor: RequestActor, from: Date, to: Date) {
  const codes = PLAYBOOKS.filter((p) => p.steps.some((s) => actor.unitCodes.includes(s.unitCode))).map((p) => p.code);
  const scope = actor.canSeeAllUnits ? undefined : or(eq(playbookRuns.startedBy, actor.email), codes.length ? inArray(playbookRuns.playbookCode, codes) : undefined);
  const runs = await db.select().from(playbookRuns).where(and(gte(playbookRuns.createdAt, from), lt(playbookRuns.createdAt, to), scope)).limit(3000);
  const steps: (typeof playbookSteps.$inferSelect)[] = [];
  for (let i = 0; i < runs.length; i += 80) steps.push(...await db.select().from(playbookSteps).where(inArray(playbookSteps.runReference, runs.slice(i, i + 80).map((r) => r.reference))));
  const runOf = new Map(runs.map((r) => [r.reference, r]));
  const units = new Map<string, { unitCode: string; completed: number; late: number; overMinutes: number; openLate: number }>();
  let completed = 0, late = 0, overMinutes = 0;
  for (const s of steps) {
    if (!actor.canSeeAllUnits && !actor.unitCodes.includes(s.unitCode)) continue;
    const run = runOf.get(s.runReference);
    const target = run ? playbookOf(run.playbookCode)?.steps[s.stepIndex]?.minutes ?? null : null;
    const begin = (s.activateAt ?? s.startedAt).getTime();
    const row = units.get(s.unitCode) ?? { unitCode: s.unitCode, completed: 0, late: 0, overMinutes: 0, openLate: 0 };
    const end = s.completedAt?.getTime() ?? (run?.status === "active" && begin <= to.getTime() ? to.getTime() : null);
    if (end !== null && target !== null) {
      const over = Math.max(0, (end - begin) / MIN - target);
      if (s.completedAt) { row.completed++; completed++; }
      if (over > 0) { row.late++; late++; row.overMinutes += over; overMinutes += over; if (!s.completedAt) row.openLate++; }
    }
    units.set(s.unitCode, row);
  }
  const playbooks = new Map<string, { code: string; title: string; done: number; ratio: number[] }>();
  for (const r of runs) {
    if (r.status !== "done" || !r.closedAt) continue;
    const pb = playbookOf(r.playbookCode); if (!pb) continue;
    const target = pb.steps.reduce((a, s) => a + s.minutes + s.waitMinutes, 0);
    const row = playbooks.get(r.playbookCode) ?? { code: r.playbookCode, title: r.title, done: 0, ratio: [] };
    row.done++; row.ratio.push(((r.closedAt.getTime() - r.createdAt.getTime()) / MIN) / Math.max(1, target));
    playbooks.set(r.playbookCode, row);
  }
  const [audit] = await db.select({
    escalated: sql<number>`sum(case when ${auditLogs.action} = 'task.escalated' then 1 else 0 end)`,
    skipped: sql<number>`sum(case when ${auditLogs.action} = 'playbook.chain_skipped' then 1 else 0 end)`,
  }).from(auditLogs).where(and(gte(auditLogs.createdAt, from), lt(auditLogs.createdAt, to), inArray(auditLogs.action, ["task.escalated", "playbook.chain_skipped"])));
  return {
    runs: runs.length, done: runs.filter((r) => r.status === "done").length, cancelled: runs.filter((r) => r.status === "cancelled").length,
    automatic: runs.filter((r) => r.startedBy.startsWith("olay:") || r.parentReference).length,
    completedSteps: completed, lateSteps: late, overHours: Math.round(overMinutes / 6) / 10,
    onTimeRate: completed ? Math.round(((completed - [...units.values()].reduce((a, u) => a + (u.late - u.openLate), 0)) / completed) * 100) : null,
    escalated: actor.canSeeAllUnits ? Number(audit?.escalated ?? 0) : null, chainsSkipped: actor.canSeeAllUnits ? Number(audit?.skipped ?? 0) : null,
    units: [...units.values()], playbooks: [...playbooks.values()],
  };
}

export async function weeklyReport(db: Db, actor: RequestActor, now = new Date(), assumptions = REPORT_ASSUMPTIONS) {
  const thisFrom = new Date(now.getTime() - 7 * DAY), prevFrom = new Date(now.getTime() - 14 * DAY);
  const [cur, prev] = await Promise.all([windowStats(db, actor, thisFrom, now), windowStats(db, actor, prevFrom, thisFrom)]);
  const bottlenecks = cur.units.filter((u) => u.overMinutes > 0).sort((a, b) => b.overMinutes - a.overMinutes).slice(0, 6)
    .map((u) => ({ unitCode: u.unitCode, unitName: findUnit(u.unitCode).name, lateSteps: u.late, overHours: Math.round(u.overMinutes / 6) / 10, stillOpen: u.openLate }));
  const slowest = cur.playbooks.filter((p) => p.done >= 1).map((p) => ({ code: p.code, title: p.title, done: p.done, ratio: Math.round((p.ratio.reduce((a, b) => a + b, 0) / p.ratio.length) * 100) / 100 }))
    .filter((p) => p.ratio > 1).sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  const followUpHours = Math.round((cur.lateSteps * assumptions.followUpMinutesPerLateStep) / 6) / 10;
  const costTL = Math.round(followUpHours * assumptions.staffHourlyCostTL);
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);
  const advice: string[] = [];
  if (bottlenecks[0]) advice.push(`${bottlenecks[0].unitName} bu hafta hedef süreyi toplam ${bottlenecks[0].overHours} saat aştı; vardiya planını ve İş yükü ekranını kontrol edin.`);
  if (slowest[0]) advice.push(`"${slowest[0].title}" akışı hedefin ${slowest[0].ratio} katı sürdü; adım sürelerini ve birim devirlerini gözden geçirin.`);
  if (cur.escalated && cur.escalated >= 5) advice.push(`${cur.escalated} iş yöneticiye yükseldi; sık yükselen birimde ikinci sorumlu atamak gecikmeyi azaltabilir.`);
  if (prev.overHours > 0 && cur.overHours < prev.overHours) advice.push(`Gecikme geçen haftaya göre ${Math.round((prev.overHours - cur.overHours) * 10) / 10} saat azaldı.`);
  if (!cur.runs) advice.push("Bu hafta akış başlatılmadı; ölçüm için akışların Klinorbis üzerinden yürütülmesi gerekir.");
  return {
    period: { from: thisFrom.toISOString(), to: now.toISOString() },
    current: { runs: cur.runs, done: cur.done, cancelled: cur.cancelled, automatic: cur.automatic, completedSteps: cur.completedSteps, lateSteps: cur.lateSteps, overHours: cur.overHours, onTimeRate: cur.onTimeRate, escalated: cur.escalated, chainsSkipped: cur.chainsSkipped },
    previous: { runs: prev.runs, lateSteps: prev.lateSteps, overHours: prev.overHours, onTimeRate: prev.onTimeRate },
    change: { runs: delta(cur.runs, prev.runs), overHours: delta(cur.overHours, prev.overHours), onTimeRate: delta(cur.onTimeRate, prev.onTimeRate) },
    bottlenecks, slowest,
    money: { followUpHours, costTL, assumptions, note: "Tahmin: hedefi aşan her adım için ortalama takip süresi × saatlik personel maliyeti. Gerçek maliyet hastaneye göre değişir." },
    advice,
  };
}

/** Pazartesi 08:00'den sonra operasyon yöneticilerine "haftalık rapor hazır" bildirimi için hafta anahtarı (İstanbul saati). */
export function weeklyNoticeKey(now = new Date()) {
  const ist = new Date(now.getTime() + 3 * 3600_000);
  if (ist.getUTCDay() !== 1 || ist.getUTCHours() < 8) return null;
  return `weekly:${ist.toISOString().slice(0, 10)}`;
}
