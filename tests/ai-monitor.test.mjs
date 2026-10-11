// İsteğe bağlı yapay zekâ izleme: anahtar yoksa hiçbir dış çağrı yapılmaz; anahtar varsa yalnız toplam sayılar gider.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1, loadRoute, setRuntime } from "./helpers/route-harness.mjs";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: "ops@klinorbis.test", demoEnabled: "0" });
const ai = await loadRoute("lib/ai-monitor.ts"), database = await loadRoute("db/index.ts");
const now = Date.now();
sqlite.prepare("INSERT INTO operational_tasks(reference,unit_code,assigned_role,source_type,status,priority,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("TSK-AI-1", "KRD", "Kardiyoloji Birim Rolü", "ticket", "queued", "Yüksek", now - 3600000, now, now);
sqlite.prepare("INSERT INTO call_sessions(reference,patient_alias,source,status,summary,unit_code,training,started_at,last_message_at) VALUES(?,?,?,?,?,?,?,?,?)").run("CALL-AI-1", "HST-AI-01", "Telefon", "human_handoff", "Ayşe Yılmaz göğüs ağrısı", "CAG", 0, now, now);
sqlite.prepare("INSERT INTO approvals(reference,unit_code,approval_type,status,requested_by,created_at) VALUES(?,?,?,?,?,?)").run("APR-AI-1", "KRD", "absence_reschedule", "pending", "mgr@klinorbis.test", now - 1800000);
const realFetch = globalThis.fetch;
await test("anahtar yoksa no-op: dış çağrı yapılmaz", async () => {
  let called = 0; globalThis.fetch = async () => { called++; throw new Error("çağrılmamalı"); };
  try {
    const result = await ai.runAiMonitor(database.getDb());
    assert.equal(result.ran, false); assert.equal(result.reason, "not_configured"); assert.equal(called, 0);
    assert.equal(ai.aiConfigured(), false);
  } finally { globalThis.fetch = realFetch; }
});
await test("anahtar varsa yalnız toplam sayılar gönderilir; ad, takma ad, referans, serbest metin, e-posta gönderilmez", async () => {
  globalThis.__KLINORBIS_SECURITY_ENV.aiApiKey = "test-only-key";
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response(JSON.stringify({ choices: [{ message: { content: "1. Kardiyoloji geciken görevleri önceliklendirin." } }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const result = await ai.runAiMonitor(database.getDb());
    assert.equal(result.ran, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /^https:\/\/api\.openai\.com\/v1\/chat\/completions$/);
    assert.ok(sent[0].init.signal, "zaman aşımı sinyali olmalı");
    const body = JSON.parse(sent[0].init.body);
    assert.equal(body.model, "gpt-4o-mini"); assert.ok(body.max_tokens <= 300);
    const text = JSON.stringify(body.messages);
    for (const forbidden of ["Ayşe", "Yılmaz", "göğüs", "HST-AI-01", "CALL-AI-1", "TSK-AI-1", "APR-AI-1", "@klinorbis.test", "absence_reschedule"]) assert.ok(!text.includes(forbidden), `gönderilmemeli: ${forbidden}`);
    const userMessage = body.messages.find((m) => m.role === "user").content;
    const aggregate = JSON.parse(userMessage.slice(userMessage.indexOf("{")));
    assert.deepEqual(aggregate.overdueTasksByUnit, { KRD: 1 });
    assert.equal(aggregate.pendingApprovals.count, 1); assert.equal(aggregate.handoffCalls, 1);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM automation_events WHERE event_type='ai_suggestion'").get().n, 1);
    // 15 dakika dolmadan ikinci çağrı yapılmaz.
    const again = await ai.runAiMonitor(database.getDb());
    assert.equal(again.ran, false); assert.equal(sent.length, 1);
  } finally { globalThis.fetch = realFetch; delete globalThis.__KLINORBIS_SECURITY_ENV.aiApiKey; }
});
await test("n8n yapılandırılmamışsa iş 'tamamlandı' sayılmaz: completed_local + dürüst sonuç metni", async () => {
  const wf = await loadRoute("lib/workflow-engine.ts");
  const t = Date.now();
  sqlite.prepare("insert into tickets(reference,patient_alias,subject,unit,unit_code,created_at,updated_at) values(?,?,?,?,?,?,?)").run("WF-LOCAL-1", "HST-TEST-1", "Yerel iş", "HIL", "HIL", t, t);
  sqlite.prepare("insert into workflow_jobs(job_key,ticket_reference,rule_code,idempotency_key,correlation_id,next_run_at,created_at) values(?,?,?,?,?,?,?)").run("JOB-LOCAL-1", "WF-LOCAL-1", "CALLBACK_TASK", "idem-local-1", "corr-local-1", t - 1000, t);
  const result = await wf.runWorkflowCycle(database.getDb(), "test-worker", 5);
  assert.ok(result.completed >= 1);
  assert.equal(sqlite.prepare("select status from workflow_jobs where job_key='JOB-LOCAL-1'").get().status, "local_completed");
  const outcome = sqlite.prepare("select outcome from automation_events where ticket_reference='WF-LOCAL-1' order by id desc").get().outcome;
  assert.match(outcome, /Yalnız yerel kayıt işlendi; harici iletim yapılmadı/);
});
