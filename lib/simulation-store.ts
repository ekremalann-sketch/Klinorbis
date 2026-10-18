// Simülasyon kayıtları: yalnız "simulation_runs" tablosu. Gerçek iş, görev, akış ve sayaç tablolarına yazılmaz;
// bu yüzden simülasyon sonuçları canlı göstergelere karışmaz. Tek tıkla tümü silinir.
import { desc, eq, notInArray } from "drizzle-orm";
import type { getDb } from "../db";
import { simulationRuns } from "../db/schema";
import { appendAudit } from "./audit";
import { runSimulation, type SimulationResult } from "./simulation";

type Db = ReturnType<typeof getDb>;
const KEEP = 20;

export async function createSimulation(db: Db, actorEmail: string, rawParams: unknown, rawScenario?: unknown) {
  const result = runSimulation(rawParams, rawScenario);
  const id = `SIM-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  await db.insert(simulationRuns).values({ id, seed: result.params.seed, createdBy: actorEmail, createdAt: new Date(), params: JSON.stringify({ ...result.params, scenario: result.scenario.key }), result: JSON.stringify(result) });
  // En yeni KEEP kayıt kalır.
  const keep = db.select({ id: simulationRuns.id }).from(simulationRuns).orderBy(desc(simulationRuns.createdAt)).limit(KEEP);
  await db.delete(simulationRuns).where(notInArray(simulationRuns.id, keep));
  await appendAudit(db, { actor: actorEmail, action: "simulation.run", resource: id, detail: `${result.scenario.label} · tohum ${result.params.seed} · ${result.params.days} gün · ${result.params.beds} yatak` });
  return { id, result };
}

export async function listSimulations(db: Db) {
  const rows = await db.select({ id: simulationRuns.id, seed: simulationRuns.seed, createdAt: simulationRuns.createdAt, params: simulationRuns.params }).from(simulationRuns).orderBy(desc(simulationRuns.createdAt)).limit(KEEP);
  return rows.map((r) => ({ id: r.id, seed: r.seed, createdAt: r.createdAt, params: JSON.parse(r.params) as SimulationResult["params"] & { scenario?: string } }));
}

export async function getSimulation(db: Db, id: string) {
  const [row] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id)).limit(1);
  return row ? { id: row.id, createdAt: row.createdAt, result: JSON.parse(row.result) as SimulationResult } : null;
}

export async function clearSimulations(db: Db, actorEmail: string) {
  const removed = await db.delete(simulationRuns).returning({ id: simulationRuns.id });
  await appendAudit(db, { actor: actorEmail, action: "simulation.cleared", resource: "simulation_runs", detail: `${removed.length} kayıt silindi` });
  return removed.length;
}
