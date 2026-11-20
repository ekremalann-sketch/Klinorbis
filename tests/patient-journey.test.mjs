// Hasta süreç takibi: başvurudan çıkışa birimler arası otomatik akış, ret ile aktarma, tetkik ekleme,
// hastanın takip kodu + PIN ile kendi sürecini görmesi, eşzamanlılık ve yetki sınırları. Bellek içi SQLite, kurgusal hesaplar.
import assert from "node:assert/strict";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@kurgu.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER, demoEnabled: "0" });
const now = Date.now();
const KBL = "kabul@kurgu.test", PRV = "provizyon@kurgu.test", DHL = "dahiliye.hekim@kurgu.test", DHS = "dahiliye.sekreter@kurgu.test", NMK = "kanalma@kurgu.test", LAB = "lab@kurgu.test", VZN = "vezne@kurgu.test", DNS = "danisma@kurgu.test", RAD = "radyoloji@kurgu.test", KVK = "kvkk@kurgu.test";
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Kurgu', 1, 1, 1)");
for (const [e, l, r, u] of [[KBL, "Kabul", "call_agent", "KBL"], [PRV, "Provizyon", "call_agent", "PRV"], [DHL, "Dahiliye hekimi", "clinician", "DHL"], [DHS, "Dahiliye sekreteri", "call_agent", "DHL"], [NMK, "Kan alma", "call_agent", "NMK"], [LAB, "Laboratuvar", "call_agent", "LAB"], [VZN, "Vezne", "call_agent", "VZN"], [DNS, "Danışma", "call_agent", "DNS"], [RAD, "Radyoloji", "call_agent", "RAD"], [KVK, "KVKK", "privacy_officer", "KVT"]]) { staff.run(e, l, r, now); member.run(e, u); }

const [route, takip] = await Promise.all(["app/api/patient-journey/route.ts", "app/api/takip/route.ts"].map(loadRoute));
const post = (email, body) => route.POST(browserJson("/api/patient-journey", body, email));
const board = async (email) => { const r = await route.GET(new Request(`${ORIGIN}/api/patient-journey`, { headers: { "oai-authenticated-user-email": email } })); return { status: r.status, body: await r.json() }; };
const track = async (code, pin, ip = "198.51.100.7") => { const r = await takip.POST(new Request(`${ORIGIN}/api/takip`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ code, pin }) })); return { status: r.status, body: await r.json() }; };
const journey = (ref) => sqlite.prepare("SELECT * FROM patient_journeys WHERE reference = ?").get(ref);
const steps = (ref) => sqlite.prepare("SELECT unit_code, label, state, kind FROM patient_journey_steps WHERE journey_reference = ? ORDER BY seq").all(ref);
const view = async (email, ref) => (await board(email)).body.journeys.find((j) => j.reference === ref);
const step = async (email, ref, action, extra = {}) => { const j = await view(email, ref); return post(email, { action, reference: ref, version: j.version, ...extra }); };

let opened;
await test("süreci yalnız kabul/acil/danışma/çağrı birimi açar; ad, TCKN ve telefon kayda geçmez", async () => {
  assert.equal((await post(DHL, { action: "open", pathway: "poliklinik", clinicUnit: "DHL", alias: "P-1001" })).status, 403, "poliklinik süreç açamaz");
  assert.equal((await post(KVK, { action: "open", pathway: "poliklinik", clinicUnit: "DHL", alias: "P-1001" })).status, 403, "gözetim rolü yazamaz");
  assert.equal((await post(KBL, { action: "open", pathway: "poliklinik", clinicUnit: "LAB", alias: "P-1001" })).status, 400, "poliklinik başvurusu tanı birimine açılmaz");
  const r = await post(KBL, { action: "open", pathway: "poliklinik", clinicUnit: "DHL", alias: "P-1001 0532 111 22 33" });
  assert.equal(r.status, 200);
  opened = await r.json();
  assert.match(opened.trackingCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(opened.pin, /^\d{6}$/);
  const row = journey(opened.reference);
  assert.doesNotMatch(row.patient_alias, /0532/);
  assert.notEqual(row.tracking_hash, opened.trackingCode); assert.notEqual(row.pin_hash, opened.pin);
  assert.deepEqual(steps(opened.reference).map((s) => [s.unit_code, s.state]), [["KBL", "waiting"], ["PRV", "pending"], ["DHL", "pending"], ["VZN", "pending"], ["DNS", "pending"]]);
  assert.ok(sqlite.prepare("SELECT 1 FROM staff_notifications WHERE email = ? AND path = '/hasta-surecleri'").get(KBL), "kabul birimi bildirim alır");
});

await test("tamamla: hasta otomatik sonraki birime geçer; başka birim adımı işleyemez", async () => {
  assert.equal((await step(PRV, opened.reference, "complete")).status, 403, "sıra provizyonda değilken provizyon işleyemez");
  assert.equal((await step(KBL, opened.reference, "start")).status, 200);
  assert.equal((await step(KBL, opened.reference, "complete")).status, 200);
  assert.equal(steps(opened.reference)[1].state, "waiting");
  assert.ok(sqlite.prepare("SELECT 1 FROM staff_notifications WHERE email = ? AND title LIKE 'Sıradaki hasta%'").get(PRV), "provizyon bildirim alır");
  const j = await view(PRV, opened.reference);
  assert.equal(j.steps.length, 5, "personel tüm yolu baştan sona görür");
  assert.equal(j.can.complete, true);
});

await test("ret: provizyon reddi hastayı gerekçeyle vezneye aktarır, yol devam eder; hastaya gerekçe gösterilmez", async () => {
  assert.equal((await step(PRV, opened.reference, "reject", { note: "" })).status, 400, "gerekçe zorunlu");
  assert.equal((await step(PRV, opened.reference, "reject", { note: "Sigorta poliçesi pasif" })).status, 200);
  assert.deepEqual(steps(opened.reference).map((s) => [s.unit_code, s.state]).slice(1, 4), [["PRV", "rejected"], ["VZN", "waiting"], ["DHL", "pending"]]);
  const p = await track(opened.trackingCode, opened.pin);
  assert.equal(p.status, 200);
  assert.equal(p.body.current.unit, "Vezne ve Faturalandırma");
  assert.doesNotMatch(JSON.stringify(p.body), /poliçe|P-1001|kurgu\.test/i, "hasta görünümünde gerekçe, takma ad veya personel yok");
  assert.equal((await step(VZN, opened.reference, "complete")).status, 200);
  assert.equal(steps(opened.reference)[3].state, "waiting", "sonra polikliniğe döner");
});

await test("tetkik ekleme: yalnız birimin klinisyeni; hasta kan almaya → laboratuvara → sonuç için polikliniğe döner", async () => {
  assert.equal((await step(DHS, opened.reference, "add", { add: ["kan"] })).status, 403, "sekreter klinik istem ekleyemez");
  assert.equal((await step(DHL, opened.reference, "add", { add: ["yok-boyle"] })).status, 400);
  assert.equal((await step(DHL, opened.reference, "add", { add: ["kan", "rontgen"] })).status, 200);
  assert.deepEqual(steps(opened.reference).slice(3, 8).map((s) => [s.unit_code, s.state, s.kind]), [["DHL", "done", "path"], ["NMK", "waiting", "added"], ["LAB", "pending", "added"], ["RAD", "pending", "added"], ["DHL", "pending", "return"]]);
  for (const who of [NMK, LAB, RAD]) assert.equal((await step(who, opened.reference, "complete")).status, 200, who);
  const p = await track(opened.trackingCode, opened.pin);
  assert.equal(p.body.current.label, "Sonuç değerlendirme");
});

await test("eşzamanlı iki tamamla: biri geçer, diğeri 409; adım iki kez ilerlemez", async () => {
  const j = await view(DHL, opened.reference);
  const [a, b] = await Promise.all([post(DHL, { action: "complete", reference: j.reference, version: j.version }), post(DHS, { action: "complete", reference: j.reference, version: j.version })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(steps(opened.reference).filter((s) => s.unit_code === "VZN" && s.state === "waiting").length, 1);
});

await test("isteğe bağlı vezne adımı gerekçeyle atlanır; zorunlu adım atlanamaz; son adımda süreç kapanır", async () => {
  assert.equal((await step(VZN, opened.reference, "skip", { note: "Ödeme yok, SGK kapsamında" })).status, 200);
  assert.equal((await step(DNS, opened.reference, "skip", { note: "deneme" })).status, 400, "çıkış adımı zorunlu");
  assert.equal((await step(DNS, opened.reference, "complete")).status, 200);
  assert.equal(journey(opened.reference).status, "completed");
  const p = await track(opened.trackingCode, opened.pin);
  assert.equal(p.body.status, "completed"); assert.equal(p.body.current, null);
});

await test("hasta takibi: yanlış kod ve yanlış PIN aynı yanıtı verir; 5 hatalı PIN kodu kilitler", async () => {
  const r2 = await post(KBL, { action: "open", pathway: "tetkik", clinicUnit: "RAD", alias: "P-2002" });
  const o = await r2.json();
  const wrongCode = await track("ZZZZ-ZZZZ", "123456", "198.51.100.20");
  const wrongPin = await track(o.trackingCode, o.pin === "000000" ? "000001" : "000000", "198.51.100.20");
  assert.equal(wrongCode.status, 404); assert.equal(wrongPin.status, 404); assert.equal(wrongCode.body.error, wrongPin.body.error);
  assert.equal((await track("abc", "12", "198.51.100.20")).status, 400);
  for (let i = 0; i < 4; i++) await track(o.trackingCode, "999999" === o.pin ? "999998" : "999999", "198.51.100.21");
  const locked = await track(o.trackingCode, o.pin, "198.51.100.22");
  assert.equal(locked.status, 429, "doğru PIN de kilit süresince reddedilir");
  assert.equal(locked.body.code, "TRACKING_LOCKED");
});

await test("anonim hız sınırı: aynı IP dakikada 10 denemeden fazlasını yapamaz", async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await track("ABCD-EFGH", "111111", "203.0.113.99");
  assert.equal(last.status, 429);
});

await test("pano: tüm personel birim bazlı sayıları görür; süreç ayrıntısı yalnız yolu kendi biriminden geçenlere açık", async () => {
  const r = await post(KBL, { action: "open", pathway: "poliklinik", clinicUnit: "KRD", alias: "P-3003" });
  const o = await r.json();
  const lab = await board(LAB);
  assert.equal(lab.status, 200);
  assert.ok(lab.body.board.some((u) => u.code === "KBL" && u.waiting >= 1), "laboratuvar hastane genelindeki birim yükünü görür");
  assert.equal(lab.body.journeys.some((j) => j.reference === o.reference), false, "kardiyoloji hastasının ayrıntısı laboratuvara açık değil");
  assert.equal((await post(LAB, { action: "complete", reference: o.reference, version: 1 })).status, 404);
  const kvk = await board(KVK);
  assert.ok(kvk.body.journeys.some((j) => j.reference === o.reference), "gözetim rolü tümünü görür");
  assert.equal(kvk.body.canOpen, false);
});

await test("sonlandırma: yalnız operasyon yöneticisi/kabul sorumlusu, gerekçeyle; hasta 'danışmaya başvurun' görür", async () => {
  const r = await post(KBL, { action: "open", pathway: "acil", clinicUnit: "DHL", alias: "A-4004" });
  const o = await r.json();
  assert.equal((await step(VZN, o.reference, "cancel", { note: "Hasta ayrıldı" })).status, 403, "vezne süreci sonlandıramaz");
  // operasyon yöneticisi kurum sahibi olarak ilk istekte oluşur
  await board(OWNER);
  assert.equal((await step(OWNER, o.reference, "cancel", { note: "Hasta kendi isteğiyle ayrıldı" })).status, 200);
  const p = await track(o.trackingCode, o.pin, "198.51.100.40");
  assert.equal(p.body.status, "cancelled"); assert.match(p.body.statusText, /danışma/);
  assert.ok(sqlite.prepare("SELECT 1 FROM audit_logs WHERE action = 'journey.cancelled' AND resource = ?").get(o.reference));
});

await test("başka kökenden gelen yazma isteği engellenir", async () => {
  const r = await route.POST(new Request(`${ORIGIN}/api/patient-journey`, { method: "POST", headers: { "content-type": "application/json", origin: "https://kotu.example", "oai-authenticated-user-email": KBL }, body: JSON.stringify({ action: "open" }) }));
  assert.equal(r.status, 403);
  const t = await takip.POST(new Request(`${ORIGIN}/api/takip`, { method: "POST", headers: { "content-type": "application/json", origin: "https://kotu.example" }, body: JSON.stringify({ code: "ABCD-EFGH", pin: "111111" }) }));
  assert.equal(t.status, 403);
});
