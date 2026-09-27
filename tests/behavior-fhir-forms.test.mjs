// FHIR R4 kapasite doğrulayıcı ve yapılandırılmış nakil/taburculuk formları (gerçek rota kodu, sentetik veri).
import assert from "node:assert/strict";
import test from "node:test";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@klinorbis.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER });
const add = (email, role, units) => { sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)").run(email, email, role, Date.now()); for (const u of units) sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)").run(email, u); };
add("sec@klinorbis.test", "security_officer", []); add("agent@klinorbis.test", "call_agent", ["CAG"]); add("uls@klinorbis.test", "unit_manager", ["ULS"]);
const [fhirRoute, ticketsRoute] = await Promise.all([loadRoute("app/api/integrations/fhir/route.ts"), loadRoute("app/api/tickets/route.ts")]);
const req = (method, path, email, body, raw) => new Request(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin", "x-klinorbis-request": "browser", ...(email ? { "oai-authenticated-user-email": email } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
const validate = (email, body, raw) => fhirRoute.POST(req("POST", "/api/integrations/fhir", email, body, raw));

await test("FHIR: örnek paket doğrulanır; yataklar birime eşlenir; doluluk ve uyarılar hesaplanır; hiçbir şey saklanmaz", async () => {
  const sample = (await (await fhirRoute.GET(req("GET", "/api/integrations/fhir", OWNER))).json()).sample;
  const before = sqlite.prepare("SELECT COUNT(*) n FROM capacity_snapshots").get().n;
  const r = await validate("sec@klinorbis.test", sample); assert.equal(r.status, 200);
  const report = await r.json();
  assert.equal(report.beds, 16);
  const yog = report.units.find((u) => u.unitCode === "YOG"); assert.deepEqual([yog.total, yog.occupied, yog.available, yog.occupancy], [10, 9, 1, 90]);
  const krd = report.units.find((u) => u.unitCode === "KRD"); assert.deepEqual([krd.occupied, krd.available, krd.cleaning, krd.blocked], [2, 2, 1, 1]);
  assert.ok(report.warnings.some((w) => /Yoğun Bakım: doluluk %90/.test(w)));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM capacity_snapshots").get().n, before, "doğrulayıcı kapasiteye yazmamalı");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='fhir.validate'").get().n, 1);
});

await test("FHIR: hatalı paketler açık hata verir (422); hasta kaynağı yok sayılır", async () => {
  const bad = await (await validate(OWNER, { resourceType: "Bundle", type: "collection", entry: [
    { resource: { resourceType: "Patient", id: "p1", name: [{ family: "Sentetik" }] } },
    { resource: { resourceType: "Location", id: "b1", physicalType: { coding: [{ code: "bd" }] }, operationalStatus: { code: "O" } } },
    { resource: { resourceType: "Location", id: "b2", physicalType: { coding: [{ code: "bd" }] }, operationalStatus: { code: "X" }, identifier: [{ system: "urn:klinorbis:unit", value: "KRD" }] } },
    { resource: { resourceType: "Location", id: "b3", physicalType: { coding: [{ code: "bd" }] }, operationalStatus: { code: "U" }, identifier: [{ system: "urn:klinorbis:unit", value: "YOK" }] } },
    { resource: { resourceType: "Location", id: "b3" } },
  ] })).json();
  assert.equal(bad.ok, false);
  for (const pattern of [/Location\/b1: birim kodu yok/, /"X" tanınmadı/, /"YOK" Klinorbis birimi değil/, /Location\/b3 iki kez/]) assert.ok(bad.errors.some((e) => pattern.test(e)), String(pattern));
  assert.ok(bad.warnings.some((w) => /Patient kaynağı yok sayıldı/.test(w)));
  assert.equal((await validate(OWNER, { resourceType: "Patient" })).status, 422);
  assert.equal((await validate(OWNER, undefined, "{bozuk")).status, 400);
});

await test("FHIR: yetki ve boyut sınırı", async () => {
  assert.equal((await validate("agent@klinorbis.test", { resourceType: "Bundle" })).status, 403);
  assert.equal((await validate(undefined, { resourceType: "Bundle" })).status, 401);
  assert.equal((await validate(OWNER, undefined, JSON.stringify({ resourceType: "Bundle", pad: "x".repeat(300_000) }))).status, 413);
});

await test("nakil formu: talep ULS birimine düşer; özet düzenli; kişisel veri maskelenir; aynı yer reddedilir", async () => {
  const post = (body) => ticketsRoute.POST(req("POST", "/api/tickets", "agent@klinorbis.test", { patientAlias: "HST-SENTETIK-21", ...body }));
  assert.equal((await post({ formKind: "transport", form: { from: "Radyoloji", to: "radyoloji", mobility: "Sedye" } })).status, 400);
  assert.equal((await post({ formKind: "transport", form: { from: "Radyoloji", to: "Kardiyoloji 3. kat", mobility: "Uçarak" } })).status, 400);
  const r = await post({ formKind: "transport", form: { from: "Radyoloji", to: "Kardiyoloji 3. kat", mobility: "Sedye", priority: "Yüksek", when: "14:30", oxygen: true, note: "Yakını 0532 111 22 33 ile aranacak" } });
  assert.equal(r.status, 201);
  const { ticket } = await r.json();
  const row = sqlite.prepare("SELECT unit_code, priority, channel, subject FROM tickets WHERE reference = ?").get(ticket.reference);
  assert.deepEqual([row.unit_code, row.priority, row.channel], ["ULS", "Yüksek", "Portal"]);
  assert.match(row.subject, /^\[Hasta nakli\] Radyoloji → Kardiyoloji 3\. kat · Sedye · Saat: 14:30 · Gerekli: oksijen desteği/);
  assert.ok(!row.subject.includes("0532"));
  const seen = JSON.stringify(await (await ticketsRoute.GET(req("GET", "/api/tickets", "uls@klinorbis.test"))).json());
  assert.ok(seen.includes(ticket.reference), "ULS birimi talebi görmeli");
});

await test("taburculuk formu: açık engeller listelenir; 3+ engel yüksek öncelik; tarih zorunlu; acil ifade acil akışa gider", async () => {
  const post = (form) => ticketsRoute.POST(req("POST", "/api/tickets", "agent@klinorbis.test", { patientAlias: "HST-SENTETIK-22", formKind: "discharge", form }));
  assert.equal((await post({ ward: "Dahiliye 4B" })).status, 400);
  const r = await post({ ward: "Dahiliye 4B / 12", plannedDate: "2026-10-01", done: ["epikriz", "recete", "hile"] });
  assert.equal(r.status, 201);
  const row = sqlite.prepare("SELECT unit_code, priority, subject FROM tickets WHERE reference = ?").get((await r.json()).ticket.reference);
  assert.equal(row.unit_code, "TBR"); assert.equal(row.priority, "Yüksek");
  assert.match(row.subject, /Tamam: 2\/6 · Açık engeller: Hasta\/yakın bilgilendirmesi/);
  const e = await post({ ward: "Dahiliye 4B / 12", plannedDate: "2026-10-01", done: [], note: "hasta nefes alamıyor" });
  const erow = sqlite.prepare("SELECT unit_code, priority, human_approval_required FROM tickets WHERE reference = ?").get((await e.json()).ticket.reference);
  assert.deepEqual([erow.unit_code, erow.priority, erow.human_approval_required], ["ACY", "Acil", 1], "acil sinyal güvenlik için önceliklidir");
  assert.equal((await ticketsRoute.POST(req("POST", "/api/tickets", "agent@klinorbis.test", { patientAlias: "HST-SENTETIK-23", formKind: "baska", form: {} }))).status, 400);
});
