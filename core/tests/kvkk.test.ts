// KVKK modülü: başvuru 30 gün (kimlik beklemesi süreyi durdurmaz), ihlal 72 saat, erişim listesi, imha (beyaz liste,
// yasal saklama, onaysız politika çalışmaz), kasa anonimleştirme, envanter. Sentetik veri.
import assert from "node:assert/strict";
import test from "node:test";
import { withContext } from "../src/db.ts";
import { accessReport, breachHoursLeft, closeRequest, exportInventory, logAccess, openBreach, openRequest, recordBreachStep, requestsDueSoon, runDisposal, verifyRequestIdentity } from "../src/kvkk.ts";
import { registerIdentity, reidentify } from "../src/vault.ts";
import { freshDb, seedTenant } from "./helpers.ts";
import { FICTIONAL, syntheticNationalId, testKek } from "./fixtures.ts";
import { provisionTenantKeys } from "../src/keys.ts";

const db = await freshDb();
const A = await seedTenant(db, "KVKK-A");
const ctx = { tenantId: A.tenantId, actor: "kvkk@a.test", allUnits: true };
const run = <T>(fn: Parameters<typeof withContext<T>>[2]) => withContext(db, ctx, fn);
const DAY = 86_400_000;

test("başvuru: son gün 30 gün; kimlik doğrulama son günü değiştirmez; yaklaşan/geçen listesi", async () => {
  const received = new Date(Date.now() - 28 * DAY);
  const r = await run((tx) => openRequest(tx, A.tenantId, { kind: "erisim", channel: "yazili", receivedAt: received }));
  assert.equal(r.dueAt.getTime() - received.getTime(), 30 * DAY);
  await run((tx) => verifyRequestIdentity(tx, A.tenantId, r.id));
  const due = await run((tx) => requestsDueSoon(tx));
  const row = due.find((d) => d.reference === r.reference)!;
  assert.equal(new Date(row.due_at).getTime(), r.dueAt.getTime());
  assert.equal(row.daysLeft, 2); assert.equal(row.overdue, false);
  await assert.rejects(run((tx) => closeRequest(tx, A.tenantId, r.id, { answered: false, reason: "kısa" })), /check constraint/);
  await run((tx) => closeRequest(tx, A.tenantId, r.id, { answered: true, answerRef: "YANIT-0001" }));
  await assert.rejects(run((tx) => closeRequest(tx, A.tenantId, r.id, { answered: true, answerRef: "YANIT-0002" })), /kapatılabilir/);
});

test("ihlal: 72 saat sayacı; bildirim adımları zaman çizelgesine yazılır", async () => {
  const learned = new Date(Date.now() - 10 * 3_600_000);
  const b = await run((tx) => openBreach(tx, A.tenantId, { detectedAt: learned, learnedAt: learned, description: "Kurgusal senaryo: yanlış kişiye rapor gönderimi", dataCategories: ["saglik"], specialCategory: true }, "kvkk@a.test"));
  assert.equal(breachHoursLeft(b.boardDeadline), 61);
  await run((tx) => recordBreachStep(tx, A.tenantId, b.id, "bildirim_sorumlu", "Veri sorumlusu hastaneye bildirildi", "kvkk@a.test"));
  await run((tx) => recordBreachStep(tx, A.tenantId, b.id, "bildirim_kurul", "Kurul formu gönderildi (kurgusal)", "kvkk@a.test"));
  const row = (await db.query<{ status: string; board_notified_at: Date | null; controller_notified_at: Date | null }>("SELECT status, board_notified_at, controller_notified_at FROM kvkk.breach_incidents WHERE id = $1", [b.id])).rows[0];
  assert.equal(row.status, "notified_board"); assert.ok(row.board_notified_at && row.controller_notified_at);
  const ev = (await db.query<{ n: number }>("SELECT count(*)::int n FROM kvkk.breach_events WHERE breach_id = $1", [b.id])).rows[0].n;
  assert.equal(ev, 3);
});

test("erişim listesi: hasta belirtecine erişimler kişiye verilebilir biçimde listelenir", async () => {
  await run(async (tx) => { await logAccess(tx, A.tenantId, "ytk@a.test", "P-00AB12", "gorev", "TSK-1"); await logAccess(tx, A.tenantId, "hekim@a.test", "P-00AB12", "onay", "AKS-1"); });
  const list = await run((tx) => accessReport(tx, "P-00AB12"));
  assert.deepEqual(list.map((x) => x.actor), ["ytk@a.test", "hekim@a.test"]);
});

test("imha: onaysız politika etkinleşmez; beyaz liste dışı hedef reddedilir; yasal saklama atlanır; tutanak üretilir; kasa anonimleşir", async () => {
  await assert.rejects(run((tx) => tx.query("INSERT INTO kvkk.retention_policies (tenant_id, data_category, target, retention_days, action, legal_reference, active) VALUES ($1, 'bildirim', 'kb.notifications', 30, 'sil', 'Kurum politikası', true)", [A.tenantId])), /check constraint/);
  await assert.rejects(run((tx) => tx.query("INSERT INTO kvkk.retention_policies (tenant_id, data_category, target, retention_days, action, legal_reference) VALUES ($1, 'x', 'kb.staff', 30, 'sil', 'x')", [A.tenantId])), /check constraint/);
  const staffId = await A.staff("ytk.uye", "staff", [A.units.ytk]);
  await db.query("INSERT INTO kb.notifications (tenant_id, staff_id, kind, title, detail, link, dedupe_key, created_at) VALUES ($1, $2, 'task', 'Eski', 'eski', '/inbox', 'k1', now() - interval '60 days'), ($1, $2, 'task', 'Yeni', 'yeni', '/inbox', 'k2', now())", [A.tenantId, staffId]);
  const keys = await provisionTenantKeys(db, A.tenantId, testKek());
  const token = await withContext(db, { tenantId: A.tenantId, actor: "kopru", role: "kb_bridge" }, (tx) => registerIdentity(tx, A.tenantId, keys, { nationalId: syntheticNationalId(99), ...FICTIONAL }));
  await db.query("UPDATE vault.identities SET created_at = now() - interval '400 days' WHERE token = $1", [token]);
  await db.query("INSERT INTO kb.task_events (tenant_id, task_id, kind, actor, at) SELECT $1, id, 'note', 'x', now() - interval '900 days' FROM kb.tasks LIMIT 0", [A.tenantId]);
  await run((tx) => tx.query(`INSERT INTO kvkk.retention_policies (tenant_id, data_category, target, retention_days, action, legal_reference, approved_by, active) VALUES
    ($1, 'bildirim', 'kb.notifications', 30, 'sil', 'Kurum saklama politikası (kurgusal)', 'hukuk', true),
    ($1, 'kimlik', 'vault.identities', 365, 'anonimlestir', 'Kurum saklama politikası (kurgusal)', 'hukuk', true),
    ($1, 'oturum', 'kb.sessions', 30, 'sil', 'Kurum saklama politikası (kurgusal)', 'hukuk', true)`, [A.tenantId]));
  await run((tx) => tx.query("INSERT INTO kvkk.legal_holds (tenant_id, target, reason, placed_by) VALUES ($1, 'kb.sessions', 'Kurgusal soruşturma nedeniyle saklama', 'hukuk')", [A.tenantId]));
  const out = await run((tx) => runDisposal(tx, A.tenantId, "kvkk@a.test"));
  assert.equal(out.summary["kb.notifications"].affected, 1);
  assert.equal(out.summary["vault.identities"].affected, 1);
  assert.equal(out.summary["kb.sessions"].skipped, "yasal saklama");
  assert.match(out.reportSha256, /^[0-9a-f]{64}$/);
  const left = (await db.query<{ title: string }>("SELECT title FROM kb.notifications WHERE tenant_id = $1", [A.tenantId])).rows.map((r) => r.title);
  assert.deepEqual(left, ["Yeni"]);
  const who = await withContext(db, { ...ctx, canReidentify: true }, (tx) => reidentify(tx, A.tenantId, keys, token, "İmha sonrası çözme denemesi yapılıyor"));
  assert.equal(who, null, "anonimleştirilen belirteç artık çözülemez");
});

test("envanter: yalnız TR saklama; dışa aktarım hukuki sebep maddesiyle", async () => {
  await assert.rejects(run((tx) => tx.query("INSERT INTO kvkk.processing_activities (tenant_id, code, purpose, data_categories, special_category, legal_basis, data_subjects, storage_location, role) VALUES ($1, 'X1', 'x', '{a}', false, 'm5_2_c', '{hasta}', 'EU', 'veri_isleyen')", [A.tenantId])), /check constraint/);
  await run((tx) => tx.query("INSERT INTO kvkk.processing_activities (tenant_id, code, purpose, data_categories, special_category, legal_basis, data_subjects, role, security_measures) VALUES ($1, 'OPS-01', 'Birimler arası operasyon koordinasyonu', '{takma_ad,yatak,birim}', true, 'm6_3_e', '{hasta}', 'veri_isleyen', '{rls,sifreleme,denetim_izi}')", [A.tenantId]));
  const inv = await run((tx) => exportInventory(tx));
  assert.equal(inv.length, 1); assert.match(String(inv[0].legal_basis), /m\.6\/3-e/);
});

test.after(() => db.close());
