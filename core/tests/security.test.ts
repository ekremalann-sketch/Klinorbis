// Veritabanı güvenliği: kurum ayrımı (RLS), birim kapsamı, kasa erişimi, kimliğe geri dönüş kaydı, değiştirilemez denetim
// zinciri, durum geçişleri, görevler ayrılığı ve ADR-003 (kuralla kritik öncelik yok). Gerçek PostgreSQL 17 (PGlite).
import assert from "node:assert/strict";
import test from "node:test";
import { withContext } from "../src/db.ts";
import { freshDb, seedTenant } from "./helpers.ts";

const db = await freshDb();
const A = await seedTenant(db, "KURUM-A");
const B = await seedTenant(db, "KURUM-B");
const ctxA = { tenantId: A.tenantId, actor: "ops@a.test", allUnits: true };
const ctxB = { tenantId: B.tenantId, actor: "ops@b.test", allUnits: true };
const task = (t: typeof A, ref: string, unit: string, extra = "") => db.query(`INSERT INTO kb.tasks (tenant_id, reference, unit_id, source, title${extra ? ", priority, priority_source" : ""}) VALUES ($1, $2, $3, 'manual', 'Kurgusal görev'${extra})`, [t.tenantId, ref, unit]);
await task(A, "TSK-A-0001", A.units.ytk); await task(A, "TSK-A-0002", A.units.ctm); await task(B, "TSK-B-0001", B.units.ytk);

test("kurum ayrımı: A bağlamında B'nin hiçbir kaydı görünmez ve B adına yazılamaz", async () => {
  const seen = await withContext(db, ctxA, (tx) => tx.query<{ reference: string }>("SELECT reference FROM kb.tasks ORDER BY reference"));
  assert.deepEqual(seen.rows.map((r) => r.reference), ["TSK-A-0001", "TSK-A-0002"]);
  const units = await withContext(db, ctxA, (tx) => tx.query("SELECT * FROM kb.units"));
  assert.equal(units.rows.length, 3);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("INSERT INTO kb.tasks (tenant_id, reference, unit_id, source, title) VALUES ($1, 'TSK-X-0001', $2, 'manual', 'Sızma denemesi')", [B.tenantId, B.units.ytk])), /row-level security/);
  const upd = await withContext(db, ctxA, (tx) => tx.query("UPDATE kb.tasks SET title = 'değişti' WHERE reference = 'TSK-B-0001' RETURNING id"));
  assert.equal(upd.rows.length, 0, "başka kurumun satırı güncellenemez");
});

test("bağlam yoksa hiçbir satır görünmez; geçersiz bağlam reddedilir", async () => {
  const r = await db.transaction(async (tx) => { await tx.query("SET LOCAL ROLE kb_app"); return tx.query("SELECT * FROM kb.tasks"); });
  assert.equal(r.rows.length, 0);
  await assert.rejects(withContext(db, { tenantId: "x'; DROP TABLE kb.tasks; --", actor: "a" }, async () => 1), /Geçersiz kurum/);
});

test("birim kapsamı: yalnız üyesi olunan birimin görevleri görünür", async () => {
  const r = await withContext(db, { tenantId: A.tenantId, actor: "ctm@a.test", unitIds: [A.units.ctm] }, (tx) => tx.query<{ reference: string }>("SELECT reference FROM kb.tasks"));
  assert.deepEqual(r.rows.map((x) => x.reference), ["TSK-A-0002"]);
});

test("kasa: uygulama rolü kimlik tablosunu doğrudan okuyamaz; geri dönüş yetki ve gerekçe ister, kayda geçer", async () => {
  await db.query("INSERT INTO vault.key_versions (tenant_id, purpose, wrapped_dek, kek_ref) VALUES ($1, 'identity', '\\x00', 'test-kek')", [A.tenantId]);
  await db.query("INSERT INTO vault.identities (token, tenant_id, national_id_bidx, identity_ciphertext, key_version) VALUES ('P-00A1', $1, repeat('a', 64), '\\x0102', (SELECT max(id) FROM vault.key_versions))", [A.tenantId]);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("SELECT * FROM vault.identities")), /permission denied/);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("SELECT * FROM kb.reidentify('P-00A1', 'Hasta yakını bilgilendirmesi için gerekli')")), /yetkisi yok/);
  await assert.rejects(withContext(db, { ...ctxA, canReidentify: true }, (tx) => tx.query("SELECT * FROM kb.reidentify('P-00A1', 'kısa')")), /15 karakter/);
  const ok = await withContext(db, { ...ctxA, canReidentify: true }, (tx) => tx.query("SELECT * FROM kb.reidentify('P-00A1', 'Hasta yakını bilgilendirmesi için gerekli')"));
  assert.equal(ok.rows.length, 1);
  const fromB = await withContext(db, { ...ctxB, canReidentify: true }, (tx) => tx.query("SELECT * FROM kb.reidentify('P-00A1', 'Başka kurumdan deneme yapılıyor burada')"));
  assert.equal(fromB.rows.length, 0, "başka kurum belirteci çözemez");
  const log = await db.query<{ n: number }>("SELECT count(*)::int n FROM vault.reidentification_log WHERE token = 'P-00A1'");
  assert.equal(log.rows[0].n, 2, "başarılı ve başarısız (sonuçsuz) çağrı da kayıtlı");
});

test("denetim zinciri: kayıtlar zincirlenir, değiştirilemez, silinemez; doğrulama sağlam", async () => {
  await withContext(db, ctxA, async (tx) => {
    for (const r of ["TSK-A-0001", "TSK-A-0002", "TSK-A-0003"]) await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource) VALUES ($1, 'ops@a.test', 'task.updated', $2)", [A.tenantId, r]);
  });
  const rows = (await db.query<{ prev_hash: string; hash: string }>("SELECT prev_hash, hash FROM audit.events WHERE tenant_id = $1 ORDER BY id", [A.tenantId])).rows;
  assert.equal(rows[0].prev_hash, "GENESIS"); assert.equal(rows[1].prev_hash, rows[0].hash);
  assert.equal((await db.query("SELECT audit.verify_chain($1) AS bad", [A.tenantId])).rows[0].bad, null);
  await assert.rejects(db.query("UPDATE audit.events SET actor = 'sahte' WHERE tenant_id = $1", [A.tenantId]), /değiştirilemez/);
  await assert.rejects(db.query("DELETE FROM audit.events WHERE tenant_id = $1", [A.tenantId]), /değiştirilemez/);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("DELETE FROM audit.events")), /permission denied|değiştirilemez/);
});

test("yatak: doluluk boşalınca yatak kendiliğinden kirli olur; kirli yatak temizlik/kontrol olmadan hazır olamaz; geçmiş tutulur", async () => {
  await withContext(db, ctxA, (tx) => tx.query("UPDATE kb.beds SET occupancy = 'dolu' WHERE id = $1", [A.bedId]));
  await withContext(db, ctxA, (tx) => tx.query("UPDATE kb.beds SET occupancy = 'bos' WHERE id = $1", [A.bedId]));
  const b = (await db.query<{ status: string; cleaning_state: string }>("SELECT status, cleaning_state FROM kb.beds WHERE id = $1", [A.bedId])).rows[0];
  assert.deepEqual([b.status, b.cleaning_state], ["cleaning", "kirli"]);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("UPDATE kb.beds SET cleaning_state = 'temiz' WHERE id = $1", [A.bedId])), /geçişine izin yok/);
  await withContext(db, ctxA, (tx) => tx.query("UPDATE kb.beds SET status = 'available' WHERE id = $1", [A.bedId]));
  assert.equal((await db.query<{ status: string }>("SELECT status FROM kb.beds WHERE id = $1", [A.bedId])).rows[0].status, "cleaning", "özet durum elle değiştirilemez; bileşenlerden türetilir");
  const h = await db.query<{ n: number }>("SELECT count(*)::int n FROM audit.row_history WHERE table_name = 'kb.beds' AND row_id = $1 AND op = 'UPDATE'", [A.bedId]);
  assert.ok(h.rows[0].n >= 2);
});

test("görev: tamamlanan görev yeniden açılamaz; sürüm otomatik artar ve elle değiştirilemez; olay geçmişi oluşur", async () => {
  await withContext(db, ctxA, (tx) => tx.query("UPDATE kb.tasks SET status = 'completed', completed_at = now(), completed_by = 'x' WHERE reference = 'TSK-A-0001'"));
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("UPDATE kb.tasks SET status = 'queued', completed_at = NULL WHERE reference = 'TSK-A-0001'")), /geçişine izin yok/);
  const v = await db.query<{ version: number }>("SELECT version FROM kb.tasks WHERE reference = 'TSK-A-0001'");
  assert.equal(v.rows[0].version, 2);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("UPDATE kb.tasks SET version = 99 WHERE reference = 'TSK-A-0002'")), /elle değiştirilemez/);
  const ev = await db.query<{ kind: string }>("SELECT kind FROM kb.task_events e JOIN kb.tasks t ON t.id = e.task_id WHERE t.reference = 'TSK-A-0001' ORDER BY e.id");
  assert.deepEqual(ev.rows.map((r) => r.kind), ["created", "status"]);
});

test("ADR-003: kural kaynaklı görev 'kritik' öncelik alamaz; personel kaynaklı alabilir", async () => {
  await assert.rejects(task(A, "TSK-A-0009", A.units.ytk, ", 'kritik', 'kural'"), /check constraint/);
  await task(A, "TSK-A-0010", A.units.ytk, ", 'kritik', 'personel'");
});

test("akış sürümü: taslağı yazan onaylayamaz; onaylı sürüm değiştirilemez", async () => {
  const pb = (await db.query<{ id: string }>("INSERT INTO kb.playbooks (tenant_id, code, title, category) VALUES ($1, 'yatak-hazirlik', 'Yatak hazırlığı', 'Yatak') RETURNING id", [A.tenantId])).rows[0].id;
  const def = JSON.stringify({ steps: [{ unit: "CTM", task: "Temizlik" }, { unit: "YTK", task: "Yatağı aç" }] });
  await assert.rejects(db.query("INSERT INTO kb.playbook_versions (tenant_id, playbook_id, version, status, definition, authored_by, approved_by, approved_at) VALUES ($1, $2, 1, 'approved', $3, 'ali', 'ali', now())", [A.tenantId, pb, def]), /check constraint/);
  await db.query("INSERT INTO kb.playbook_versions (tenant_id, playbook_id, version, status, definition, authored_by, approved_by, approved_at) VALUES ($1, $2, 1, 'approved', $3, 'ali', 'ayse', now())", [A.tenantId, pb, def]);
  await assert.rejects(db.query("UPDATE kb.playbook_versions SET definition = '{\"steps\":[1,2,3]}' WHERE playbook_id = $1", [pb]), /değiştirilemez/);
});

test("raporlama rolü kişi düzeyi tabloyu okuyamaz; yalnız toplu fonksiyon", async () => {
  await assert.rejects(withContext(db, { ...ctxA, role: "kb_reporting" }, (tx) => tx.query("SELECT * FROM kb.tasks")), /permission denied/);
  const r = await withContext(db, { ...ctxA, role: "kb_reporting" }, (tx) => tx.query<{ tasks: string; late_tasks: string | null }>("SELECT * FROM kb.report_task_delays(now() - interval '1 day', now() + interval '1 day')"));
  assert.ok(r.rows.length >= 1);
  assert.ok(r.rows.every((x) => Number(x.tasks) >= 5 || x.late_tasks === null), "küçük sayılar bastırılır");
});

test("KVKK: başvuru son günü 30 gün; ihlalde 72 saat otomatik; sağlık verisi yurt dışı aktarım kaydı reddedilir", async () => {
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("INSERT INTO kvkk.data_subject_requests (tenant_id, reference, kind, channel, received_at, due_at) VALUES ($1, 'KVKK-2026-AB12', 'erisim', 'yazili', now(), now() + interval '45 days')", [A.tenantId])), /check constraint/);
  const b = await withContext(db, ctxA, (tx) => tx.query<{ board_deadline: Date; learned_at: Date }>("INSERT INTO kvkk.breach_incidents (tenant_id, reference, detected_at, learned_at, description, board_deadline) VALUES ($1, 'IHL-2026-0001', now(), now(), 'Kurgusal ihlal senaryosu', now() + interval '10 days') RETURNING board_deadline, learned_at", [A.tenantId]));
  assert.equal(new Date(b.rows[0].board_deadline).getTime() - new Date(b.rows[0].learned_at).getTime(), 72 * 3600_000, "son an elle uzatılamaz");
  const p = (await withContext(db, ctxA, (tx) => tx.query<{ id: string }>("INSERT INTO kvkk.processors (tenant_id, name, service, country) VALUES ($1, 'Kurgusal Bulut', 'statik dosya', 'US') RETURNING id", [A.tenantId]))).rows[0].id;
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("INSERT INTO kvkk.cross_border_transfers (tenant_id, processor_id, data_categories, mechanism, contains_personal_data, contains_health_data) VALUES ($1, $2, '{saglik}', 'standart_sozlesme', true, true)", [A.tenantId, p])), /check constraint/);
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("INSERT INTO kvkk.processors (tenant_id, name, service, country, handles_special_category) VALUES ($1, 'Yurt dışı', 'barındırma', 'DE', true)", [A.tenantId])), /check constraint/);
});

test("entegrasyon: HBYS'ye yazan uç nokta tanımlanamaz; aynı kontrol numarası iki kez kaydedilmez", async () => {
  await assert.rejects(withContext(db, ctxA, (tx) => tx.query("INSERT INTO kb.integration_endpoints (tenant_id, kind, name, direction, writes_to_his) VALUES ($1, 'hl7v2_mllp', 'Yazan', 'outbound', true)", [A.tenantId])), /check constraint/);
  const ep = (await withContext(db, ctxA, (tx) => tx.query<{ id: string }>("INSERT INTO kb.integration_endpoints (tenant_id, kind, name, direction) VALUES ($1, 'hl7v2_mllp', 'ADT', 'inbound') RETURNING id", [A.tenantId]))).rows[0].id;
  const ins = (tx: { query: (s: string, p: unknown[]) => Promise<unknown> }) => tx.query("INSERT INTO kb.inbound_messages (tenant_id, endpoint_id, message_type, control_id, payload_sha256) VALUES ($1, $2, 'ADT^A01', 'MSG0001', repeat('b', 64))", [A.tenantId, ep]);
  await withContext(db, ctxA, ins);
  await assert.rejects(withContext(db, ctxA, ins), /duplicate key/);
});

test.after(() => db.close());
