// Temizlik iş akışı: kuyruk → kabul → başlangıç → tamamlama → bağımsız kontrol (geçti: yatak temiz / kaldı: yeniden işlem).
// Her geçiş tek UPDATE … WHERE durum = beklenen ile yapılır; iki kişi aynı işi aynı anda kabul edemez.
// Yatağın temizlik durumu ve birim görevi aynı işlemde güncellenir.
import type { Queryable } from "../db.ts";
import { conflict, forbidden, invalid, notFound } from "./errors.ts";

export type CleaningKind = "standart" | "izolasyon" | "terminal";
const MINUTES: Record<CleaningKind, number> = { standart: 45, izolasyon: 90, terminal: 120 };

export async function openCleaningJob(tx: Queryable, tenantId: string, bedId: string, cleaningUnitId: string, kind: CleaningKind = "standart", reworkOf: string | null = null) {
  const open = await tx.query<{ id: string }>("SELECT id FROM kb.cleaning_jobs WHERE bed_id = $1 AND status IN ('queued', 'accepted', 'in_progress', 'done')", [bedId]);
  if (open.rows[0]) return { id: open.rows[0].id, created: false };
  const job = (await tx.query<{ id: string }>("INSERT INTO kb.cleaning_jobs (tenant_id, bed_id, kind, rework_of, due_at) VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5)) RETURNING id",
    [tenantId, bedId, kind, reworkOf, MINUTES[kind]])).rows[0].id;
  const reference = `TSK-TMZ-${job.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const task = (await tx.query<{ id: string }>("INSERT INTO kb.tasks (tenant_id, reference, unit_id, source, title, due_at) VALUES ($1, $2, $3, 'maintenance', $4, now() + make_interval(mins => $5)) RETURNING id",
    [tenantId, reference, cleaningUnitId, reworkOf ? "Yeniden temizlik (kontrolden kaldı)" : kind === "standart" ? "Yatak temizliği" : `Yatak temizliği (${kind})`, MINUTES[kind]])).rows[0].id;
  await tx.query("UPDATE kb.cleaning_jobs SET task_id = $2 WHERE id = $1", [job, task]);
  return { id: job, created: true, taskReference: reference };
}

async function load(tx: Queryable, id: string) {
  const r = await tx.query<{ id: string; bed_id: string; status: string; accepted_by: string | null; done_by: string | null; task_id: string | null; kind: CleaningKind; tenant_id: string }>("SELECT id, bed_id, status, accepted_by, done_by, task_id, kind, tenant_id FROM kb.cleaning_jobs WHERE id = $1 FOR UPDATE", [id]);
  if (!r.rows[0]) throw notFound("Temizlik işi");
  return r.rows[0];
}
async function step(tx: Queryable, id: string, from: string[], set: string, params: unknown[], message: string) {
  const r = await tx.query(`UPDATE kb.cleaning_jobs SET ${set} WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`, [id, from, ...params]);
  if (!r.rows.length) throw conflict(message);
}
async function task(tx: Queryable, taskId: string | null, status: "accepted" | "in_progress" | "completed", actor: string) {
  if (!taskId) return;
  if (status === "completed") await tx.query("UPDATE kb.tasks SET status = 'completed', completed_at = now(), completed_by = $2 WHERE id = $1 AND status NOT IN ('completed', 'cancelled')", [taskId, actor]);
  else await tx.query("UPDATE kb.tasks SET status = $2 WHERE id = $1 AND status NOT IN ('completed', 'cancelled', $2)", [taskId, status]);
}

export async function acceptJob(tx: Queryable, id: string, actor: string) {
  const job = await load(tx, id);
  await step(tx, id, ["queued"], "accepted_by = $3, accepted_at = now(), status = 'accepted'", [actor], "İş başka biri tarafından kabul edildi veya artık kuyrukta değil.");
  await task(tx, job.task_id, "accepted", actor);
}
export async function startJob(tx: Queryable, id: string, actor: string) {
  const job = await load(tx, id);
  if (job.accepted_by && job.accepted_by !== actor) throw forbidden("İşi yalnız kabul eden görevli başlatabilir.");
  await step(tx, id, ["queued", "accepted"], "started_at = now(), status = 'in_progress', accepted_by = coalesce(accepted_by, $3), accepted_at = coalesce(accepted_at, now())", [actor], "İş başlatılabilir durumda değil.");
  await tx.query("UPDATE kb.beds SET cleaning_state = 'temizleniyor' WHERE id = $1 AND cleaning_state = 'kirli'", [job.bed_id]);
  await task(tx, job.task_id, "in_progress", actor);
}
export async function completeJob(tx: Queryable, id: string, actor: string, checklist: string[] = []) {
  const job = await load(tx, id);
  if (job.accepted_by !== actor) throw forbidden("İşi yalnız kabul eden görevli tamamlayabilir.");
  if (checklist.some((c) => typeof c !== "string" || c.length > 60)) throw invalid("Kontrol listesi geçersiz.");
  await step(tx, id, ["in_progress"], "status = 'done', done_at = now(), done_by = $3, checklist = $4", [actor, JSON.stringify(checklist)], "Yalnız başlamış iş tamamlanabilir.");
  await tx.query("UPDATE kb.beds SET cleaning_state = 'kontrol_bekliyor' WHERE id = $1 AND cleaning_state = 'temizleniyor'", [job.bed_id]);
}
/** Bağımsız kontrol: temizliği yapan kişi kendi işini kontrol edemez. Kalırsa yeniden işlem açılır. */
export async function inspectJob(tx: Queryable, id: string, actor: string, passed: boolean, cleaningUnitId: string) {
  const job = await load(tx, id);
  if (job.done_by === actor) throw forbidden("Temizliği yapan kişi kendi işini kontrol edemez.");
  await step(tx, id, ["done"], `status = $4, inspected_by = $3, inspected_at = now(), inspection_result = $5`, [actor, passed ? "inspected" : "failed", passed ? "gecti" : "kaldi"], "Kontrol için tamamlanmış iş gerekir.");
  if (passed) {
    await tx.query("UPDATE kb.beds SET cleaning_state = 'temiz' WHERE id = $1 AND cleaning_state = 'kontrol_bekliyor'", [job.bed_id]);
    await task(tx, job.task_id, "completed", actor);
    return { rework: null };
  }
  await tx.query("UPDATE kb.beds SET cleaning_state = 'kirli' WHERE id = $1 AND cleaning_state = 'kontrol_bekliyor'", [job.bed_id]);
  await task(tx, job.task_id, "completed", actor);
  return { rework: await openCleaningJob(tx, job.tenant_id, job.bed_id, cleaningUnitId, job.kind, job.id) };
}
export async function cancelJob(tx: Queryable, id: string, reason: string, actor: string) {
  if (!reason || reason.trim().length < 5) throw invalid("İptal nedeni en az 5 karakter olmalı.");
  const job = await load(tx, id);
  await step(tx, id, ["queued", "accepted", "in_progress"], "status = 'cancelled', cancelled_reason = $3", [reason.trim().slice(0, 200)], "İş iptal edilebilir durumda değil.");
  await tx.query("UPDATE kb.beds SET cleaning_state = 'kirli' WHERE id = $1 AND cleaning_state = 'temizleniyor'", [job.bed_id]);
  if (job.task_id) await tx.query("UPDATE kb.tasks SET status = 'cancelled' WHERE id = $1 AND status NOT IN ('completed', 'cancelled')", [job.task_id]);
  void actor;
}

export async function cleaningQueue(tx: Queryable) {
  const r = await tx.query(`SELECT j.id, j.status, j.kind, j.created_at, j.due_at, j.accepted_by, j.done_by, j.rework_of IS NOT NULL AS rework,
      b.code AS bed_code, r.code AS room_code, u.name AS unit_name, b.cleaning_state
    FROM kb.cleaning_jobs j JOIN kb.beds b ON b.id = j.bed_id JOIN kb.rooms r ON r.id = b.room_id JOIN kb.units u ON u.id = b.unit_id
    WHERE j.status IN ('queued', 'accepted', 'in_progress', 'done') ORDER BY (j.rework_of IS NOT NULL) DESC, j.due_at NULLS LAST, j.created_at`);
  return r.rows;
}
