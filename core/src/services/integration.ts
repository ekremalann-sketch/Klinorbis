// HBYS entegrasyon merkezi: mesaj izleme, kod eşleme, karantina çözümü (yeniden işle / yok say), mutabakat.
// Yeniden işleme kasadaki şifreli ham mesajla ve köprü rolüyle yapılır; aynı olay sırası ve tekrar kuralları geçerlidir.
import { keyedHash, open, type Keyring } from "../crypto.ts";
import { withContext, type Database, type Queryable } from "../db.ts";
import { parseAdt, Hl7Error } from "../bridge/hl7v2.ts";
import { ingestAdt } from "../bridge/ingest.ts";
import { conflict, invalid, notFound } from "./errors.ts";

export const REASON_LABELS: Record<string, string> = {
  UNMAPPED_UNIT: "HBYS birim kodu eşlenmemiş", UNMAPPED_BED: "HBYS yatak kodu eşlenmemiş", STALE: "Daha yeni bir olaydan sonra gelen eski mesaj",
  NO_ENCOUNTER: "İlgili yatış kaydı yok", CONFLICT: "Mevcut durumla çelişiyor (insan kararı gerekli)", NO_NATIONAL_ID: "Kimlik numarası yok", PARSE: "Mesaj okunamadı",
};

export async function messageOverview(tx: Queryable) {
  const counts = (await tx.query<{ status: string; n: number }>("SELECT status, count(*)::int n FROM kb.inbound_messages WHERE received_at > now() - interval '7 days' GROUP BY status")).rows;
  const open = (await tx.query(`SELECT id, message_type, control_id, status, quarantine_reason, error_code, attempts, event_at, received_at
    FROM kb.inbound_messages WHERE status IN ('quarantined', 'failed', 'dead_letter') ORDER BY received_at LIMIT 200`)).rows;
  const last = (await tx.query<{ at: Date | null }>("SELECT max(processed_at) AS at FROM kb.inbound_messages WHERE status = 'processed'")).rows[0]?.at ?? null;
  return { counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), open: (open as Array<{ id: string; quarantine_reason: string | null; error_code: string | null }>).map((m) => ({ ...m, reason_label: REASON_LABELS[String(m.quarantine_reason ?? m.error_code ?? "")] ?? null })), lastProcessedAt: last };
}

export async function addMapping(tx: Queryable, tenantId: string, input: { kind: "unit" | "bed"; externalCode: string; unitId?: string; bedId?: string }, actor: string) {
  const code = input.externalCode?.trim();
  if (!code || code.length > 60) throw invalid("HBYS kodu 1–60 karakter olmalı.");
  if (input.kind === "unit" && !input.unitId) throw invalid("Birim seçin.");
  if (input.kind === "bed" && !input.bedId) throw invalid("Yatak seçin.");
  const r = await tx.query<{ id: string }>(`INSERT INTO kb.code_mappings (tenant_id, kind, external_code, unit_id, bed_id, created_by) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id, system, kind, external_code) DO NOTHING RETURNING id`, [tenantId, input.kind, code, input.unitId ?? null, input.bedId ?? null, actor]);
  if (!r.rows[0]) throw conflict("Bu HBYS kodu zaten eşlenmiş.");
  await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, $2, 'integration.mapping_added', $3, $4)", [tenantId, actor, r.rows[0].id, `${input.kind}:${code}`]);
  return r.rows[0].id;
}
export async function listMappings(tx: Queryable) {
  return (await tx.query(`SELECT m.id, m.kind, m.external_code, m.active, u.name AS unit_name, b.code AS bed_code FROM kb.code_mappings m
    LEFT JOIN kb.units u ON u.id = coalesce(m.unit_id, (SELECT unit_id FROM kb.beds WHERE id = m.bed_id)) LEFT JOIN kb.beds b ON b.id = m.bed_id ORDER BY m.kind, m.external_code`)).rows;
}

/** Karantinadaki mesajı yeniden işler (eşleme eklendikten veya çelişki giderildikten sonra). */
export async function retryMessage(db: Database, tenantId: string, keys: Keyring, messageId: string, actor: string) {
  const bridge = { tenantId, actor: "kopru", role: "kb_bridge" as const, allUnits: true };
  const row = await withContext(db, bridge, async (tx) => (await tx.query<{ ciphertext: Uint8Array; key_version: number; expires_at: Date | null; status: string }>(
    "SELECT p.ciphertext, p.key_version, p.expires_at, m.status FROM kb.inbound_messages m LEFT JOIN vault.inbound_payloads p ON p.message_id = m.id WHERE m.id = $1", [messageId])).rows[0]);
  if (!row) throw notFound("Mesaj");
  if (!["quarantined", "failed"].includes(row.status)) throw conflict("Yalnız karantinadaki veya hatalı mesaj yeniden işlenir.");
  if (!row.ciphertext || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) throw conflict("Ham mesaj saklama süresi dolmuş; kaynak sistemden yeniden gönderilmeli.");
  const key = keys.identityVersions?.get(row.key_version) ?? (row.key_version === keys.identityKeyVersion ? keys.identity : undefined);
  if (!key) throw conflict("Mesajın şifreleme anahtarı erişilemiyor.");
  const raw = open(key, Buffer.from(row.ciphertext), Buffer.from(`${tenantId}|payload|${messageId}`)).toString("utf8");
  let parsed;
  try { parsed = parseAdt(raw); } catch (e) { throw conflict(e instanceof Hl7Error ? `Mesaj okunamadı: ${e.message}` : "Mesaj okunamadı."); }
  const result = await ingestAdt(db, { tenantId }, keys, parsed, raw, null, messageId);
  if (result.status === "processed") {
    await withContext(db, { tenantId, actor }, (tx) => tx.query("UPDATE kb.inbound_messages SET resolved_by = $2, resolved_at = now(), resolution = 'yeniden_islendi' WHERE id = $1", [messageId, actor]));
  }
  await withContext(db, { tenantId, actor }, (tx) => tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, $2, 'integration.retry', $3, $4)", [tenantId, actor, messageId, result.status]));
  return result;
}

export async function ignoreMessage(tx: Queryable, tenantId: string, messageId: string, reason: string, actor: string) {
  if (!reason || reason.trim().length < 10) throw invalid("Yok sayma gerekçesi en az 10 karakter olmalı.");
  const r = await tx.query("UPDATE kb.inbound_messages SET status = 'resolved', resolution = 'yok_sayildi', resolved_by = $2, resolved_at = now() WHERE id = $1 AND status IN ('quarantined', 'failed', 'dead_letter') RETURNING id", [messageId, actor]);
  if (!r.rows.length) throw conflict("Mesaj çözülebilir durumda değil.");
  await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, $2, 'integration.ignored', $3, $4)", [tenantId, actor, messageId, reason.trim().slice(0, 300)]);
}

export type CensusItem = { visit: string; unitCode: string; room?: string | null; bed?: string | null };
/** Mutabakat: HBYS'nin anlık yatan listesi ile Klinorbis'teki açık yatışları karşılaştırır. Farkları düzeltmez; listeler. */
export async function reconcile(tx: Queryable, tenantId: string, keys: Keyring, census: CensusItem[], actor: string) {
  if (!Array.isArray(census) || census.length > 5000) throw invalid("Liste en fazla 5000 satır olmalı.");
  const open = (await tx.query<{ external_visit_hash: string; unit_code: string; room_code: string | null; bed_code: string | null }>(`SELECT e.external_visit_hash, u.code AS unit_code, r.code AS room_code, b.code AS bed_code
    FROM kb.encounters e JOIN kb.units u ON u.id = e.unit_id LEFT JOIN kb.beds b ON b.id = e.bed_id LEFT JOIN kb.rooms r ON r.id = b.room_id
    WHERE e.status IN ('admitted', 'transferring', 'discharge_planned')`)).rows;
  const byHash = new Map(open.map((e) => [e.external_visit_hash, e]));
  const seen = new Set<string>();
  const items: { kind: string; visit_hash: string; detail: string }[] = [];
  for (const c of census) {
    if (!c?.visit || !c.unitCode) throw invalid("Her satırda ziyaret numarası ve birim kodu olmalı.");
    const h = keyedHash(keys.pseudonym, tenantId, "visit", String(c.visit));
    seen.add(h);
    const e = byHash.get(h);
    if (!e) { items.push({ kind: "missing_in_klinorbis", visit_hash: h, detail: `HBYS: ${c.unitCode} ${c.room ?? ""} ${c.bed ?? ""}`.trim() }); continue; }
    if (e.unit_code !== c.unitCode || (c.bed && e.bed_code !== c.bed)) items.push({ kind: "location_mismatch", visit_hash: h, detail: `HBYS ${c.unitCode}/${c.bed ?? "-"} · Klinorbis ${e.unit_code}/${e.bed_code ?? "-"}` });
  }
  for (const e of open) if (!seen.has(e.external_visit_hash)) items.push({ kind: "missing_in_hbys", visit_hash: e.external_visit_hash, detail: `Klinorbis: ${e.unit_code} ${e.bed_code ?? ""}`.trim() });
  const count = (k: string) => items.filter((i) => i.kind === k).length;
  const run = (await tx.query<{ id: string }>("INSERT INTO kb.reconciliation_runs (tenant_id, actor, census_count, matched, missing_in_klinorbis, missing_in_hbys, location_mismatch) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [tenantId, actor, census.length, census.length - count("missing_in_klinorbis") - count("location_mismatch"), count("missing_in_klinorbis"), count("missing_in_hbys"), count("location_mismatch")])).rows[0].id;
  for (const i of items) await tx.query("INSERT INTO kb.reconciliation_items (run_id, tenant_id, kind, visit_hash, detail) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [run, tenantId, i.kind, i.visit_hash, i.detail]);
  await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, $2, 'integration.reconciled', $3, $4)", [tenantId, actor, run, `${items.length} fark`]);
  return { runId: run, matched: census.length - count("missing_in_klinorbis") - count("location_mismatch"), missingInKlinorbis: count("missing_in_klinorbis"), missingInHbys: count("missing_in_hbys"), locationMismatch: count("location_mismatch"), items };
}
