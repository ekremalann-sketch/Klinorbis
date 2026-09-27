// Personel ekleme/rol atama ve gerçek vardiya devri (gerçek rota kodu, bellek içi SQLite, sentetik e-postalar).
import assert from "node:assert/strict";
import test from "node:test";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@klinorbis.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER });
sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)").run("rnd.mgr@klinorbis.test", "RND Sorumlusu", "unit_manager", Date.now());
sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, 'RND', 'Test', 1, 1, 1)").run("rnd.mgr@klinorbis.test");

const [staffRoute, shiftsRoute, ticketsRoute] = await Promise.all([
  loadRoute("app/api/staff/route.ts"), loadRoute("app/api/shifts/route.ts"), loadRoute("app/api/tickets/route.ts"),
]);
const req = (method, path, email, body, origin = ORIGIN) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === ORIGIN ? "same-origin" : "cross-site", "x-klinorbis-request": "browser", ...(email ? { "oai-authenticated-user-email": email } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const save = (by, body) => staffRoute.POST(req("POST", "/api/staff", by, { action: "save", ...body }));
const staffGet = (by) => staffRoute.GET(req("GET", "/api/staff", by));
const shift = (by, body) => shiftsRoute.POST(req("POST", "/api/shifts", by, body));
const shiftsGet = async (by) => (await shiftsRoute.GET(req("GET", "/api/shifts", by))).json();
const MGR = "rnd.mgr@klinorbis.test", NEW = "rnd.yeni@klinorbis.test", AGENT = "cag.yeni@klinorbis.test", PRIV = "kvkk@klinorbis.test", ACY = "acy.klinik@klinorbis.test", OPS2 = "ops2@klinorbis.test";
const audit = (action) => sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?").get(action).n;

await test("1) personel: yalnız operasyon yöneticisi ekler; diğer roller rol haritasını görür ama listeyi göremez", async () => {
  assert.equal((await save(MGR, { email: NEW, displayLabel: "Yeni", systemRole: "clinician", memberships: [{ unitCode: "RND" }] })).status, 403);
  const body = await (await staffGet(MGR)).json();
  assert.deepEqual(body.staff, []);
  assert.ok(body.roles.call_agent.home, "rol haritası herkese açık");
  assert.equal((await staffGet()).status, 401);
  assert.equal((await staffRoute.POST(req("POST", "/api/staff", OWNER, { action: "save", email: NEW, displayLabel: "X", systemRole: "clinician", memberships: [{ unitCode: "RND" }] }, "https://evil.example"))).status, 403, "başka kökenden işlem");
});

await test("2) eklenen kişi hemen kendi rolüyle çalışır; eklenmeden önce erişimi yok", async () => {
  assert.equal((await staffGet(NEW)).status, 403, "rol atanmadan erişim olmamalı");
  const r = await save(OWNER, { email: " RND.Yeni@Klinorbis.test ", displayLabel: "RND Görevlisi 2", systemRole: "clinician", memberships: [{ unitCode: "RND" }] });
  assert.equal(r.status, 201);
  const me = (await (await staffGet(NEW)).json()).me;
  assert.deepEqual([me.email, me.role, me.unitCodes], [NEW, "clinician", ["RND"]]);
  assert.equal(audit("staff.create"), 1);
});

await test("3) doğrulama: birim rolü birimsiz olamaz; geçersiz birim/rol/e-posta reddedilir; gözetim rolüne birim bağlanmaz", async () => {
  assert.equal((await save(OWNER, { email: AGENT, displayLabel: "Çağrı", systemRole: "call_agent", memberships: [] })).status, 400);
  assert.equal((await save(OWNER, { email: AGENT, displayLabel: "Çağrı", systemRole: "call_agent", memberships: [{ unitCode: "YOK" }] })).status, 400);
  assert.equal((await save(OWNER, { email: AGENT, displayLabel: "Çağrı", systemRole: "admin", memberships: [{ unitCode: "CAG" }] })).status, 400);
  assert.equal((await save(OWNER, { email: "not-an-email", displayLabel: "Çağrı", systemRole: "call_agent", memberships: [{ unitCode: "CAG" }] })).status, 400);
  assert.equal((await save(OWNER, { email: AGENT, displayLabel: "Çağrı Görevlisi", systemRole: "call_agent", memberships: [{ unitCode: "CAG" }, { unitCode: "RND" }] })).status, 201);
  assert.equal((await save(OWNER, { email: PRIV, displayLabel: "KVKK", systemRole: "privacy_officer", memberships: [{ unitCode: "RND" }] })).status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM unit_memberships WHERE email = ? AND active = 1").get(PRIV).n, 0);
  assert.equal((await save(OWNER, { email: ACY, displayLabel: "Acil Klinik", systemRole: "clinician", memberships: [{ unitCode: "ACY" }] })).status, 201);
});

await test("4) rol/birim değişince eski birim yetkisi kapanır", async () => {
  assert.equal((await save(OWNER, { email: AGENT, displayLabel: "Çağrı Görevlisi", systemRole: "call_agent", memberships: [{ unitCode: "CAG" }] })).status, 200);
  assert.deepEqual((await (await staffGet(AGENT)).json()).me.unitCodes, ["CAG"]);
  assert.equal(audit("staff.update"), 1);
});

await test("5) yönetici kendini pasife alamaz veya rolünü düşüremez; pasife alınan kişi hemen erişimini kaybeder", async () => {
  assert.equal((await save(OWNER, { email: OPS2, displayLabel: "Operasyon 2", systemRole: "operations_manager" })).status, 201);
  assert.equal((await staffRoute.POST(req("POST", "/api/staff", OPS2, { action: "deactivate", email: OPS2 }))).status, 409);
  assert.equal((await save(OPS2, { email: OPS2, displayLabel: "Operasyon 2", systemRole: "clinician", memberships: [{ unitCode: "RND" }] })).status, 409);
  assert.equal((await staffRoute.POST(req("POST", "/api/staff", OPS2, { action: "deactivate", email: PRIV }))).status, 200);
  assert.equal((await staffGet(PRIV)).status, 403);
  assert.equal((await staffRoute.POST(req("POST", "/api/staff", OPS2, { action: "deactivate", email: PRIV }))).status, 404);
});

let ref;
await test("6) devir öncesi: RND sorumlusu bir talebi üstlenir", async () => {
  const r = await ticketsRoute.POST(req("POST", "/api/tickets", AGENT, { patientAlias: "HST-SENTETIK-09", subject: "Randevu değişikliği talebi, sentetik", unitCode: "RND" }));
  assert.equal(r.status, 201); ref = (await r.json()).ticket.reference;
  assert.equal((await ticketsRoute.PATCH(req("PATCH", "/api/tickets", MGR, { reference: ref, action: "accept" }))).status, 200);
  const view = await shiftsGet(MGR);
  assert.deepEqual(view.openWork.find((w) => w.unitCode === "RND").tickets, [ref]);
  assert.deepEqual(view.colleagues.map((c) => c.email), [NEW], "yalnız aynı birimdeki etkin görevliler devralabilir");
});

await test("7) devir başlatma kuralları: gözetim rolü, birim dışı kişi, kendine devir, çift bekleyen devir", async () => {
  await save(OWNER, { email: PRIV, displayLabel: "KVKK", systemRole: "privacy_officer" });
  assert.equal((await shift(PRIV, { action: "start", unitCode: "RND", toEmail: NEW })).status, 403);
  assert.equal((await shift(MGR, { action: "start", unitCode: "RND", toEmail: ACY })).status, 400, "başka birim görevlisine devir yok");
  assert.equal((await shift(MGR, { action: "start", unitCode: "RND", toEmail: MGR })).status, 400);
  assert.equal((await shift(MGR, { action: "start", unitCode: "ACY", toEmail: ACY })).status, 403);
  const [a, b] = await Promise.all([
    shift(MGR, { action: "start", unitCode: "RND", toEmail: NEW, note: "Bekleyen geri arama var: test@example.invalid" }),
    shift(MGR, { action: "start", unitCode: "RND", toEmail: NEW, note: "tekrar" }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const row = sqlite.prepare("SELECT * FROM shift_handoffs WHERE status = 'pending'").get();
  assert.ok(!row.note.includes("test@example.invalid"), "devir notunda e-posta maskelenmeli");
  assert.equal(row.open_tickets, 1);
});

await test("8) yalnız devralan kabul eder; başka birim göremez; kabulde açık iş devralana geçer", async () => {
  const id = sqlite.prepare("SELECT id FROM shift_handoffs WHERE status = 'pending'").get().id;
  assert.equal((await shift(MGR, { action: "accept", id })).status, 403);
  assert.equal((await shift(ACY, { action: "accept", id })).status, 403);
  assert.equal((await shiftsGet(ACY)).handoffs.length, 0, "başka birim devri görmemeli");
  assert.equal((await shift(NEW, { action: "accept", id })).status, 200);
  assert.equal(sqlite.prepare("SELECT accepted_by FROM tickets WHERE reference = ?").get(ref).accepted_by, NEW);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ticket_events WHERE ticket_reference = ? AND event_type = 'shift_handoff'").get(ref).n, 1);
  assert.equal((await shift(NEW, { action: "accept", id })).status, 409, "ikinci kabul");
  assert.equal(audit("shift.handoff.accept"), 1);
});

await test("9) eşzamanlı kabul ve iptal: yalnız biri uygulanır", async () => {
  assert.equal((await shift(NEW, { action: "start", unitCode: "RND", toEmail: MGR })).status, 201);
  const id = sqlite.prepare("SELECT id FROM shift_handoffs WHERE status = 'pending'").get().id;
  const [a, b] = await Promise.all([shift(MGR, { action: "accept", id }), shift(NEW, { action: "cancel", id })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const status = sqlite.prepare("SELECT status FROM shift_handoffs WHERE id = ?").get(id).status;
  const owner = sqlite.prepare("SELECT accepted_by FROM tickets WHERE reference = ?").get(ref).accepted_by;
  assert.equal(owner, status === "accepted" ? MGR : NEW, "iş sahibi devir sonucuyla tutarlı olmalı");
});

await test("10) çözülmüş talep devirle taşınmaz; operasyon yöneticisi bekleyen devri iptal edebilir", async () => {
  const holder = sqlite.prepare("SELECT accepted_by FROM tickets WHERE reference = ?").get(ref).accepted_by;
  const other = holder === MGR ? NEW : MGR;
  assert.equal((await ticketsRoute.PATCH(req("PATCH", "/api/tickets", holder, { reference: ref, action: "resolve" }))).status, 200);
  assert.equal((await shift(holder, { action: "start", unitCode: "RND", toEmail: other })).status, 201);
  const id = sqlite.prepare("SELECT id FROM shift_handoffs WHERE status = 'pending'").get().id;
  assert.equal(sqlite.prepare("SELECT open_tickets FROM shift_handoffs WHERE id = ?").get(id).open_tickets, 0);
  assert.equal((await shift(OWNER, { action: "cancel", id })).status, 200);
  assert.equal(sqlite.prepare("SELECT accepted_by FROM tickets WHERE reference = ?").get(ref).accepted_by, holder);
});
