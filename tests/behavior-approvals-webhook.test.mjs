// Gerçek rota kodunu çalıştıran davranış testleri (bellek içi SQLite, sentetik veri).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "owner@klinorbis.test";
const SECRET = "test-only-webhook-secret-not-production";

async function approvalsFixture() {
  const { d1, sqlite } = await createD1();
  setRuntime(d1, { ownerEmail: OWNER });
  const now = Date.now();
  const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
  const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)");
  for (const [email, role, unit] of [
    ["mgr@klinorbis.test", "unit_manager", "ACY"], ["clin@klinorbis.test", "clinician", "ACY"],
    ["agent@klinorbis.test", "call_agent", "ACY"], ["other@klinorbis.test", "unit_manager", "RND"],
  ]) { staff.run(email, email, role, now); member.run(email, unit); }
  sqlite.prepare("INSERT INTO approvals (reference, unit_code, approval_type, status, requested_by, created_at) VALUES ('ONAY-TEST-1', 'ACY', 'clinical_handoff', 'pending', 'system', ?)").run(now);
  const route = await loadRoute("app/api/approvals/route.ts");
  const status = () => ({ ...sqlite.prepare("SELECT status, decided_by FROM approvals WHERE reference = 'ONAY-TEST-1'").get() });
  const decisions = () => sqlite.prepare("SELECT COUNT(*) AS n FROM automation_events WHERE event_type = 'approval_decision'").get().n;
  return { route, status, decisions };
}

test("onay: oturumsuz istek 401, karar yazılmaz", async () => {
  const { route, status } = await approvalsFixture();
  const response = await route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "approve" }));
  assert.equal(response.status, 401);
  assert.equal(status().status, "pending");
});

test("onay: çağrı görevlisi karar veremez (403), kayıt bekler durumda kalır", async () => {
  const { route, status } = await approvalsFixture();
  const response = await route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "approve" }, "agent@klinorbis.test"));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "APPROVAL_ROLE_REQUIRED");
  assert.equal(status().status, "pending");
});

test("onay: başka birimin yöneticisi karar veremez (403)", async () => {
  const { route, status } = await approvalsFixture();
  const response = await route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "reject" }, "other@klinorbis.test"));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "UNIT_ACCESS_DENIED");
  assert.equal(status().status, "pending");
});

test("onay: birim yöneticisi karar verir; ikinci karar 409", async () => {
  const { route, status } = await approvalsFixture();
  const first = await route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "approve" }, "mgr@klinorbis.test"));
  assert.equal(first.status, 200);
  assert.deepEqual(status(), { status: "approved", decided_by: "mgr@klinorbis.test" });
  const second = await route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "reject" }, OWNER));
  assert.equal(second.status, 409);
  assert.equal(status().status, "approved");
});

test("onay: eşzamanlı onay ve ret — yalnız biri kazanır, tek karar olayı yazılır", async () => {
  const { route, status, decisions } = await approvalsFixture();
  const [a, b] = await Promise.all([
    route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "approve" }, "clin@klinorbis.test")),
    route.POST(browserJson("/api/approvals", { reference: "ONAY-TEST-1", decision: "reject" }, "mgr@klinorbis.test")),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? { status: "approved", decided_by: "clin@klinorbis.test" } : { status: "rejected", decided_by: "mgr@klinorbis.test" };
  assert.deepEqual(status(), winner);
  assert.equal(decisions(), 1);
});

// ---- Santral webhook ----
const sign = (value) => createHmac("sha256", SECRET).update(value).digest("hex");
function pbxRequest({ body, eventId, timestamp = String(Date.now()), scheme = "v2", signature }) {
  const raw = JSON.stringify(body);
  const sig = signature ?? sign(scheme === "v2" ? `${timestamp}.${eventId}.${raw}` : `${timestamp}.${raw}`);
  return new Request(`${ORIGIN}/api/integrations/calls`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-klinorbis-timestamp": timestamp, "x-klinorbis-event-id": eventId, "x-klinorbis-signature": sig, "x-klinorbis-source": "test-pbx" },
    body: raw,
  });
}
async function webhookFixture() {
  const { d1, sqlite } = await createD1();
  setRuntime(d1, { webhookSecret: SECRET });
  const route = await loadRoute("app/api/integrations/calls/route.ts");
  const count = (table, where = "1=1") => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n;
  return { route, count };
}
const started = { eventType: "call.started", callReference: "CALL-TEST-0001", unitCode: "CAG" };
const line = { eventType: "transcript.partial", callReference: "CALL-TEST-0001", text: "Randevu saatini öğrenmek istiyorum." };

test("webhook: v2 imzalı olay işlenir; aynı olay tekrar gelirse duplicate", async () => {
  const { route, count } = await webhookFixture();
  const first = await route.POST(pbxRequest({ body: started, eventId: "evt-test-0001" }));
  assert.equal(first.status, 202);
  assert.equal(count("call_sessions", "reference = 'CALL-TEST-0001'"), 1);
  const again = await route.POST(pbxRequest({ body: started, eventId: "evt-test-0001" }));
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
});

test("webhook: eski (timestamp.body) imzalı gönderici bozulmaz", async () => {
  const { route, count } = await webhookFixture();
  const response = await route.POST(pbxRequest({ body: started, eventId: "evt-legacy-001", scheme: "legacy" }));
  assert.equal(response.status, 202);
  assert.equal(count("call_sessions", "reference = 'CALL-TEST-0001'"), 1);
  assert.equal(count("security_events", "event_type = 'webhook_legacy_signature'"), 1);
});

test("webhook: yakalanan eski imzalı istek yeni event-id ile tekrar işlenmez", async () => {
  const { route, count } = await webhookFixture();
  await route.POST(pbxRequest({ body: started, eventId: "evt-legacy-100", scheme: "legacy" }));
  const timestamp = String(Date.now());
  const signature = sign(`${timestamp}.${JSON.stringify(line)}`);
  const original = await route.POST(pbxRequest({ body: line, eventId: "evt-legacy-101", timestamp, signature }));
  assert.equal(original.status, 202);
  const messages = count("call_messages", "call_reference = 'CALL-TEST-0001'");
  const replay = await route.POST(pbxRequest({ body: line, eventId: "evt-attacker-999", timestamp, signature }));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).duplicate, true);
  assert.equal(count("call_messages", "call_reference = 'CALL-TEST-0001'"), messages, "konuşma satırı ikinci kez eklenmemeli");
  assert.equal(count("security_events", "event_type = 'webhook_replay_blocked'"), 1);
});

test("webhook: v2 imzası başka event-id ile kullanılamaz, hatalı imza ve eski zaman damgası 401", async () => {
  const { route, count } = await webhookFixture();
  const timestamp = String(Date.now());
  const signature = sign(`${timestamp}.evt-real-0001.${JSON.stringify(started)}`);
  const swapped = await route.POST(pbxRequest({ body: started, eventId: "evt-swapped-01", timestamp, signature }));
  assert.equal(swapped.status, 401);
  const bad = await route.POST(pbxRequest({ body: started, eventId: "evt-bad-000001", signature: "0".repeat(64) }));
  assert.equal(bad.status, 401);
  const stale = await route.POST(pbxRequest({ body: started, eventId: "evt-stale-0001", timestamp: String(Date.now() - 10 * 60_000) }));
  assert.equal(stale.status, 401);
  assert.equal(count("call_sessions"), 0);
});

test("webhook: aynı olay eşzamanlı iki kez gelirse biri işlenir, 500 oluşmaz", async () => {
  const { route, count } = await webhookFixture();
  const timestamp = String(Date.now());
  const [a, b] = await Promise.all([
    route.POST(pbxRequest({ body: started, eventId: "evt-race-0001", timestamp })),
    route.POST(pbxRequest({ body: started, eventId: "evt-race-0001", timestamp })),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 202]);
  assert.equal(count("operational_tasks", "call_reference = 'CALL-TEST-0001'"), 1);
});

test("webhook: anahtar tanımlı değilse 503 döner", async () => {
  const { d1 } = await createD1();
  setRuntime(d1, {});
  const route = await loadRoute("app/api/integrations/calls/route.ts");
  const response = await route.POST(pbxRequest({ body: started, eventId: "evt-noconf-01" }));
  assert.equal(response.status, 503);
});

test("webhook: eski imzalı asıl istek ile farklı event-id'li kopyası AYNI ANDA gelirse yalnız biri işlenir", async () => {
  const { route, count } = await webhookFixture();
  await route.POST(pbxRequest({ body: started, eventId: "evt-legacy-200", scheme: "legacy" }));
  const timestamp = String(Date.now());
  const signature = sign(`${timestamp}.${JSON.stringify(line)}`);
  const before = count("call_messages", "call_reference = 'CALL-TEST-0001'");
  const results = await Promise.all(["evt-legacy-201", "evt-attacker-777", "evt-attacker-778"].map((eventId) => route.POST(pbxRequest({ body: line, eventId, timestamp, signature }))));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 202]);
  assert.equal(count("call_messages", "call_reference = 'CALL-TEST-0001'"), before + 1, "konuşma satırı tam bir kez eklenmeli");
});

test("webhook: aynı event-id yeni zaman damgası ve farklı gövdeyle gelse de ikinci kez işlenmez", async () => {
  const { route, count } = await webhookFixture();
  assert.equal((await route.POST(pbxRequest({ body: started, eventId: "evt-same-id-01" }))).status, 202);
  const other = { ...started, callReference: "CALL-TEST-0002" };
  const again = await route.POST(pbxRequest({ body: other, eventId: "evt-same-id-01", timestamp: String(Date.now() + 1) }));
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(count("call_sessions", "reference = 'CALL-TEST-0002'"), 0);
});

test("webhook: saniye hassasiyetli (10 haneli) zaman damgası v2 ve eski biçimde kabul edilir", async () => {
  const { route } = await webhookFixture();
  const seconds = String(Math.floor(Date.now() / 1000));
  assert.equal((await route.POST(pbxRequest({ body: started, eventId: "evt-seconds-01", timestamp: seconds }))).status, 202);
  const ended = { eventType: "call.ended", callReference: "CALL-TEST-0001" };
  assert.equal((await route.POST(pbxRequest({ body: ended, eventId: "evt-seconds-02", timestamp: seconds, scheme: "legacy" }))).status, 202);
});

test("webhook: v2 akışı — acil sinyal insan devrine alınır, çağrı kapanışı görevi tamamlar", async () => {
  const { route, count } = await webhookFixture();
  await route.POST(pbxRequest({ body: started, eventId: "evt-flow-0001" }));
  const urgent = { eventType: "transcript.final", callReference: "CALL-TEST-0001", text: "Arayan göğüs ağrısı tarif ediyor (sentetik)", speakerType: "caller" };
  const r = await route.POST(pbxRequest({ body: urgent, eventId: "evt-flow-0002" }));
  assert.equal(r.status, 202);
  assert.equal((await r.json()).destination.unitCode, "ACY");
  assert.equal(count("call_sessions", "reference = 'CALL-TEST-0001' AND status = 'human_handoff' AND requires_human = 1"), 1);
  await route.POST(pbxRequest({ body: { eventType: "call.ended", callReference: "CALL-TEST-0001" }, eventId: "evt-flow-0003" }));
  assert.equal(count("operational_tasks", "call_reference = 'CALL-TEST-0001' AND status = 'completed'"), 1);
  assert.equal(count("audit_logs", "actor = 'integration:test-pbx'"), 3);
});
