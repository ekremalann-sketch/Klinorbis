// Operasyon akışları: kütüphane tutarlılığı, birimden birime ilerleme, onayda görev ayrılığı, akış ağı zinciri.
// Gerçek rota kodu, bellek içi SQLite, yalnız sentetik hesaplar; hasta verisi kullanılmaz.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@klinorbis.test";
const { d1, sqlite } = await createD1();
const SECRET = "test-only-event-secret";
setRuntime(d1, { ownerEmail: OWNER, webhookSecret: SECRET });
const now = Date.now();
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)");
const TBR = "tbr@klinorbis.test", CTM = "ctm@klinorbis.test", YTK = "ytk.mgr@klinorbis.test", YTK2 = "ytk.mgr2@klinorbis.test", KVT = "kvkk@klinorbis.test";
const YOGM = "yog.mgr@klinorbis.test", YOGD = "yog.doc@klinorbis.test", LABM = "lab.mgr@klinorbis.test", OPS2 = "ops2@klinorbis.test";
for (const [email, role, unit] of [[TBR, "call_agent", "TBR"], [CTM, "call_agent", "CTM"], [YTK, "unit_manager", "YTK"], [YTK2, "unit_manager", "YTK"], [KVT, "privacy_officer", "KVT"], [YOGM, "unit_manager", "YOG"], [YOGD, "clinician", "YOG"], [LABM, "unit_manager", "LAB"], [OPS2, "operations_manager", "YTK"]]) { staff.run(email, email, role, now); member.run(email, unit); }

const [route, lib, events, myWork] = await Promise.all([loadRoute("app/api/playbooks/route.ts"), loadRoute("lib/playbooks.ts"), loadRoute("app/api/integrations/events/route.ts"), loadRoute("app/api/my-work/route.ts")]);
const mw = (email, body) => myWork.POST(browserJson("/api/my-work", body, email));
const sign = (body, eventId, ts = String(Date.now())) => ({ "content-type": "application/json", "x-klinorbis-timestamp": ts, "x-klinorbis-event-id": eventId, "x-klinorbis-signature": createHmac("sha256", SECRET).update(`${ts}.${eventId}.${body}`).digest("hex") });
const get = (email) => route.GET(new Request(`${ORIGIN}/api/playbooks`, { headers: { "oai-authenticated-user-email": email } }));
const post = (email, body) => route.POST(browserJson("/api/playbooks", body, email));
const run = (ref) => ({ ...sqlite.prepare("SELECT status, current_step, version FROM playbook_runs WHERE reference = ?").get(ref) });
const task = (ref) => sqlite.prepare("SELECT unit_code, status FROM operational_tasks WHERE reference = ?").get(ref);

await test("kütüphane: en az 75 akış, bilinen birimler, var olan zincirler, onay adımları", () => {
  assert.ok(lib.PLAYBOOKS.length >= 75, `akış sayısı ${lib.PLAYBOOKS.length}`);
  assert.deepEqual(lib.validatePlaybooks(), []);
  const net = lib.playbookNetwork();
  assert.ok(net.handoffs.length >= 80, `devir sayısı ${net.handoffs.length}`);
  assert.ok(net.chains.length >= 25);
  assert.ok(lib.PLAYBOOKS.filter((p) => p.steps.some((s) => s.approval)).length >= 40);
});

let ref;
await test("başlatma: ilk adımın birimi başlatır; başka birim ve gözetim rolü başlatamaz", async () => {
  assert.equal((await post(CTM, { action: "start", code: "yatak-hazirlik" })).status, 403, "ilk adım TBR'de");
  assert.equal((await post(KVT, { action: "start", code: "yatak-hazirlik" })).status, 403, "gözetim rolü");
  assert.equal((await post(TBR, { action: "start", code: "yok-boyle" })).status, 404);
  const r = await post(TBR, { action: "start", code: "yatak-hazirlik", note: "Oda 312, ara 0532 111 22 33" });
  assert.equal(r.status, 201); ref = (await r.json()).reference;
  assert.equal(task(`TSK-${ref}-1`).status, "queued");
  assert.match(sqlite.prepare("SELECT note FROM playbook_runs WHERE reference = ?").get(ref).note, /PHONE_MASKED/, "notta telefon maskelenir");
});

await test("ilerleme: her adım yalnız kendi biriminde tamamlanır ve sonraki birime görev açar; sürüm çakışması 409", async () => {
  assert.equal((await post(CTM, { action: "step.complete", reference: ref, version: 1 })).status, 403, "1. adım TBR'nin");
  assert.equal((await post(TBR, { action: "step.complete", reference: ref, version: 1 })).status, 200);
  assert.equal(task(`TSK-${ref}-1`).status, "completed");
  assert.deepEqual({ ...task(`TSK-${ref}-2`) }, { unit_code: "CTM", status: "queued" });
  assert.equal((await post(CTM, { action: "step.complete", reference: ref, version: 1 })).status, 409, "eski sürüm");
  // Oda temizliği: akış ekranından doğrudan geçilemez; görevli tamamlar, başka bir sorumlu bağımsız kontrol eder.
  const direct = await post(CTM, { action: "step.complete", reference: ref, version: 2 });
  assert.equal(direct.status, 409); assert.equal((await direct.json()).code, "INSPECTION_REQUIRED");
  for (const action of ["accept", "start", "complete"]) assert.equal((await mw(CTM, { action, reference: `TSK-${ref}-2` })).status, 200, action);
  assert.equal(run(ref).current_step, 1, "kontrol olmadan ilerlemez");
  const ins = sqlite.prepare("SELECT inspection_task_reference AS r FROM cleaning_inspections WHERE run_reference = ?").get(ref).r;
  assert.equal((await mw(CTM, { action: "inspect", reference: ins, pass: true })).status, 403, "temizleyen kendi işini kontrol edemez");
  assert.equal((await mw(OWNER, { action: "inspect", reference: ins, pass: true })).status, 200);
  assert.equal(run(ref).current_step, 2);
});

await test("onay: başlatan kişi onay adımını geçemez, aynı birimden başka yönetici geçer", async () => {
  const r = await post(YTK, { action: "start", code: "servis-nakil" }); const nref = (await r.json()).reference;
  assert.equal((await post(YTK, { action: "step.complete", reference: nref, version: 1 })).status, 403);
  assert.equal((await post(YTK2, { action: "step.complete", reference: nref, version: 1 })).status, 200);
  assert.equal(run(nref).current_step, 1);
});

await test("akış ağı: taburculuk kapanınca yatak hazırlığı ve memnuniyet araması kendiliğinden başlar", async () => {
  const r = await post(OWNER, { action: "start", code: "taburcu-planli" }); const tref = (await r.json()).reference;
  let last;
  for (let v = 1; v <= 5; v++) { last = await post(OWNER, { action: "step.complete", reference: tref, version: v }); assert.equal(last.status, 200); }
  const body = await last.json();
  assert.equal(body.done, true);
  assert.deepEqual(body.started.map((s) => s.title).sort(), ["Taburcu sonrası memnuniyet araması", "Taburcu sonrası yatak hazırlığı"]);
  const children = sqlite.prepare("SELECT playbook_code FROM playbook_runs WHERE parent_reference = ? ORDER BY playbook_code").all(tref).map((x) => x.playbook_code);
  assert.deepEqual(children, ["taburcu-anket", "yatak-hazirlik"]);
  assert.equal(run(tref).status, "done");
});

await test("iptal: neden zorunlu; görev de iptal olur; görünürlük birime göre", async () => {
  assert.equal((await post(TBR, { action: "cancel", reference: ref, version: 3 })).status, 400);
  assert.equal((await post(TBR, { action: "cancel", reference: ref, version: 3, note: "Hasta servise geri döndü" })).status, 200);
  assert.equal(run(ref).status, "cancelled");
  assert.equal(task(`TSK-${ref}-3`).status, "cancelled");
  const ctmRuns = (await (await get(CTM)).json()).runs.map((x) => x.playbookCode);
  assert.ok(ctmRuns.includes("yatak-hazirlik"));
  assert.ok(ctmRuns.every((c) => lib.PLAYBOOKS.find((p) => p.code === c).steps.some((s) => s.unitCode === "CTM")), "temizlik birimi yalnız kendi adımı olan akışları görür");
  const all = (await (await get(OWNER)).json());
  assert.ok(all.playbooks.length >= 75 && all.network.handoffs.length > 0);
});

const advanceTo = async (email, ref, index) => { for (;;) { const r = run(ref); if (r.current_step >= index || r.status !== "active") return; const res = await post(email, { action: "step.complete", reference: ref, version: r.version }); assert.equal(res.status, 200, JSON.stringify(await res.json())); } };

await test("onay: operasyon yöneticisi dahil kimse kendi başlattığı akışın onay adımını geçemez", async () => {
  const r = await post(OPS2, { action: "start", code: "servis-nakil" }); const ref2 = (await r.json()).reference;
  const res = await post(OPS2, { action: "step.complete", reference: ref2, version: 1 });
  assert.equal(res.status, 403); assert.equal((await res.json()).code, "SELF_APPROVAL_BLOCKED");
  assert.equal((await post(OWNER, { action: "step.complete", reference: ref2, version: 1 })).status, 200, "başka yönetici onaylar");
});

await test("klinik onay: yoğun bakım önceliklendirmesini birim yöneticisi değil, birimin klinisyeni geçirir", async () => {
  const r = await post(OWNER, { action: "start", code: "yogun-bakim-yatak" }); const ref3 = (await r.json()).reference;
  await advanceTo(OWNER, ref3, 2);
  const v = run(ref3).version;
  const mgr = await post(YOGM, { action: "step.complete", reference: ref3, version: v });
  assert.equal(mgr.status, 403); assert.equal((await mgr.json()).code, "CLINICAL_APPROVER_REQUIRED");
  assert.equal((await post(OPS2, { action: "step.complete", reference: ref3, version: v })).status, 403, "operasyon yöneticisi de klinik adımı geçemez");
  assert.equal((await post(YOGD, { action: "step.complete", reference: ref3, version: v })).status, 200);
});

await test("iptal: akışta görevi olmayan birimin yöneticisi iptal edemez", async () => {
  const r = await post(TBR, { action: "start", code: "yatak-hazirlik" }); const ref4 = (await r.json()).reference;
  assert.equal((await post(LABM, { action: "cancel", reference: ref4, version: 1, note: "Gerek kalmadı" })).status, 403);
  assert.equal((await post(YTK, { action: "cancel", reference: ref4, version: 1, note: "Gerek kalmadı" })).status, 200, "YTK akışta görevli");
});

await test("tek işlem: aynı adımı iki kişi aynı anda tamamlarsa biri 409 alır, sonraki görev bir kez açılır", async () => {
  const r = await post(TBR, { action: "start", code: "yatak-hazirlik" }); const ref5 = (await r.json()).reference;
  const [a, b] = await Promise.all([post(TBR, { action: "step.complete", reference: ref5, version: 1 }), post(OWNER, { action: "step.complete", reference: ref5, version: 1 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM operational_tasks WHERE reference = ?").get(`TSK-${ref5}-2`).n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM playbook_steps WHERE run_reference = ?").get(ref5).n, 2);
  // Tamamlama ile iptal yarışı: biri kazanır, iptal edilmiş akışta yeni görev açılmaz.
  const v = run(ref5).version;
  const [c, d] = await Promise.all([post(OWNER, { action: "cancel", reference: ref5, version: v, note: "Yarış testi" }), post(CTM, { action: "step.complete", reference: ref5, version: v })]);
  assert.deepEqual([c.status, d.status].sort(), [200, 409]);
  if (run(ref5).status === "cancelled") assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM operational_tasks WHERE reference = ?").get(`TSK-${ref5}-3`).n, 0);
});

await test("gecikmeli adım: memnuniyet araması 48 saat dolmadan tamamlanamaz; zamanı gelince iş kutusuna düşer", async () => {
  const child = sqlite.prepare("SELECT reference, version FROM playbook_runs WHERE playbook_code = 'taburcu-anket' ORDER BY created_at DESC").get();
  const step = sqlite.prepare("SELECT activate_at, task_reference FROM playbook_steps WHERE run_reference = ? AND step_index = 0").get(child.reference);
  assert.ok(step.activate_at - Date.now() > 47 * 3600_000, "48 saat sonra");
  assert.equal(task(step.task_reference).status, "scheduled");
  const early = await post(OWNER, { action: "step.complete", reference: child.reference, version: child.version });
  assert.equal(early.status, 409); assert.equal((await early.json()).code, "STEP_NOT_ACTIVE");
  sqlite.prepare("UPDATE playbook_steps SET activate_at = ? WHERE run_reference = ? AND step_index = 0").run(Date.now() - 1000, child.reference);
  await get(OWNER);
  assert.equal(task(step.task_reference).status, "queued");
  assert.equal((await post(OWNER, { action: "step.complete", reference: child.reference, version: child.version })).status, 200);
});

await test("olay tetikleyici: imzalı cihaz arızası akışı başlatır; aynı olay ikinci kez akış açmaz; sahte imza reddedilir", async () => {
  const body = JSON.stringify({ type: "device.failure", note: "Kat 3 monitör, arayan 0532 111 22 33" });
  const bad = await events.POST(new Request(`${ORIGIN}/api/integrations/events`, { method: "POST", headers: { ...sign(body, "evt-dev-0001"), "x-klinorbis-signature": "0".repeat(64) }, body }));
  assert.equal(bad.status, 401);
  const ok = await events.POST(new Request(`${ORIGIN}/api/integrations/events`, { method: "POST", headers: sign(body, "evt-dev-0002"), body }));
  assert.equal(ok.status, 201); const first = await ok.json();
  const again = await events.POST(new Request(`${ORIGIN}/api/integrations/events`, { method: "POST", headers: sign(body, "evt-dev-0002"), body }));
  const second = await again.json(); assert.equal(second.duplicate, true); assert.equal(second.reference, first.reference);
  const r = sqlite.prepare("SELECT playbook_code, started_by, note FROM playbook_runs WHERE reference = ?").get(first.reference);
  assert.equal(r.playbook_code, "cihaz-ariza"); assert.match(r.started_by, /^olay:/); assert.match(r.note, /PHONE_MASKED/);
  const unknown = JSON.stringify({ type: "yok.boyle" });
  assert.equal((await events.POST(new Request(`${ORIGIN}/api/integrations/events`, { method: "POST", headers: sign(unknown, "evt-dev-0003"), body: unknown }))).status, 422);
});

await test("simülasyon yalnız operasyon yöneticisinde; rapor birim beklemesi ve hedef süre uyumunu verir", async () => {
  assert.equal((await post(YTK, { action: "event.simulate", type: "power.outage" })).status, 403);
  const sim = await post(OWNER, { action: "event.simulate", type: "power.outage" }); assert.equal(sim.status, 201);
  assert.equal(sqlite.prepare("SELECT started_by FROM playbook_runs WHERE reference = ?").get((await sim.json()).reference).started_by, OWNER);
  const data = await (await get(OWNER)).json();
  assert.ok(data.report.totals.runs >= 8 && data.report.totals.completedSteps > 5);
  const ytk = data.report.units.find((u) => u.unitCode === "YTK"); assert.ok(ytk && ytk.completed >= 1 && ytk.onTimeRate !== null);
  assert.ok(data.report.playbooks.find((p) => p.code === "taburcu-planli").done >= 1);
  assert.ok(data.triggers.length >= 20);
  const ctmData = await (await get(CTM)).json();
  assert.ok(ctmData.report.units.every((u) => u.unitCode === "CTM"), "birim kullanıcısı yalnız kendi biriminin performansını görür");
});

await test("geniş performans raporu parametre sınırını aşmaz ve başka birimin akışlarını toplamlarına katmaz", async () => {
  const insert = sqlite.prepare("INSERT INTO playbook_runs (reference, playbook_code, title, status, current_step, started_by, created_at, updated_at, version, step_count) VALUES (?, 'cihaz-ariza', 'Test', 'active', 0, ?, ?, ?, 1, 1)");
  for (let i = 0; i < 120; i++) insert.run(`BULK-${i}`, OWNER, now + i, now + i);
  const all = await get(OWNER); assert.equal(all.status, 200);
  assert.ok((await all.json()).report.totals.runs >= 120);
  const scoped = await get(CTM); assert.equal(scoped.status, 200);
  assert.ok(!(await scoped.json()).report.playbooks.some(p => p.code === "cihaz-ariza"));
});
