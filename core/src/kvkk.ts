// KVKK süreçleri: ilgili kişi başvurusu (30 gün), veri ihlali (72 saat), erişim listesi, saklama-imha, envanter dışa aktarma.
// Sistem kendiliğinden Kurula veya kişiye bildirim GÖNDERMEZ; süreleri izler, görev ve taslak üretir, kanıtı saklar.
import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "./db.ts";

const DAY = 86_400_000, HOUR = 3_600_000;
const code = () => randomBytes(3).toString("hex").toUpperCase();

export type RequestKind = "bilgi" | "erisim" | "duzeltme" | "silme" | "aktarim_bilgisi" | "itiraz" | "tazminat";
export async function openRequest(tx: Queryable, tenantId: string, input: { kind: RequestKind; channel: "yazili" | "kep" | "eposta_kayitli" | "basvuru_formu"; receivedAt: Date; subjectRef?: string }) {
  const reference = `KVKK-${input.receivedAt.getUTCFullYear()}-${code()}`;
  const due = new Date(input.receivedAt.getTime() + 30 * DAY);
  const r = await tx.query<{ id: string }>(
    "INSERT INTO kvkk.data_subject_requests (tenant_id, reference, kind, channel, subject_ref, received_at, due_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'identity_pending') RETURNING id",
    [tenantId, reference, input.kind, input.channel, input.subjectRef ?? null, input.receivedAt, due]);
  await auditEvent(tx, tenantId, "kvkk.request_opened", reference, `${input.kind} · son gün ${due.toISOString().slice(0, 10)}`);
  return { id: r.rows[0].id, reference, dueAt: due };
}

/** Kimlik doğrulandı: durum incelemeye geçer; son gün DEĞİŞMEZ (bekleme süreyi durdurmaz). */
export async function verifyRequestIdentity(tx: Queryable, tenantId: string, id: string, at = new Date()) {
  await tx.query("UPDATE kvkk.data_subject_requests SET identity_verified_at = $2, status = 'in_review' WHERE id = $1 AND status = 'identity_pending'", [id, at]);
  await auditEvent(tx, tenantId, "kvkk.request_identity_verified", id);
}

export async function closeRequest(tx: Queryable, tenantId: string, id: string, outcome: { answered: true; answerRef: string } | { answered: false; reason: string }, at = new Date()) {
  const r = outcome.answered
    ? await tx.query("UPDATE kvkk.data_subject_requests SET status = 'answered', answered_at = $2, answer_ref = $3 WHERE id = $1 AND status IN ('in_review', 'identity_pending') RETURNING reference", [id, at, outcome.answerRef])
    : await tx.query("UPDATE kvkk.data_subject_requests SET status = 'rejected', answered_at = $2, decision_reason = $3 WHERE id = $1 AND status IN ('in_review', 'identity_pending') RETURNING reference", [id, at, outcome.reason]);
  if (!r.rows.length) throw new Error("Başvuru kapatılabilir durumda değil");
  await auditEvent(tx, tenantId, outcome.answered ? "kvkk.request_answered" : "kvkk.request_rejected", id);
}

/** Süresi yaklaşan / geçen başvurular (yükseltme ve gösterge için). */
export async function requestsDueSoon(tx: Queryable, now = new Date(), withinDays = 7) {
  const r = await tx.query<{ reference: string; due_at: Date; status: string }>(
    "SELECT reference, due_at, status FROM kvkk.data_subject_requests WHERE status NOT IN ('answered', 'rejected') AND due_at <= $1 ORDER BY due_at", [new Date(now.getTime() + withinDays * DAY)]);
  return r.rows.map((x) => ({ ...x, overdue: new Date(x.due_at).getTime() < now.getTime(), daysLeft: Math.ceil((new Date(x.due_at).getTime() - now.getTime()) / DAY) }));
}

/** Erişim hakkı: belirli hasta belirtecine kim, hangi amaçla, ne zaman erişti (KVKK m.11; ilgili kişiye verilecek liste). */
export async function accessReport(tx: Queryable, patientToken: string) {
  const r = await tx.query<{ actor: string; purpose: string; resource: string; at: Date }>(
    "SELECT actor, purpose, resource, at FROM audit.access_log WHERE patient_token = $1 ORDER BY at", [patientToken]);
  return r.rows;
}

export async function logAccess(tx: Queryable, tenantId: string, actor: string, patientToken: string, purpose: "gorev" | "onay" | "rapor" | "kvkk_basvuru" | "acil_erisim", resource: string) {
  await tx.query("INSERT INTO audit.access_log (tenant_id, actor, patient_token, purpose, resource) VALUES ($1, $2, $3, $4, $5)", [tenantId, actor, patientToken, purpose, resource]);
}

// ---- Veri ihlali ----
export async function openBreach(tx: Queryable, tenantId: string, input: { detectedAt: Date; learnedAt: Date; description: string; dataCategories: string[]; affectedEstimate?: number; specialCategory: boolean }, actor: string) {
  const reference = `IHL-${input.learnedAt.getUTCFullYear()}-${code()}`;
  const r = await tx.query<{ id: string; board_deadline: Date }>(
    "INSERT INTO kvkk.breach_incidents (tenant_id, reference, detected_at, learned_at, description, data_categories, affected_estimate, special_category, board_deadline) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4) RETURNING id, board_deadline",
    [tenantId, reference, input.detectedAt, input.learnedAt, input.description, input.dataCategories, input.affectedEstimate ?? null, input.specialCategory]);
  await tx.query("INSERT INTO kvkk.breach_events (breach_id, tenant_id, kind, note, actor) VALUES ($1, $2, 'tespit', $3, $4)", [r.rows[0].id, tenantId, "İhlal kaydı açıldı", actor]);
  await auditEvent(tx, tenantId, "kvkk.breach_opened", reference, `son an ${new Date(r.rows[0].board_deadline).toISOString()}`);
  return { id: r.rows[0].id, reference, boardDeadline: new Date(r.rows[0].board_deadline) };
}

export async function recordBreachStep(tx: Queryable, tenantId: string, breachId: string, kind: "degerlendirme" | "onlem" | "bildirim_kurul" | "bildirim_ilgili" | "bildirim_sorumlu" | "bildirim_sgb" | "kapanis", note: string, actor: string, at = new Date()) {
  const column = ({ bildirim_kurul: "board_notified_at", bildirim_ilgili: "subjects_notified_at", bildirim_sorumlu: "controller_notified_at", bildirim_sgb: "cyber_reported_at" } as Record<string, string | undefined>)[kind];
  const status = ({ bildirim_kurul: "notified_board", bildirim_ilgili: "notified_subjects", kapanis: "closed" } as Record<string, string | undefined>)[kind];
  if (column) await tx.query(`UPDATE kvkk.breach_incidents SET ${column} = $2${status ? ", status = $3" : ""} WHERE id = $1`, status ? [breachId, at, status] : [breachId, at]);
  else if (status) await tx.query("UPDATE kvkk.breach_incidents SET status = $2 WHERE id = $1", [breachId, status]);
  await tx.query("INSERT INTO kvkk.breach_events (breach_id, tenant_id, kind, note, actor, at) VALUES ($1, $2, $3, $4, $5, $6)", [breachId, tenantId, kind, note, actor, at]);
}

/** 72 saat sayacı: kalan saat; geçtiyse negatif. Sayaç bildirim yetkisi vermez, yalnız hatırlatır. */
export function breachHoursLeft(boardDeadline: Date, now = new Date()) {
  return Math.floor((boardDeadline.getTime() - now.getTime()) / HOUR);
}

// ---- Saklama-imha ----
type Target = "kb.notifications" | "kb.task_events" | "kb.sessions" | "kb.inbound_messages" | "kb.outbound_messages" | "kb.idempotency_keys" | "kb.encounters" | "vault.identities" | "kb.cold_chain_readings";
// Beyaz liste: her hedef için sabit, parametreli SQL (tablo adı kullanıcı girdisinden gelmez).
const DISPOSERS: Record<Target, { sil?: string; anonimlestir?: string }> = {
  "kb.notifications": { sil: "DELETE FROM kb.notifications WHERE created_at < $1" },
  "kb.task_events": { sil: "DELETE FROM kb.task_events WHERE at < $1" },
  "kb.sessions": { sil: "DELETE FROM kb.sessions WHERE expires_at < $1" },
  "kb.inbound_messages": { sil: "DELETE FROM kb.inbound_messages WHERE received_at < $1 AND status IN ('processed', 'ignored', 'dead_letter')" },
  "kb.outbound_messages": { sil: "DELETE FROM kb.outbound_messages WHERE created_at < $1 AND status IN ('sent', 'delivered', 'failed', 'cancelled', 'fallback_task')" },
  "kb.idempotency_keys": { sil: "DELETE FROM kb.idempotency_keys WHERE expires_at < $1" },
  "kb.encounters": { anonimlestir: "UPDATE kb.encounters SET patient_token = 'P-0000', external_visit_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex') WHERE discharged_at < $1 AND patient_token <> 'P-0000'" },
  "vault.identities": { anonimlestir: "SELECT kvkk.dispose_identities($1) AS n" },
  "kb.cold_chain_readings": { sil: "DELETE FROM kb.cold_chain_readings WHERE measured_at < $1" },
};

export async function runDisposal(tx: Queryable, tenantId: string, actor: string, now = new Date()) {
  const policies = (await tx.query<{ target: Target; retention_days: number; action: "sil" | "anonimlestir"; legal_reference: string }>(
    "SELECT target, retention_days, action, legal_reference FROM kvkk.retention_policies WHERE active ORDER BY target")).rows;
  const holds = new Set((await tx.query<{ target: string }>("SELECT DISTINCT target FROM kvkk.legal_holds WHERE released_at IS NULL AND subject_ref IS NULL")).rows.map((h) => h.target));
  const summary: Record<string, { action: string; cutoff: string; affected: number; skipped?: string; legal: string }> = {};
  for (const p of policies) {
    const cutoff = new Date(now.getTime() - p.retention_days * DAY);
    const entry = { action: p.action, cutoff: cutoff.toISOString(), affected: 0, legal: p.legal_reference } as (typeof summary)[string];
    const sql = DISPOSERS[p.target]?.[p.action];
    if (holds.has(p.target)) entry.skipped = "yasal saklama";
    else if (!sql) entry.skipped = "bu hedef için bu işlem tanımlı değil";
    else {
      const r = await tx.query<{ n?: number }>(sql.includes("RETURNING") || sql.startsWith("SELECT") ? sql : `WITH d AS (${sql} RETURNING 1) SELECT count(*)::int AS n FROM d`, [cutoff]);
      entry.affected = Number(r.rows[0]?.n ?? 0);
    }
    summary[p.target] = entry;
  }
  const report = JSON.stringify({ tenantId, actor, at: now.toISOString(), summary });
  const sha = createHash("sha256").update(report).digest("hex");
  const run = await tx.query<{ id: string }>("INSERT INTO kvkk.disposal_runs (tenant_id, actor, summary, report_sha256, finished_at) VALUES ($1, $2, $3, $4, now()) RETURNING id", [tenantId, actor, summary, sha]);
  await auditEvent(tx, tenantId, "kvkk.disposal_run", run.rows[0].id, `tutanak ${sha.slice(0, 16)}`);
  return { id: run.rows[0].id, summary, reportSha256: sha, report };
}

/** VERBİS hazırlığı için işleme envanteri dışa aktarımı (kişisel veri içermez). */
export async function exportInventory(tx: Queryable) {
  const r = await tx.query("SELECT a.code, a.purpose, a.data_categories, a.special_category, b.article AS legal_basis, a.data_subjects, a.recipients, a.storage_location, a.security_measures, a.role FROM kvkk.processing_activities a JOIN kvkk.legal_bases b ON b.code = a.legal_basis ORDER BY a.code");
  return r.rows;
}

export async function auditEvent(tx: Queryable, tenantId: string, action: string, resource: string, detail?: string) {
  await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, current_setting('app.actor', true), $2, $3, $4)", [tenantId, action, resource, detail ?? null]);
}
