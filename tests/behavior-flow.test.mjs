// Sentetik talep → birim kuyruğu → kabul/işlem/aktarım → acil onay → çalışma alanı
// (vardiya) → rapor akışı; birim ve rol sınırları. Gerçek rota kodu, bellek içi SQLite.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@klinorbis.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER });
const now = Date.now();
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)");
const PEOPLE = {
  rnd: ["rnd.mgr@klinorbis.test", "unit_manager", ["RND"]],
  clin: ["acy.clin@klinorbis.test", "clinician", ["ACY"]],
  agent: ["cag.agent@klinorbis.test", "call_agent", ["CAG", "RND"]],
  privacy: ["privacy@klinorbis.test", "privacy_officer", []],
  security: ["security@klinorbis.test", "security_officer", []],
  nobody: ["no-units@klinorbis.test", "unit_manager", []],
};
for (const [email, role, units] of Object.values(PEOPLE)) { staff.run(email, email, role, now); for (const u of units) member.run(email, u); }
const who = (key) => key === "ops" ? OWNER : PEOPLE[key][0];

const [ticketsRoute, approvalsRoute, workspaceRoute, reportRoute] = await Promise.all([
  loadRoute("app/api/tickets/route.ts"), loadRoute("app/api/approvals/route.ts"),
  loadRoute("app/api/workspace/route.ts"), loadRoute("app/api/reports/export/route.ts"),
]);
const call = (method, path, key, body) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "same-origin", "x-klinorbis-request": "browser", ...(key ? { "oai-authenticated-user-email": who(key) } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const ticket = (ref) => ({ ...sqlite.prepare("SELECT unit_code, status, accepted_by FROM tickets WHERE reference = ?").get(ref) });
const task = (ref) => ({ ...sqlite.prepare("SELECT unit_code, status FROM operational_tasks WHERE ticket_reference = ?").get(ref) });
const patch = (key, reference, action, extra = {}) => ticketsRoute.PATCH(call("PATCH", "/api/tickets", key, { reference, action, ...extra }));

let ref;
await test("1) talep: çağrı görevlisi sentetik takma adla talep açar; birim kuyruğunda görev oluşur; kişisel veri maskelenir", async () => {
  const r = await ticketsRoute.POST(call("POST", "/api/tickets", "agent", { patientAlias: "HST-SENTETIK-01", subject: "Randevu tarih değişikliği talebi, dönüş numarası 0532 111 22 33", unitCode: "RND" }));
  assert.equal(r.status, 201);
  const body = await r.json(); ref = body.ticket.reference;
  assert.equal(body.destination.unitCode, "RND");
  assert.deepEqual(task(ref), { unit_code: "RND", status: "queued" });
  assert.ok(!sqlite.prepare("SELECT subject FROM tickets WHERE reference = ?").get(ref).subject.includes("0532"), "telefon maskelenmeli");
});
await test("2) kuyruk görünürlüğü: yalnız ilgili birim ve tüm-birim rolleri görür", async () => {
  const seen = async (key) => JSON.stringify(await (await ticketsRoute.GET(call("GET", "/api/tickets", key))).json()).includes(ref);
  assert.equal(await seen("rnd"), true);
  assert.equal(await seen("ops"), true);
  assert.equal(await seen("clin"), false, "başka birimin klinisyeni görmemeli");
  assert.equal(await seen("nobody"), false);
  assert.equal((await ticketsRoute.GET(call("GET", "/api/tickets"))).status, 401);
});
await test("3) başka birim kullanıcısı talebi kabul edemez, çözemez, aktaramaz", async () => {
  for (const action of ["accept", "start", "resolve"]) assert.equal((await patch("clin", ref, action)).status, 403, action);
  assert.equal((await patch("clin", ref, "transfer", { targetUnitCode: "ACY" })).status, 403);
  assert.equal(ticket(ref).status, "Yeni");
});
await test("4) gözetim rolleri (gizlilik/güvenlik) talebi değiştiremez", async () => {
  for (const key of ["privacy", "security"]) {
    for (const action of ["accept", "resolve"]) assert.equal((await patch(key, ref, action)).status, 403, `${key} ${action}`);
    assert.equal((await patch(key, ref, "transfer", { targetUnitCode: "ACY" })).status, 403);
  }
  assert.equal(ticket(ref).status, "Yeni");
});
await test("5) birim yöneticisi kabul → işleme al; görev durumu eşlenir", async () => {
  assert.equal((await patch("rnd", ref, "accept")).status, 200);
  assert.deepEqual([ticket(ref).status, ticket(ref).accepted_by, task(ref).status], ["Kabul edildi", who("rnd"), "accepted"]);
  assert.equal((await patch("rnd", ref, "start")).status, 200);
  assert.equal(task(ref).status, "in_progress");
});
await test("6) birimler arası aktarım: yeni birim devralır, eski birim artık işlem yapamaz", async () => {
  assert.equal((await patch("rnd", ref, "transfer", { targetUnitCode: "ACY" })).status, 200);
  assert.deepEqual(task(ref), { unit_code: "ACY", status: "queued" });
  assert.equal(ticket(ref).accepted_by, null);
  assert.equal((await patch("rnd", ref, "resolve")).status, 403, "eski birim kaydı kapatamamalı");
  assert.equal((await patch("clin", ref, "accept")).status, 200);
  assert.equal((await patch("clin", ref, "resolve")).status, 200);
  assert.deepEqual([ticket(ref).status, task(ref).status], ["Çözüldü", "completed"]);
});
await test("7) çözülmüş talep yeniden işlenemez (çift gönderim/eski sekme)", async () => {
  for (const action of ["accept", "start", "resolve"]) assert.equal((await patch("clin", ref, action)).status, 409, action);
  assert.equal(ticket(ref).status, "Çözüldü");
  const events = sqlite.prepare("SELECT COUNT(*) AS n FROM ticket_events WHERE ticket_reference = ? AND event_type = 'resolve'").get(ref).n;
  assert.equal(events, 1);
});
let emergency;
await test("8) acil olasılık sinyali: otomasyon durur, ACY'de insan onayı açılır; yetkili klinisyen onaylar", async () => {
  const r = await ticketsRoute.POST(call("POST", "/api/tickets", "agent", { patientAlias: "HST-SENTETIK-02", subject: "Arayan kişi göğüs ağrısı tarif ediyor (sentetik senaryo)" }));
  assert.equal(r.status, 201);
  emergency = (await r.json()).ticket.reference;
  assert.equal(ticket(emergency).unit_code, "ACY");
  const approval = sqlite.prepare("SELECT reference, status FROM approvals WHERE ticket_reference = ?").get(emergency);
  assert.equal(approval.status, "pending");
  assert.equal((await approvalsRoute.POST(call("POST", "/api/approvals", "agent", { reference: approval.reference, decision: "approve" }))).status, 403);
  assert.equal((await approvalsRoute.POST(call("POST", "/api/approvals", "clin", { reference: approval.reference, decision: "approve" }))).status, 200);
  assert.deepEqual([ticket(emergency).status, task(emergency).status], ["Kabul edildi", "accepted"]);
});
await test("9) çalışma alanı: birim kullanıcısı yalnız kendi biriminin talep, görev, vardiya ve onaylarını görür", async () => {
  const r = await workspaceRoute.GET(call("GET", "/api/workspace", "rnd"));
  assert.equal(r.status, 200);
  const snap = await r.json();
  const units = new Set([...snap.tickets.map((t) => t.unitCode), ...snap.tasks.map((t) => t.unitCode), ...snap.approvals.map((a) => a.unitCode)]);
  assert.deepEqual([...units].filter((u) => u !== "RND"), [], "başka birim kaydı görünmemeli");
  assert.ok(!JSON.stringify(snap).includes(emergency), "ACY acil talebi RND'ye görünmemeli");
  const ops = await (await workspaceRoute.GET(call("GET", "/api/workspace", "ops"))).json();
  assert.ok(JSON.stringify(ops).includes(emergency));
  const empty = await (await workspaceRoute.GET(call("GET", "/api/workspace", "nobody"))).json();
  assert.deepEqual([empty.tickets.length, empty.tasks.length], [0, 0]);
});
await test("10) rapor: birim kullanıcısı ağ geneli raporu alamaz; yönetici CSV alır ve denetime işlenir", async () => {
  assert.equal((await reportRoute.GET(call("GET", "/api/reports/export?report=NETWORK_SUMMARY", "nobody"))).status, 403);
  const ops = await reportRoute.GET(call("GET", "/api/reports/export?report=NETWORK_SUMMARY", "ops"));
  assert.equal(ops.status, 200);
  assert.match(ops.headers.get("content-type"), /text\/csv/);
  const csv = await ops.text();
  assert.ok(csv.includes(emergency) || csv.length > 100);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'report.export'").get().n, 1);
  const rnd = await reportRoute.GET(call("GET", "/api/reports/export?report=NETWORK_SUMMARY", "rnd"));
  if (rnd.status === 200) assert.ok(!(await rnd.text()).includes(emergency), "birim raporu başka birim talebini içermemeli");
});
await test("11) eşzamanlılık: aynı talebi iki kişi aynı anda kabul ederse biri kazanır, tek olay yazılır", async () => {
  const r = await ticketsRoute.POST(call("POST", "/api/tickets", "agent", { patientAlias: "HST-SENTETIK-03", subject: "Randevu iptal talebi (sentetik)", unitCode: "RND" }));
  const reference = (await r.json()).ticket.reference;
  const [a, b] = await Promise.all([patch("rnd", reference, "accept"), patch("agent", reference, "accept")]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ticket_events WHERE ticket_reference = ? AND event_type = 'accept'").get(reference).n, 1);
});
