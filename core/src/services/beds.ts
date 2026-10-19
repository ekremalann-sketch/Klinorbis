// Yatak ve kapasite: doluluk (HBYS/personel), temizlik, engel (teknik/personel/izolasyon) ve rezervasyon ayrı tutulur;
// "hazır" yalnız boş + temiz + engelsiz + ayrılmamış demektir. Rezervasyon tek UPDATE ile yapılır; aynı yatak iki kez ayrılamaz.
import type { Queryable } from "../db.ts";
import { conflict, invalid, notFound } from "./errors.ts";

const BLOCKS = ["teknik", "personel", "izolasyon", "diger"] as const;
export type BlockReason = (typeof BLOCKS)[number];

export async function bedBoard(tx: Queryable, unitId?: string) {
  const r = await tx.query(`SELECT b.id, b.code, r.code AS room_code, u.id AS unit_id, u.code AS unit_code, u.name AS unit_name, b.status, b.status_since,
      b.occupancy, b.occupancy_source, b.cleaning_state, b.block_reason, b.block_note, b.reserved_for, b.reserved_until, b.conflict,
      (b.occupancy = 'bos' AND b.cleaning_state = 'temiz' AND b.block_reason IS NULL AND b.conflict IS NULL AND (b.reserved_for IS NULL OR b.reserved_until <= now())) AS ready,
      (SELECT j.status FROM kb.cleaning_jobs j WHERE j.bed_id = b.id AND j.status IN ('queued', 'accepted', 'in_progress', 'done') LIMIT 1) AS cleaning_job
    FROM kb.beds b JOIN kb.rooms r ON r.id = b.room_id JOIN kb.units u ON u.id = b.unit_id
    WHERE ($1::uuid IS NULL OR b.unit_id = $1) ORDER BY u.name, r.code, b.code`, [unitId ?? null]);
  const beds = r.rows as Array<Record<string, unknown> & { unit_id: string; unit_name: string; ready: boolean; occupancy: string; cleaning_state: string; block_reason: string | null; conflict: string | null }>;
  const units = new Map<string, { unitId: string; unitName: string; total: number; ready: number; occupied: number; dirty: number; blocked: number; conflicts: number }>();
  for (const b of beds) {
    const u = units.get(b.unit_id) ?? { unitId: b.unit_id, unitName: b.unit_name, total: 0, ready: 0, occupied: 0, dirty: 0, blocked: 0, conflicts: 0 };
    u.total++; if (b.ready) u.ready++; if (b.occupancy === "dolu") u.occupied++; if (b.cleaning_state !== "temiz") u.dirty++; if (b.block_reason) u.blocked++; if (b.conflict) u.conflicts++;
    units.set(b.unit_id, u);
  }
  return { beds, units: [...units.values()] };
}

export async function blockBed(tx: Queryable, bedId: string, reason: BlockReason, note: string | null, actor: string) {
  if (!BLOCKS.includes(reason)) throw invalid("Engel nedeni geçersiz.");
  const r = await tx.query("UPDATE kb.beds SET block_reason = $2, block_note = $3, blocked_by = $4, reserved_for = NULL, reserved_until = NULL, reserved_by = NULL WHERE id = $1 AND block_reason IS NULL RETURNING id", [bedId, reason, note?.slice(0, 200) ?? null, actor]);
  if (!r.rows.length) { await exists(tx, bedId); throw conflict("Yatakta zaten bir engel var."); }
}
export async function unblockBed(tx: Queryable, bedId: string) {
  const r = await tx.query("UPDATE kb.beds SET block_reason = NULL, block_note = NULL, blocked_by = NULL WHERE id = $1 AND block_reason IS NOT NULL RETURNING id", [bedId]);
  if (!r.rows.length) { await exists(tx, bedId); throw conflict("Yatakta kaldırılacak engel yok."); }
}
/** Rezervasyon: yalnız hazır yatak; süre en fazla 4 saat. Aynı anda iki istek gelirse yalnız biri kazanır. */
export async function reserveBed(tx: Queryable, bedId: string, forRef: string, minutes: number, actor: string) {
  if (!/^(P-[0-9A-F]{4,16}|AKS-[A-Z0-9-]{6,40})$/.test(forRef)) throw invalid("Rezervasyon için hasta kısa kodu veya akış referansı gerekir.");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw invalid("Rezervasyon süresi 5–240 dakika olmalı.");
  const r = await tx.query(`UPDATE kb.beds SET reserved_for = $2, reserved_until = now() + make_interval(mins => $3), reserved_by = $4
    WHERE id = $1 AND occupancy = 'bos' AND cleaning_state = 'temiz' AND block_reason IS NULL AND conflict IS NULL AND (reserved_for IS NULL OR reserved_until <= now()) RETURNING id`, [bedId, forRef, minutes, actor]);
  if (!r.rows.length) { await exists(tx, bedId); throw conflict("Yatak hazır değil veya başka bir rezervasyonu var."); }
}
export async function releaseReservation(tx: Queryable, bedId: string) {
  await tx.query("UPDATE kb.beds SET reserved_for = NULL, reserved_until = NULL, reserved_by = NULL WHERE id = $1 AND reserved_for IS NOT NULL", [bedId]);
}
async function exists(tx: Queryable, bedId: string) {
  const r = await tx.query("SELECT 1 FROM kb.beds WHERE id = $1", [bedId]);
  if (!r.rows.length) throw notFound("Yatak");
}
