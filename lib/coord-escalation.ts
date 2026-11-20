// K7: Kural tablosu ve eskalasyon (kişi → lider → yönetim) + bildirim birleştirme.
// Hedef süreler [Öneri]: kurum Ayarlar'dan değiştirene kadar bu değerler geçerlidir. Görev yeniden atanmaz, kapatılmaz;
// yalnız doğru kişiye haber verilir. Aynı yatağın geciken işleri TEK bildirimde birleşir.
import { sql } from "drizzle-orm";
import type { getDb } from "../db";
import { notificationStatements, roleRecipients, unitRecipients } from "./notifications";
import { automationStopped } from "./automation-policy";

type Db = ReturnType<typeof getDb>;
const MIN = 60_000;
import { CHAIN, COORD_RULES } from "./coord-rules";
export { CHAIN, COORD_RULES };

export type CoordJob = { tenant: string; id: string; kind: keyof typeof COORD_RULES | string; bed: string; unit: string; status: string; owner: string | null; created_at: number; updated_at: number; escalation_level: number };

/** İşin hedefini kaç dakika aştığı (aşmadıysa eksi). */
export function overdueMinutes(job: Pick<CoordJob, "kind" | "status" | "created_at" | "updated_at">, now: number): number | null {
  const r = COORD_RULES[job.kind as keyof typeof COORD_RULES];
  if (!r) return null;
  const [from, target] = job.status === "queued" || job.status === "offered" ? [job.created_at, r.acceptMin]
    : job.status === "accepted" || job.status === "active" ? [job.updated_at, r.doneMin]
    : job.status === "check" && r.checkMin ? [job.updated_at, r.checkMin] : [null, 0];
  if (from === null) return null;
  return Math.floor((now - from) / MIN) - target;
}
export function levelFor(overdue: number | null): number {
  if (overdue === null || overdue < 0) return 0;
  return [...CHAIN].reverse().find((c) => overdue >= c.after)!.level;
}

/** Geciken işleri gruplar: aynı yatak + aynı seviye = tek bildirim. */
export function groupByBed(jobs: (CoordJob & { level: number; overdue: number })[]) {
  const groups = new Map<string, (CoordJob & { level: number; overdue: number })[]>();
  for (const j of jobs) { const k = `${j.tenant}|${j.bed}|${j.level}`; groups.set(k, [...(groups.get(k) ?? []), j]); }
  return [...groups.values()];
}

export async function escalateCoordJobs(db: Db, now = Date.now()) {
  if (await automationStopped(db)) return { checked: 0, notified: 0, paused: true };
  const rows = await db.all<CoordJob>(sql`SELECT tenant,id,kind,bed,unit,status,owner,created_at,updated_at,escalation_level FROM simops_jobs WHERE status IN ('offered','queued','accepted','active','check') AND escalation_level < 3 LIMIT 300`);
  const due = rows.map((j) => { const overdue = overdueMinutes(j, now); return { ...j, overdue: overdue ?? -1, level: levelFor(overdue) }; }).filter((j) => j.level > j.escalation_level);
  let notified = 0;
  const ops = await roleRecipients(db, "operations_manager");
  for (const group of groupByBed(due)) {
    const head = group[0]!;
    const level = head.level;
    // İyimser kilit: yalnız seviyesi hâlâ eski olan işler yükseltilir; başka döngü yükselttiyse bildirim çıkmaz.
    let moved = 0;
    for (const j of group) {
      const r = await db.run(sql`UPDATE simops_jobs SET escalation_level=${level} WHERE tenant=${j.tenant} AND id=${j.id} AND escalation_level=${j.escalation_level}`);
      moved += Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0);
    }
    if (!moved) continue;
    const recipients = level === 1
      ? [...new Set(group.flatMap((j) => (j.owner ? [j.owner] : [])))].concat(group.some((j) => !j.owner) ? await unitRecipients(db, head.unit) : [])
      : level === 2 ? await unitRecipients(db, head.unit, ["unit_manager"]) : ops;
    const who = level === 2 && !recipients.length ? ops : recipients;
    const kinds = [...new Set(group.map((j) => COORD_RULES[j.kind as keyof typeof COORD_RULES]?.label ?? j.kind))].join(", ");
    const statements = notificationStatements(db, who, {
      kind: "escalation",
      title: `${head.bed}: ${group.length > 1 ? `${group.length} iş gecikti` : "iş gecikti"} (${kinds})`,
      detail: `${CHAIN[level - 1]!.who} düzeyi · en uzun gecikme ${Math.max(...group.map((j) => j.overdue))} dk. Kurgusal koordinasyon işi.`,
      path: "/hbys", key: `coord:${head.tenant}:${head.bed}:${level}:${group.map((j) => j.id).sort().join(",")}`,
    }, new Date(now));
    if (statements.length) { await db.batch(statements as [typeof statements[number], ...typeof statements]); notified++; }
  }
  return { checked: rows.length, notified, paused: false };
}
