// Entegrasyon merkezi, yatak bileşenleri ve temizlik akışı: karantina → eşleme → yeniden işleme, olay sırası (eski mesaj
// bitmiş işi açmaz), A11/A12/A13 düzeltmeleri, mutabakat, eşzamanlı rezervasyon ve kabul, bağımsız temizlik kontrolü.
import assert from "node:assert/strict";
import test from "node:test";
import { withContext } from "../src/db.ts";
import { adt } from "../src/bridge/fake-hbys.ts";
import { parseAdt } from "../src/bridge/hl7v2.ts";
import { ingestAdt } from "../src/bridge/ingest.ts";
import { provisionTenantKeys } from "../src/keys.ts";
import { addMapping, ignoreMessage, messageOverview, reconcile, retryMessage } from "../src/services/integration.ts";
import { blockBed, bedBoard, reserveBed, unblockBed } from "../src/services/beds.ts";
import { acceptJob, cleaningQueue, completeJob, inspectJob, startJob } from "../src/services/cleaning.ts";
import { freshDb, seedTenant } from "./helpers.ts";
import { testKek } from "./fixtures.ts";

const db = await freshDb();
const A = await seedTenant(db, "OPS-A");
const B = await seedTenant(db, "OPS-B");
const keys = await provisionTenantKeys(db, A.tenantId, testKek());
const room2 = (await db.query<{ id: string }>("INSERT INTO kb.rooms (tenant_id, unit_id, code) VALUES ($1, $2, '314') RETURNING id", [A.tenantId, A.units.dhl])).rows[0].id;
const bed2 = (await db.query<{ id: string }>("INSERT INTO kb.beds (tenant_id, room_id, unit_id, code) VALUES ($1, $2, $3, '314-B') RETURNING id", [A.tenantId, room2, A.units.dhl])).rows[0].id;
const ops = { tenantId: A.tenantId, actor: "ops@a.test", allUnits: true };
const as = (actor: string) => ({ ...ops, actor });
const t = (h: number) => new Date(Date.UTC(2026, 9, 19, h, 0, 0));
const send = async (raw: string) => ingestAdt(db, { tenantId: A.tenantId }, keys, parseAdt(raw), raw);
const bed = async (id: string) => (await db.query<{ status: string; occupancy: string; cleaning_state: string; conflict: string | null }>("SELECT status, occupancy, cleaning_state, conflict FROM kb.beds WHERE id = $1", [id])).rows[0];
const encStatus = async () => (await db.query<{ status: string }>("SELECT status FROM kb.encounters WHERE tenant_id = $1 ORDER BY admitted_at DESC NULLS LAST LIMIT 1", [A.tenantId])).rows[0]?.status;

test("eşlenmemiş HBYS kodu karantinaya alınır; eşleme eklenince yeniden işlenir; ham yük silinir; başka kurum göremez", async () => {
  const raw = adt("A01", { n: 1, visit: "V-1", unit: "DAHILIYE-4", room: "312", bed: "312-A" }, "M-0001", t(8));
  const r = await send(raw);
  assert.equal(r.status, "quarantined"); assert.equal(r.reason, "UNMAPPED_UNIT");
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM vault.inbound_payloads")).rows[0].n, 1);
  assert.equal((await bed(A.bedId)).occupancy, "bos", "karantinada veri değişmez");
  const overB = await withContext(db, { tenantId: B.tenantId, actor: "b", allUnits: true }, (tx) => messageOverview(tx));
  assert.equal(overB.open.length, 0);
  await withContext(db, ops, (tx) => addMapping(tx, A.tenantId, { kind: "unit", externalCode: "DAHILIYE-4", unitId: A.units.dhl }, "ops@a.test"));
  const again = await retryMessage(db, A.tenantId, keys, r.messageId!, "ops@a.test");
  assert.equal(again.status, "processed");
  assert.equal((await bed(A.bedId)).occupancy, "dolu");
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM vault.inbound_payloads")).rows[0].n, 0);
  const m = (await db.query<{ status: string; resolution: string }>("SELECT status, resolution FROM kb.inbound_messages WHERE id = $1", [r.messageId])).rows[0];
  assert.deepEqual([m.status, m.resolution], ["processed", "yeniden_islendi"]);
});

test("olay sırası: taburcudan sonra gelen ESKİ nakil mesajı bitmiş yatışı yeniden açmaz (karantina STALE)", async () => {
  await send(adt("A03", { n: 1, visit: "V-1", unit: "DAHILIYE-4", room: "312", bed: "312-A" }, "M-0003", t(12)));
  assert.equal(await encStatus(), "discharged");
  const late = await send(adt("A02", { n: 1, visit: "V-1", unit: "DAHILIYE-4", room: "314", bed: "314-B" }, "M-0002", t(10), { unit: "DAHILIYE-4", room: "312", bed: "312-A" }));
  assert.equal(late.reason, "STALE");
  assert.equal(await encStatus(), "discharged");
  assert.equal((await bed(bed2)).occupancy, "bos");
  assert.equal((await bed(A.bedId)).cleaning_state, "kirli", "taburcuda yatak kirli");
});

test("A13 taburcu iptali: yatak boşsa yatış geri alınır; A11 yatış iptali yatağı boşaltır", async () => {
  await send(adt("A13", { n: 1, visit: "V-1", unit: "DHL", room: "312", bed: "312-A" }, "M-0004", t(13)));
  assert.equal(await encStatus(), "admitted");
  const b = await bed(A.bedId);
  assert.equal(b.occupancy, "dolu"); assert.equal(b.conflict, "kirli_yataga_yatis", "kirli yatağa dönüş işaretlenir, insan çözer");
  await send(adt("A11", { n: 1, visit: "V-1", unit: "DHL", room: "312", bed: "312-A" }, "M-0005", t(14)));
  assert.equal(await encStatus(), "cancelled");
  assert.equal((await bed(A.bedId)).occupancy, "bos");
});

test("A12 nakil iptali: önceki yatak boşsa hasta önceki yatağa döner, nakil yatağı boşalır", async () => {
  await send(adt("A01", { n: 2, visit: "V-2", unit: "DHL", room: "314", bed: "314-B" }, "M-0101", t(15)));
  // İlk yatağı temizleyip hazırla, sonra nakil.
  const job = (await withContext(db, ops, (tx) => cleaningQueue(tx)))[0] as { id: string };
  await withContext(db, as("tmz1"), (tx) => startJob(tx, job.id, "tmz1"));
  await withContext(db, as("tmz1"), (tx) => completeJob(tx, job.id, "tmz1"));
  await withContext(db, as("sorumlu"), (tx) => inspectJob(tx, job.id, "sorumlu", true, A.units.ctm));
  await send(adt("A02", { n: 2, visit: "V-2", unit: "DHL", room: "312", bed: "312-A" }, "M-0102", t(16), { unit: "DHL", room: "314", bed: "314-B" }));
  assert.equal((await bed(A.bedId)).occupancy, "dolu"); assert.equal((await bed(bed2)).occupancy, "bos");
  const cancel = await send(adt("A12", { n: 2, visit: "V-2", unit: "DHL", room: "312", bed: "312-A" }, "M-0103", t(17)));
  assert.equal(cancel.status, "processed");
  assert.equal((await bed(bed2)).occupancy, "dolu"); assert.equal((await bed(A.bedId)).occupancy, "bos");
});

test("temizlik: iki kişi aynı işi aynı anda kabul edemez; yapan kişi kendi işini kontrol edemez; kalırsa yeniden işlem", async () => {
  const q = (await withContext(db, ops, (tx) => cleaningQueue(tx))) as { id: string; bed_code: string }[];
  const job = q.find((j) => j.bed_code === "312-A")!;
  const results = await Promise.allSettled([withContext(db, as("tmz1"), (tx) => acceptJob(tx, job.id, "tmz1")), withContext(db, as("tmz2"), (tx) => acceptJob(tx, job.id, "tmz2"))]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "tek kabul");
  await withContext(db, as("tmz1"), (tx) => startJob(tx, job.id, "tmz1"));
  assert.equal((await bed(A.bedId)).cleaning_state, "temizleniyor");
  await withContext(db, as("tmz1"), (tx) => completeJob(tx, job.id, "tmz1", ["yuzey", "carsaf"]));
  assert.equal((await bed(A.bedId)).cleaning_state, "kontrol_bekliyor");
  await assert.rejects(withContext(db, as("tmz1"), (tx) => inspectJob(tx, job.id, "tmz1", true, A.units.ctm)), /kendi işini/);
  const fail = await withContext(db, as("sorumlu"), (tx) => inspectJob(tx, job.id, "sorumlu", false, A.units.ctm));
  assert.ok(fail.rework?.created);
  assert.equal((await bed(A.bedId)).cleaning_state, "kirli");
  const rework = (await withContext(db, ops, (tx) => cleaningQueue(tx))) as { id: string; bed_code: string; rework: boolean }[];
  assert.ok(rework.find((j) => j.bed_code === "312-A")?.rework, "yeniden işlem kuyrukta önce");
});

test("yatak: hazır olmayan yatak ayrılamaz; eşzamanlı iki rezervasyondan biri kazanır; teknik engel ve HBYS çelişkisi", async () => {
  const job = ((await withContext(db, ops, (tx) => cleaningQueue(tx))) as { id: string; bed_code: string }[]).find((j) => j.bed_code === "312-A")!;
  await assert.rejects(withContext(db, ops, (tx) => reserveBed(tx, A.bedId, "P-00AA11", 60, "ytk")), /hazır değil/);
  await withContext(db, as("tmz2"), (tx) => startJob(tx, job.id, "tmz2"));
  await withContext(db, as("tmz2"), (tx) => completeJob(tx, job.id, "tmz2"));
  await withContext(db, as("sorumlu"), (tx) => inspectJob(tx, job.id, "sorumlu", true, A.units.ctm));
  const board = await withContext(db, ops, (tx) => bedBoard(tx));
  assert.equal(board.beds.find((b) => b.id === A.bedId)?.ready, true);
  const two = await Promise.allSettled([withContext(db, ops, (tx) => reserveBed(tx, A.bedId, "P-00AA11", 60, "ytk1")), withContext(db, ops, (tx) => reserveBed(tx, A.bedId, "P-00BB22", 60, "ytk2"))]);
  assert.equal(two.filter((r) => r.status === "fulfilled").length, 1, "çift rezervasyon yok");
  assert.equal((await bed(A.bedId)).status, "reserved");
  await withContext(db, ops, (tx) => blockBed(tx, A.bedId, "teknik", "Oksijen prizi arızalı (kurgusal)", "tkh"));
  assert.equal((await bed(A.bedId)).status, "maintenance");
  await send(adt("A01", { n: 3, visit: "V-3", unit: "DHL", room: "312", bed: "312-A" }, "M-0201", t(18)));
  const b = await bed(A.bedId);
  assert.equal(b.occupancy, "dolu"); assert.equal(b.conflict, "bloklu_yataga_yatis", "HBYS kararı kaydedilir, çelişki işaretlenir");
  await withContext(db, ops, (tx) => unblockBed(tx, A.bedId));
});

test("mutabakat: HBYS listesi ile farklar listelenir, kendiliğinden düzeltilmez; yok sayma gerekçe ister", async () => {
  const r = await withContext(db, ops, (tx) => reconcile(tx, A.tenantId, keys, [{ visit: "V-3", unitCode: "DHL", bed: "312-A" }, { visit: "V-99", unitCode: "DHL", bed: "314-B" }], "ops@a.test"));
  assert.equal(r.missingInKlinorbis, 1); assert.equal(r.missingInHbys, 1, "V-2 HBYS listesinde yok"); assert.equal(r.matched, 1);
  assert.ok(r.items.every((i) => !i.detail.includes("V-")), "farklarda ziyaret numarası yok");
  const q = await send(adt("A02", { n: 7, visit: "V-7", unit: "DHL", room: "312", bed: "312-A" }, "M-0301", t(19)));
  assert.equal(q.reason, "NO_ENCOUNTER");
  await assert.rejects(withContext(db, ops, (tx) => ignoreMessage(tx, A.tenantId, q.messageId!, "kısa", "ops")), /gerekçesi/);
  await withContext(db, ops, (tx) => ignoreMessage(tx, A.tenantId, q.messageId!, "Test mesajı, kaynak sistem yanlış gönderdi", "ops"));
  const over = await withContext(db, ops, (tx) => messageOverview(tx));
  assert.ok(!over.open.some((m) => m.id === q.messageId));
});

test.after(() => db.close());
