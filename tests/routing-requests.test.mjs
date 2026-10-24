// Birim rehberi, talep yönlendirme ve birimden talep: her talep tek birime gider, işi o birim yapar,
// yönlendirmeyi yalnız yetkili kişi değiştirir, talep eden bitişi onaylar. Bellek içi SQLite, kurgusal hesaplar.
import assert from "node:assert/strict";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@kurgu.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER, demoEnabled: "0" });
const now = Date.now();
const HEM = "hemsire@kurgu.test", BTM = "bt.sorumlu@kurgu.test", BTG = "bt.gorevli@kurgu.test", TKG = "teknik@kurgu.test", ULG = "transport@kurgu.test", YTM = "yatak.sorumlu@kurgu.test", KVK = "kvkk@kurgu.test", CAG = "cagri@kurgu.test";
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Kurgu', 1, 1, 1)");
for (const [e, l, r, u] of [[HEM, "Hemşire", "clinician", "DHL"], [BTM, "BT Sorumlusu", "unit_manager", "BTI"], [BTG, "BT Teknisyeni", "call_agent", "BTI"], [TKG, "Teknik", "call_agent", "TKH"], [ULG, "Transport", "call_agent", "ULS"], [YTM, "Yatak Sorumlusu", "unit_manager", "YTK"], [KVK, "KVKK", "privacy_officer", "KVT"], [CAG, "Çağrı", "call_agent", "CAG"]]) { staff.run(e, l, r, now); member.run(e, u); }

const [units, dir, myWork, routing] = await Promise.all(["lib/hospital-units.ts", "lib/unit-directory.ts", "app/api/my-work/route.ts", "app/api/routing/route.ts"].map(loadRoute));
const mw = (email, body) => myWork.POST(browserJson("/api/my-work", body, email));
const rt = (email, body) => routing.POST(browserJson("/api/routing", body, email));
const get = async (route, path, email) => { const r = await route.GET(new Request(`${ORIGIN}${path}`, { headers: { "oai-authenticated-user-email": email } })); return { status: r.status, body: await r.json() }; };
const task = (ref) => sqlite.prepare("SELECT unit_code, status, assigned_user, title, location, source_type FROM operational_tasks WHERE reference = ?").get(ref);
const req = (ref) => sqlite.prepare("SELECT * FROM service_requests WHERE reference = ?").get(ref);
const newest = () => sqlite.prepare("SELECT * FROM service_requests ORDER BY created_at DESC, rowid DESC LIMIT 1").get();

await test("güvenlik gözetimi yönlendirmeyi değiştiremez; birim sorumlusu başka birimin iş sayılarını göremez", async () => {
  staff.run("security@kurgu.test", "Güvenlik", "security_officer", now);
  assert.equal((await rt("security@kurgu.test", { action: "set", code: "bt-bilgisayar", unitCode: "TKH" })).status, 403);
  const view = await get(routing, "/api/routing", YTM);
  const other = view.body.directory.flatMap(g => g.units).find(u => u.code === "BTI");
  assert.equal(other.open, null); assert.equal(other.members, null); assert.equal(other.unassigned, null);
  assert.equal(view.body.directory.flatMap(g => g.units).find(u => u.code === "YTK").open, 0);
});

await test("birim rehberi: kan alma, acil servis ve görüntüleme hizmetleri var; her talep türünün birimi gerçek", () => {
  const names = units.HOSPITAL_UNITS.map((u) => u.name);
  for (const n of ["Acil Servis", "Numune Kabul ve Kan Alma", "Laboratuvar", "Radyoloji", "Kan Merkezi", "Eczane", "Bilgi Teknolojileri", "Diyaliz Ünitesi", "Güvenlik Hizmetleri"]) assert.ok(names.includes(n), n);
  for (const s of ["Röntgen", "Bilgisayarlı tomografi", "Manyetik rezonans", "Ultrason"]) assert.ok(dir.UNIT_SERVICES.RAD.some((x) => x.startsWith(s)), s);
  assert.ok(dir.UNIT_SERVICES.NMK.includes("Kan alma"));
  assert.equal(new Set(dir.REQUEST_TYPES.map((t) => t.code)).size, dir.REQUEST_TYPES.length);
  for (const t of dir.REQUEST_TYPES) assert.ok(dir.unitExists(t.defaultUnit), `${t.code} → ${t.defaultUnit}`);
  for (const u of units.HOSPITAL_UNITS) assert.ok(dir.UNIT_GROUPS.some((g) => g.key === dir.groupOf(u)), u.code);
  // Klinik sınır: tetkik/kan ürünü/ilaç türleri istemin HBYS'de yapıldığını söyler.
  for (const code of ["kan-alma", "goruntuleme-sira", "kan-urunu", "ilac-teslim"]) assert.match(dir.requestType(code).clinicalNote, /HBYS/);
});

let first;
await test("talep: doğru birimin kuyruğuna sahipsiz düşer, birim sorumlusu bildirim alır; başka birim alamaz", async () => {
  const cat = (await get(myWork, "/api/my-work", HEM)).body.requestTypes.flatMap((g) => g.types).find((t) => t.code === "bt-bilgisayar");
  assert.equal(cat.unit.code, "BTI"); assert.equal(cat.dispatcher, "BT Sorumlusu");
  assert.equal((await mw(KVK, { action: "request", type: "bt-bilgisayar" })).status, 403, "gözetim rolü talep açamaz");
  assert.equal((await mw(HEM, { action: "request" })).status, 400);
  const r = await mw(HEM, { action: "request", type: "bt-bilgisayar", location: "Dahiliye 3", deviceCode: "PC-112", note: "Yazıcı çıktı vermiyor, ara 0532 111 22 33" });
  assert.equal(r.status, 200);
  const body = (await r.json()).result;
  assert.match(body.next, /Bilgi Teknolojileri/); assert.match(body.next, /BT Sorumlusu/);
  first = req(body.reference);
  assert.equal(first.unit_code, "BTI"); assert.equal(first.requester_unit, "DHL"); assert.match(first.note, /PHONE_MASKED/);
  const t = task(first.task_reference);
  assert.deepEqual({ unit: t.unit_code, status: t.status, owner: t.assigned_user, title: t.title, src: t.source_type }, { unit: "BTI", status: "queued", owner: null, title: "Bilgisayar / yazıcı", src: "service_request" });
  assert.ok(sqlite.prepare("SELECT 1 FROM staff_notifications WHERE email = ? AND title LIKE 'Yeni talep%'").get(BTM), "dağıtan kişiye bildirim");
  assert.equal((await mw(TKG, { action: "accept", reference: first.task_reference })).status, 403, "başka birim alamaz");
  assert.ok((await get(myWork, "/api/my-work", BTG)).body.available.some((x) => x.reference === first.task_reference), "BT ekibi görür");
});

await test("bitiş: görevli tamamlar, talep eden bilgilendirilir; sorun sürüyorsa aynı birime yeniden açılır", async () => {
  for (const action of ["accept", "start"]) assert.equal((await mw(BTG, { action, reference: first.task_reference })).status, 200, action);
  assert.equal((await mw(HEM, { action: "request.confirm", reference: first.reference, ok: true })).status, 409, "bitmeden onay yok");
  const done = await mw(BTG, { action: "complete", reference: first.task_reference });
  assert.equal(done.status, 200);
  assert.equal(req(first.reference).status, "done");
  assert.ok(sqlite.prepare("SELECT 1 FROM staff_notifications WHERE email = ? AND title LIKE 'Talebiniz tamamlandı%'").get(HEM));
  const mine = (await get(myWork, "/api/my-work", HEM)).body.requests.find((x) => x.reference === first.reference);
  assert.match(mine.state, /onayınız bekleniyor/);
  assert.equal((await mw(BTG, { action: "request.confirm", reference: first.reference, ok: true })).status, 404, "yalnız talep eden onaylar");
  const again = await mw(HEM, { action: "request.confirm", reference: first.reference, ok: false, note: "Yine yazdırmıyor" });
  assert.equal(again.status, 200);
  assert.equal(req(first.reference).status, "reopened");
  const n = newest();
  assert.equal(n.reopened_from, first.reference); assert.equal(n.unit_code, "BTI"); assert.equal(n.device_code, "PC-112");
});

await test("yönlendirme: yalnız operasyon / bilgi işlem değiştirir; değişiklik yeni talepleri etkiler ve kayda geçer", async () => {
  assert.equal((await rt(HEM, { action: "set", code: "bt-bilgisayar", unitCode: "TKH" })).status, 403);
  assert.equal((await rt(YTM, { action: "set", code: "bt-bilgisayar", unitCode: "TKH" })).status, 403, "başka birimin sorumlusu değiştiremez");
  assert.equal((await rt(BTM, { action: "set", code: "bt-bilgisayar", unitCode: "XXX" })).status, 400);
  assert.equal((await rt(BTM, { action: "set", code: "yok-boyle", unitCode: "TKH" })).status, 400);
  assert.equal((await rt(BTM, { action: "set", code: "bt-bilgisayar", unitCode: "TKH" })).status, 200);
  assert.ok(sqlite.prepare("SELECT 1 FROM audit_logs WHERE action = 'routing.changed'").get(), "denetim kaydı");
  const r = await mw(HEM, { action: "request", type: "bt-bilgisayar" });
  assert.equal(req((await r.json()).result.reference).unit_code, "TKH");
  assert.equal(task(first.task_reference).unit_code, "BTI", "eski iş yerinde kalır");
  const view = (await get(routing, "/api/routing", OWNER)).body;
  const row = view.typeGroups.flatMap((g) => g.types).find((t) => t.code === "bt-bilgisayar");
  assert.equal(row.unit.code, "TKH"); assert.equal(row.overridden, true); assert.equal(row.defaultUnit.code, "BTI");
  assert.equal((await rt(OWNER, { action: "reset", code: "bt-bilgisayar" })).status, 200);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM routing_rules").get().n, 0);
});

await test("ekranlar: yönlendirme ekranını birim sorumlusu görür ama değiştiremez; görevli göremez; taşıma nereden-nereye ister", async () => {
  const ym = await get(routing, "/api/routing", YTM);
  assert.equal(ym.status, 200); assert.equal(ym.body.canEdit, false);
  assert.ok(ym.body.directory.find((g) => g.key === "tani").units.some((u) => u.name === "Radyoloji" && u.services.length >= 4));
  assert.equal((await get(routing, "/api/routing", CAG)).status, 403);
  assert.equal((await mw(HEM, { action: "request", type: "hasta-tasima", location: "Dahiliye 3" })).status, 400, "hedef zorunlu");
  const ok = await mw(HEM, { action: "request", type: "hasta-tasima", location: "Dahiliye 3-12", targetLocation: "Radyoloji BT" });
  assert.equal(ok.status, 200);
  const t = task(req((await ok.json()).result.reference).task_reference);
  assert.equal(t.unit_code, "ULS"); assert.equal(t.location, "Dahiliye 3-12 → Radyoloji BT");
});

await test("veritabanı hatası tamamlamayı yarım bırakmaz; birimden çıkarılan görevli başlatamaz veya tamamlayamaz", async () => {
  const response = await mw(HEM, { action: "request", type: "bt-bilgisayar" });
  const record = req((await response.json()).result.reference);
  assert.equal((await mw(BTG, { action: "accept", reference: record.task_reference })).status, 200);
  sqlite.prepare("UPDATE unit_memberships SET active=0 WHERE email=?").run(BTG);
  for (const action of ["start", "complete"]) assert.equal((await mw(BTG, { action, reference: record.task_reference })).status, 403);
  sqlite.prepare("UPDATE unit_memberships SET active=1 WHERE email=?").run(BTG);
  sqlite.exec("CREATE TRIGGER fail_request_done BEFORE UPDATE OF status ON service_requests WHEN NEW.status='done' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  try {
    assert.ok((await mw(BTG, { action: "complete", reference: record.task_reference })).status >= 400);
    assert.equal(task(record.task_reference).status, "accepted"); assert.equal(req(record.reference).status, "open");
  } finally { sqlite.exec("DROP TRIGGER fail_request_done"); }
  assert.equal((await mw(BTG, { action: "complete", reference: record.task_reference })).status, 200);
});

await test("yeniden açma atomiktir; yönlendirme değişse de ilk birime döner ve eşzamanlı iki kez açılamaz", async () => {
  const parent = newest(); assert.equal(parent.status, "done");
  await rt(OWNER, { action: "set", code: parent.type_code, unitCode: "TKH" });
  const before = sqlite.prepare("SELECT count(*) n FROM operational_tasks").get().n;
  sqlite.exec("CREATE TRIGGER fail_reopen BEFORE INSERT ON service_requests WHEN NEW.reopened_from IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  try {
    assert.ok((await mw(HEM, { action: "request.confirm", reference: parent.reference, ok: false })).status >= 400);
    assert.equal(req(parent.reference).status, "done");
    assert.equal(sqlite.prepare("SELECT count(*) n FROM operational_tasks").get().n, before);
  } finally { sqlite.exec("DROP TRIGGER fail_reopen"); }
  const responses = await Promise.all([1, 2].map(() => mw(HEM, { action: "request.confirm", reference: parent.reference, ok: false })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const children = sqlite.prepare("SELECT * FROM service_requests WHERE reopened_from=?").all(parent.reference);
  assert.equal(children.length, 1); assert.equal(children[0].unit_code, parent.unit_code);
  await rt(OWNER, { action: "reset", code: parent.type_code });
});

await test("eşzamanlı tamamlama yalnız bir kez başarılı olur ve tek denetim kaydı üretir", async () => {
  const response = await mw(HEM, { action: "request", type: "bt-bilgisayar" });
  const record = req((await response.json()).result.reference);
  assert.equal((await mw(BTG, { action: "accept", reference: record.task_reference })).status, 200);
  const responses = await Promise.all([1,2].map(() => mw(BTG, { action: "complete", reference: record.task_reference })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM audit_logs WHERE resource=? AND action='request.done'").get(record.reference).n, 1);
});
