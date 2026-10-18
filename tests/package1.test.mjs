// Paket 1: koşullu akış zinciri, yapılandırılmış alanlar, kişisel bildirim, gecikme yükseltmesi ve sanal hastane simülasyonu.
// Bellek içi SQLite, yalnız sentetik hesaplar; hasta verisi yok, ağ yok.
import assert from "node:assert/strict";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OPS = "ops@klinorbis.test", OPS2 = "ops2@klinorbis.test", YTKM = "ytk.mgr@klinorbis.test", CTM = "ctm@klinorbis.test", TBR = "tbr@klinorbis.test", LONE = "lone@klinorbis.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OPS });
const now = Date.now();
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)");
staff.run(OPS, "Ops", "operations_manager", now); staff.run(OPS2, "Ops2", "operations_manager", now);
for (const [email, role, unit] of [[YTKM, "unit_manager", "YTK"], [CTM, "call_agent", "CTM"], [TBR, "call_agent", "TBR"], [LONE, "call_agent", "EKK"]]) { staff.run(email, email, role, now); member.run(email, unit); }

const [route, notif, sim, simLib, escEntry, lib] = await Promise.all([
  loadRoute("app/api/playbooks/route.ts"), loadRoute("app/api/notifications/route.ts"), loadRoute("app/api/simulation/route.ts"),
  loadRoute("lib/simulation.ts"), loadRoute("tests/helpers/package1-entry.ts"), loadRoute("lib/playbooks.ts"),
]);
const post = (email, body) => route.POST(browserJson("/api/playbooks", body, email));
const runOf = (ref) => sqlite.prepare("SELECT * FROM playbook_runs WHERE reference = ?").get(ref);
const children = (ref) => sqlite.prepare("SELECT playbook_code, campus, patient_ref FROM playbook_runs WHERE parent_reference = ?").all(ref).map((r) => ({ ...r }));
async function finish(ref, conditions) {
  for (;;) {
    const r = runOf(ref); if (r.status !== "active") return null;
    const step = lib.playbookOf(r.playbook_code).steps[r.current_step];
    const who = step.approval ? OPS2 : OPS;
    const res = await post(who, { action: "step.complete", reference: ref, version: r.version, conditions });
    assert.equal(res.status, 200, await res.clone().text());
    const body = await res.json(); if (body.done) return body;
  }
}

await test("kütüphane: koşullu zincirler geçerli ve koşul adları tanımlı", () => {
  assert.deepEqual(lib.validatePlaybooks(), []);
  assert.ok(lib.PLAYBOOKS.filter((p) => p.nextRules.some((r) => r.when)).length >= 15);
  assert.deepEqual(lib.chainTargets(lib.playbookOf("taburcu-planli"), []).start, ["yatak-hazirlik", "taburcu-anket"], "koşulsuz zincir her zaman açılır");
});

await test("koşullu zincir: yatak bulunduysa kapasite alarmı açılmaz, bulunamadıysa açılır", async () => {
  const a = await (await post(OPS, { action: "start", code: "acil-yatis-bekleyen" })).json();
  const doneA = await finish(a.reference, []);
  assert.deepEqual(children(a.reference), [], "koşul işaretlenmedi → bağlı akış yok");
  assert.equal(doneA.skipped[0].code, "kapasite-kirmizi");
  assert.ok(sqlite.prepare("SELECT 1 FROM audit_logs WHERE action = 'playbook.chain_skipped' AND resource = ?").get(a.reference));
  const b = await (await post(OPS, { action: "start", code: "acil-yatis-bekleyen", fields: { campus: "merkez", patientRef: "p-1042" } })).json();
  await finish(b.reference, ["yatak_yok", "uydurma_kosul"]);
  const kids = children(b.reference);
  assert.deepEqual(kids.map((k) => k.playbook_code), ["kapasite-kirmizi"]);
  assert.equal(kids[0].campus, "merkez", "alanlar bağlı akışa geçer");
  assert.equal(kids[0].patient_ref, "P-1042");
  assert.equal(runOf(b.reference).chain_choices, JSON.stringify(["yatak_yok"]), "yalnız tanımlı koşul kaydedilir");
});

await test("yapılandırılmış alanlar: hasta alanına ad yazılamaz, geçersiz yerleşke reddedilir", async () => {
  assert.equal((await post(OPS, { action: "start", code: "yatak-hazirlik", fields: { patientRef: "Ayşe Yılmaz" } })).status, 400);
  assert.equal((await post(OPS, { action: "start", code: "yatak-hazirlik", fields: { campus: "uzay-istasyonu" } })).status, 400);
  const ok = await post(OPS, { action: "start", code: "cihaz-ariza", fields: { deviceCode: "BMD-0457", location: "312-B" } });
  assert.equal(ok.status, 201);
  const row = runOf((await ok.json()).reference);
  assert.equal(row.device_code, "BMD-0457"); assert.equal(row.location, "312-B");
});

await test("bildirim: birime iş düşünce üyeye gider; kişi yalnız kendi bildirimini görür ve okur", async () => {
  await post(OPS, { action: "start", code: "yatak-hazirlik" }); // ilk adım TBR
  const get = (email) => notif.GET(new Request(`${ORIGIN}/api/notifications`, { headers: { "oai-authenticated-user-email": email } }));
  const mine = await (await get(TBR)).json();
  assert.ok(mine.unread >= 1 && mine.items[0].path === "/playbooks");
  assert.ok(!JSON.stringify(mine).includes("P-1042"), "bildirimde hasta kodu yok");
  const theirs = await (await get(CTM)).json();
  const foreign = mine.items.map((n) => n.id);
  const r = await notif.POST(browserJson("/api/notifications", { action: "read", ids: foreign }, CTM));
  assert.equal((await r.json()).changed, 0, "başkasının bildirimi okunmuş sayılamaz");
  assert.equal(theirs.items.filter((n) => foreign.includes(n.id)).length, 0);
  await notif.POST(browserJson("/api/notifications", { action: "read.all" }, TBR));
  assert.equal((await (await get(TBR)).json()).unread, 0);
});

const addTask = (ref, unit, minutesAgo) => sqlite.prepare("INSERT INTO operational_tasks (reference, unit_code, assigned_role, source_type, status, priority, due_at, created_at, updated_at) VALUES (?, ?, 'Test', 'ticket', 'queued', 'Normal', ?, ?, ?)").run(ref, unit, Date.now() - minutesAgo * 60000, now, now);
const level = (ref) => sqlite.prepare("SELECT escalation_level FROM operational_tasks WHERE reference = ?").get(ref).escalation_level;
const notes = (email, task) => sqlite.prepare("SELECT COUNT(*) n FROM staff_notifications WHERE email = ? AND kind = 'escalation' AND dedupe_key LIKE ?").get(email, `esc:${task}:%`).n;

await test("gecikme yükseltmesi: önce birim sorumlusu, 30 dk sonra operasyon yöneticisi; tekrar çalışınca çift bildirim yok", async () => {
  addTask("ESC-1", "YTK", 10);
  await escEntry.escalate();
  assert.equal(level("ESC-1"), 1);
  assert.equal(notes(YTKM, "ESC-1"), 1); assert.equal(notes(OPS, "ESC-1"), 0);
  await escEntry.escalate();
  assert.equal(notes(YTKM, "ESC-1"), 1, "aynı seviye ikinci kez bildirilmez");
  await escEntry.escalate(30);
  assert.equal(level("ESC-1"), 2);
  assert.equal(notes(OPS, "ESC-1"), 1); assert.equal(notes(OPS2, "ESC-1"), 1);
  assert.ok(sqlite.prepare("SELECT 1 FROM audit_logs WHERE action = 'task.escalated' AND resource = 'ESC-1'").get());
});

await test("gecikme yükseltmesi: birim sorumlusu yoksa doğrudan yönetime; tamamlanan iş ve gelecekteki iş yükselmez", async () => {
  addTask("ESC-2", "EKK", 5);
  addTask("ESC-3", "YTK", -60);
  addTask("ESC-4", "YTK", 90); sqlite.prepare("UPDATE operational_tasks SET status = 'completed' WHERE reference = 'ESC-4'").run();
  await escEntry.escalate();
  assert.equal(level("ESC-2"), 2); assert.equal(level("ESC-3"), 0); assert.equal(level("ESC-4"), 0);
});

await test("acil durdurma: yükseltme ve simülasyon çalışmaz", async () => {
  addTask("ESC-5", "YTK", 10);
  sqlite.prepare("INSERT INTO integration_events (event_id, source, event_type, payload_hash, status, received_at) VALUES ('automation:control','klinorbis','automation.control','-','paused',?)").run(Date.now());
  const r = await escEntry.escalate();
  assert.equal(r.paused, true); assert.equal(level("ESC-5"), 0);
  assert.equal((await sim.POST(browserJson("/api/simulation", { action: "run", params: {} }, OPS))).status, 409);
  sqlite.prepare("DELETE FROM integration_events WHERE event_id = 'automation:control'").run();
});

const counts = () => ["operational_tasks", "playbook_runs", "tickets", "staff_notifications", "playbook_steps"].map((t) => sqlite.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);

await test("simülasyon: aynı tohum aynı sonuç, farklı tohum farklı; kurgusal etiket ve tutarlı TL", () => {
  const a = simLib.runSimulation({ seed: 7 }), b = simLib.runSimulation({ seed: 7 }), c = simLib.runSimulation({ seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.events, c.events);
  assert.match(a.label, /SİMÜLASYON/); assert.match(a.label, /Kurgusal/);
  assert.ok(a.events.total > 50 && a.klinorbis.flows > 0);
  assert.ok(a.savings.conservativeMonthTL <= a.savings.perMonthTL);
  assert.ok(a.klinorbis.coordinationMinutes < a.phone.coordinationMinutes);
  assert.equal(a.phone.escalations, 0);
  const clamp = simLib.cleanParams({ days: 99, beds: -5, reachFailRate: 7 });
  assert.equal(clamp.days, 7); assert.equal(clamp.beds, 30); assert.equal(clamp.reachFailRate, 0.8);
  assert.ok(simLib.runSimulation({ beds: 600 }).events.total > a.events.total, "yatak sayısı olayları ölçekler");
});

await test("simülasyon API: yalnız operasyon yöneticisi; canlı tablolara yazmaz; dışarı istek yapmaz; temizlenir", async () => {
  assert.equal((await sim.POST(browserJson("/api/simulation", { action: "run", params: {} }, YTKM))).status, 403);
  assert.equal((await sim.GET(new Request(`${ORIGIN}/api/simulation`, { headers: { "oai-authenticated-user-email": TBR } }))).status, 403);
  const before = counts();
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("ağ yok"); };
  try {
    const res = await sim.POST(browserJson("/api/simulation", { action: "run", params: { seed: 11, beds: 200 } }, OPS));
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.id, /^SIM-/);
    const again = await (await sim.GET(new Request(`${ORIGIN}/api/simulation?id=${body.id}`, { headers: { "oai-authenticated-user-email": OPS } }))).json();
    assert.deepEqual(again.result.savings, body.result.savings);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(calls, 0, "yapay zekâ/dış servis çağrılmaz");
  assert.deepEqual(counts(), before, "canlı iş, akış, talep ve bildirim sayaçları değişmez");
  const list = await (await sim.GET(new Request(`${ORIGIN}/api/simulation`, { headers: { "oai-authenticated-user-email": OPS } }))).json();
  assert.equal(list.runs.length, 1);
  await sim.POST(browserJson("/api/simulation", { action: "clear" }, OPS));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM simulation_runs").get().n, 0);
});

const [workload, weekly] = await Promise.all([loadRoute("app/api/workload/route.ts"), loadRoute("app/api/weekly-report/route.ts")]);
const getAs = (mod, path, email) => mod.GET(new Request(`${ORIGIN}${path}`, { headers: { "oai-authenticated-user-email": email } }));

await test("iş yükü: yöneticiye özel; yoğun birim ve öneri; atama yalnız birim üyesine, kişiye bildirim", async () => {
  const YTK2 = "ytk.agent@klinorbis.test"; staff.run(YTK2, "YTK Görevli", "call_agent", now); member.run(YTK2, "YTK");
  for (let i = 0; i < 14; i++) addTask(`WL-${i}`, "YTK", i < 4 ? 20 : -60);
  assert.equal((await getAs(workload, "/api/workload", TBR)).status, 403);
  const body = await (await getAs(workload, "/api/workload", YTKM)).json();
  const ytk = body.units.find((u) => u.unitCode === "YTK");
  assert.equal(ytk.level, "yogun"); assert.ok(body.suggestions.length >= 1);
  assert.ok(body.units.every((u) => u.unitCode === "YTK"), "birim sorumlusu yalnız kendi birimini görür");
  assert.equal((await workload.POST(browserJson("/api/workload", { action: "assign", reference: "WL-0", email: TBR }, YTKM))).status, 400, "başka birimin üyesine atanamaz");
  assert.equal((await workload.POST(browserJson("/api/workload", { action: "assign", reference: "WL-0", email: YTK2 }, CTM))).status, 403, "yetkisiz atayamaz");
  const ok = await workload.POST(browserJson("/api/workload", { action: "assign", reference: "WL-0", email: YTK2 }, YTKM));
  assert.equal(ok.status, 200);
  assert.equal(sqlite.prepare("SELECT assigned_user FROM operational_tasks WHERE reference = 'WL-0'").get().assigned_user, YTK2);
  assert.ok(sqlite.prepare("SELECT 1 FROM staff_notifications WHERE email = ? AND dedupe_key LIKE 'assign:WL-0:%'").get(YTK2));
});

await test("haftalık rapor: yöneticiye özel; darboğaz, gecikme saati ve varsayımlı TL", async () => {
  assert.equal((await getAs(weekly, "/api/weekly-report", TBR)).status, 403);
  // Geciken bir akış adımı: 3 saat önce açılmış, hedefi 15 dk (yatak-hazirlik 1. adım TBR).
  const r = await (await post(OPS, { action: "start", code: "yatak-hazirlik" })).json();
  sqlite.prepare("UPDATE playbook_steps SET started_at = ? WHERE run_reference = ? AND step_index = 0").run(Date.now() - 3 * 3600_000, r.reference);
  const rep = await (await getAs(weekly, "/api/weekly-report?cost=500&followup=10", OPS)).json();
  assert.ok(rep.current.runs >= 1 && rep.current.lateSteps >= 1 && rep.current.overHours > 0);
  assert.ok(rep.bottlenecks.some((b) => b.unitCode === "TBR"));
  assert.equal(rep.money.assumptions.staffHourlyCostTL, 500);
  assert.equal(rep.money.costTL, Math.round(rep.money.followUpHours * 500));
  assert.ok(rep.advice.length >= 1);
});

await test("senaryolar: afet günü olayları artırır ve afet akışını açar; aynı tohum aynı sonuç", () => {
  const normal = simLib.runSimulation({ seed: 5 }), afet = simLib.runSimulation({ seed: 5 }, "kitlesel-yaralanma");
  assert.ok(afet.events.total > normal.events.total);
  assert.equal(afet.scenario.key, "kitlesel-yaralanma"); assert.ok(afet.scenario.crisis);
  assert.match(afet.summary[0], /Senaryo/);
  assert.deepEqual(simLib.runSimulation({ seed: 5 }, "kitlesel-yaralanma"), afet);
  assert.equal(simLib.runSimulation({ seed: 5 }, "uydurma").scenario.key, "normal");
  const eksik = simLib.runSimulation({ seed: 5 }, "personel-eksik");
  assert.equal(eksik.events.total, normal.events.total, "personel eksikliği olay sayısını değiştirmez");
});

await test("gecikme: 30 dakika dolmadan ikinci seviye açılmaz; eğitim çağrısı yükselmez", async () => {
 addTask("ESC-BOUNDARY", "YTK", 29.6);
 sqlite.prepare("INSERT INTO call_sessions (reference, patient_alias, source, training, started_at, last_message_at) VALUES ('CALL-SIM-1', 'HST-SIM-001', 'training', 1, ?, ?)").run(now, now);
 addTask("ESC-TRAINING", "YTK", 90);
 sqlite.prepare("UPDATE operational_tasks SET call_reference = 'CALL-SIM-1' WHERE reference = 'ESC-TRAINING'").run();
 await escEntry.escalate();
 assert.equal(level("ESC-BOUNDARY"), 1);
 assert.equal(level("ESC-TRAINING"), 0);
 assert.equal(notes(OPS, "ESC-TRAINING"), 0);
});

await test("iş yükü: eğitim çağrısı gerçek iş yüküne katılmaz; birim sorumlusu diğer birimi göremez", async () => {
 const body = await (await getAs(workload, "/api/workload", YTKM)).json();
 assert.ok(body.units.every(u => u.unitCode === 'YTK'));
 assert.ok(body.units.flatMap(u => u.unassigned).every(t => t.reference !== 'ESC-TRAINING'));
 const total = body.units.find(u => u.unitCode === 'YTK').open;
 sqlite.prepare("UPDATE call_sessions SET training = 0 WHERE reference = 'CALL-SIM-1'").run();
 const withReal = await (await getAs(workload, "/api/workload", YTKM)).json();
 assert.equal(withReal.units.find(u => u.unitCode === 'YTK').open, total + 1);
 sqlite.prepare("UPDATE call_sessions SET training = 1 WHERE reference = 'CALL-SIM-1'").run();
});
