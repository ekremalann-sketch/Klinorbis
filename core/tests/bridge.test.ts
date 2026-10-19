// Hastane köprüsü: HL7 v2 ayrıştırma ve ACK, FHIR eşleme, imza/tekrar koruması, sahte HBYS ile uçtan uca
// yatış → nakil → taburcu: yatak durumları, temizlik görevi, kasa, tekrar mesajı, klinik segmentin okunmaması.
import assert from "node:assert/strict";
import test from "node:test";
import { buildAck, Hl7Error, parseAdt } from "../src/bridge/hl7v2.ts";
import { mapEncounter, TCKN_SYSTEM } from "../src/bridge/fhir.ts";
import { memoryNonceStore, sign, verify } from "../src/bridge/signer.ts";
import { adt, syntheticTckn } from "../src/bridge/fake-hbys.ts";
import { ingestAdt, recordFailure } from "../src/bridge/ingest.ts";
import { provisionTenantKeys } from "../src/keys.ts";
import { freshDb, seedTenant } from "./helpers.ts";
import { testKek } from "./fixtures.ts";

const P = { n: 11, visit: "V-2026-0011", unit: "DHL", room: "312", bed: "312-A" };

test("HL7 v2: ADT^A01 ayrıştırılır; klinik segment okunmaz; ACK kimlik içermez", () => {
  const raw = adt("A01", P, "MSG-0001", new Date("2026-10-18T07:30:00Z")) + "\rDG1|1||I10^Kurgusal tanı";
  const m = parseAdt(raw);
  assert.equal(m.event, "A01"); assert.equal(m.controlId, "MSG-0001");
  assert.equal(m.patient.nationalId, syntheticTckn(11));
  assert.deepEqual([m.visit.unitCode, m.visit.room, m.visit.bed, m.visit.number], ["DHL", "312", "312-A", "V-2026-0011"]);
  assert.equal(m.occurredAt.toISOString(), "2026-10-18T07:30:00.000Z");
  assert.ok(!JSON.stringify(m).includes("I10"), "tanı okunmaz");
  const ack = buildAck(raw, "AA");
  assert.match(ack, /MSA\|AA\|MSG-0001/); assert.ok(!ack.includes(syntheticTckn(11)));
  assert.throws(() => parseAdt(raw.replace("ADT^A01", "ORU^R01")), (e: unknown) => e instanceof Hl7Error && e.code === "AR");
  assert.throws(() => parseAdt("XYZ"), Hl7Error);
});

test("FHIR R4 Encounter eşlenir; klinik alanlar alınmaz", () => {
  const m = mapEncounter({ resourceType: "Encounter", id: "enc-1", status: "in-progress", meta: { lastUpdated: "2026-10-18T08:00:00Z" }, period: { start: "2026-10-18T08:00:00Z" },
    identifier: [{ value: "V-9" }], reasonCode: [{ text: "kurgusal" }],
    location: [{ location: { identifier: { value: "DHL" } }, physicalType: { coding: [{ code: "wa" }] } }, { location: { identifier: { value: "312-A" } }, physicalType: { coding: [{ code: "bd" }] } }],
    contained: [{ resourceType: "Patient", identifier: [{ system: TCKN_SYSTEM, value: syntheticTckn(5) }], name: [{ family: "Kurgusal", given: ["Deneme"] }] }] });
  assert.equal(m.event, "A01"); assert.equal(m.visit.unitCode, "DHL"); assert.equal(m.visit.bed, "312-A");
  assert.ok(!JSON.stringify(m).includes("kurgusal\""));
  assert.throws(() => mapEncounter({ resourceType: "Patient" }), Hl7Error);
});

test("imza: doğru imza kabul; değişmiş gövde, eski zaman ve tekrar reddedilir", async () => {
  const nonces = memoryNonceStore(); const body = "MSH|...";
  const env = sign("gizli-anahtar-test", "kopru-01", body);
  assert.equal((await verify("gizli-anahtar-test", env, body, nonces)).ok, true);
  assert.equal((await verify("gizli-anahtar-test", env, body, nonces)).reason, "tekrar");
  assert.equal((await verify("gizli-anahtar-test", sign("gizli-anahtar-test", "kopru-01", body), body + "x", nonces)).reason, "imza");
  assert.equal((await verify("gizli-anahtar-test", sign("gizli-anahtar-test", "kopru-01", body, Date.now() - 10 * 60_000), body, nonces)).reason, "zaman penceresi");
});

test("uçtan uca: yatış → nakil → taburcu; yatak durumları, temizlik görevleri, kasa ve tekrar koruması", async () => {
  const db = await freshDb(); const A = await seedTenant(db, "KOPRU-A");
  const keys = await provisionTenantKeys(db, A.tenantId, testKek());
  // Nakil hedefi: ikinci oda/yatak.
  const room2 = (await db.query<{ id: string }>("INSERT INTO kb.rooms (tenant_id, unit_id, code) VALUES ($1, $2, '314') RETURNING id", [A.tenantId, A.units.dhl])).rows[0].id;
  await db.query("INSERT INTO kb.beds (tenant_id, room_id, unit_id, code) VALUES ($1, $2, $3, '314-B')", [A.tenantId, room2, A.units.dhl]);
  const bedStatus = async (code: string) => (await db.query<{ status: string }>("SELECT status FROM kb.beds WHERE code = $1 AND tenant_id = $2", [code, A.tenantId])).rows[0].status;
  const ctx = { tenantId: A.tenantId };

  const a01 = adt("A01", P, "MSG-1001");
  const r1 = await ingestAdt(db, ctx, keys, parseAdt(a01), a01);
  assert.equal(r1.status, "processed"); assert.equal(await bedStatus("312-A"), "occupied");
  assert.equal((await ingestAdt(db, ctx, keys, parseAdt(a01), a01)).status, "duplicate");

  const a02 = adt("A02", { ...P, room: "314", bed: "314-B" }, "MSG-1002", new Date(), { unit: "DHL", room: "312", bed: "312-A" });
  const r2 = await ingestAdt(db, ctx, keys, parseAdt(a02), a02);
  assert.equal(await bedStatus("312-A"), "cleaning"); assert.equal(await bedStatus("314-B"), "occupied");
  assert.equal(r2.cleaningJobs.length, 1);

  const a03 = adt("A03", { ...P, room: "314", bed: "314-B" }, "MSG-1003");
  const r3 = await ingestAdt(db, ctx, keys, parseAdt(a03), a03);
  assert.equal(await bedStatus("314-B"), "cleaning"); assert.equal(r3.cleaningJobs.length, 1);

  const enc = (await db.query<{ status: string; patient_token: string }>("SELECT status, patient_token FROM kb.encounters WHERE tenant_id = $1", [A.tenantId])).rows;
  assert.equal(enc.length, 1); assert.equal(enc[0].status, "discharged"); assert.match(enc[0].patient_token, /^P-[0-9A-F]{12}$/);
  const tasks = (await db.query<{ unit_id: string; source: string }>("SELECT unit_id, source FROM kb.tasks WHERE tenant_id = $1", [A.tenantId])).rows;
  assert.equal(tasks.length, 2); assert.ok(tasks.every((t) => t.unit_id === A.units.ctm && t.source === "maintenance"));
  const moves = (await db.query<{ reason: string }>("SELECT reason FROM kb.encounter_moves ORDER BY id")).rows.map((m) => m.reason);
  assert.deepEqual(moves, ["admit", "transfer", "discharge"]);
  const dump = JSON.stringify((await db.query("SELECT * FROM kb.encounters")).rows) + JSON.stringify((await db.query("SELECT * FROM kb.inbound_messages")).rows);
  assert.ok(!dump.includes(syntheticTckn(11)) && !dump.includes("V-2026-0011") && !dump.includes("Kurgusal"), "operasyon tablolarında kimlik/ziyaret no yok");

  await recordFailure(db, A.tenantId, "MSG-BAD", "ADT^A02", "bozuk", "PARSE");
  for (let i = 0; i < 5; i++) await recordFailure(db, A.tenantId, "MSG-BAD", "ADT^A02", "bozuk", "PARSE");
  assert.equal((await db.query<{ status: string }>("SELECT status FROM kb.inbound_messages WHERE control_id = 'MSG-BAD'")).rows[0].status, "dead_letter");
  await db.close();
});
