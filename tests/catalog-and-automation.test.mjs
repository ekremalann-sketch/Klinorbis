import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hospital catalog is broad, unique, and contains critical clinical and operational desks", async () => {
  const source = await readFile(new URL("../lib/hospital-units.ts", import.meta.url), "utf8");
  const rows = [...source.matchAll(/\{ code: "([^"]+)", name: "([^"]+)"/g)].map((match) => ({ code: match[1], name: match[2] }));
  assert.ok(rows.length >= 80, `expected at least 80 units, found ${rows.length}`);
  assert.equal(new Set(rows.map((row) => row.code)).size, rows.length, "unit codes must be unique");
  assert.equal(new Set(rows.map((row) => row.name)).size, rows.length, "unit names must be unique");
  for (const required of ["Kalp ve Damar Cerrahisi", "Ortopedi ve Travmatoloji", "İnfertilite ve Üremeye Yardımcı Tedavi", "Yatak ve Kapasite Yönetimi", "Transfer Merkezi", "Çevre ve Temizlik Hizmetleri", "Bilgi Güvenliği"]) {
    assert.ok(rows.some((row) => row.name === required), `${required} must exist`);
  }
});

test("n8n workflow package is credential-free and includes signing, minimisation, retry and callback", async () => {
  const workflow = JSON.parse(await readFile(new URL("../public/integrations/klinorbis-n8n-workflows.json", import.meta.url), "utf8"));
  const names = new Set(workflow.nodes.map((node) => node.name));
  for (const required of ["KLINORBIS Olay Alıcı", "KLINORBIS İmza Doğrulama", "Şema ve Veri Minimizasyonu", "HMAC İmza ve Replay Koruması", "KLINORBIS İmzalı Callback", "202 Kabul Yanıtı", "KLINORBIS Ajan Zamanlayıcısı", "Ajan Tick İmzası", "KLINORBIS Ajanını Çalıştır"]) {
    assert.ok(names.has(required), `${required} node must exist`);
  }
  assert.equal(workflow.active, false, "external workflow must not claim to be active before a real n8n server is configured");
  assert.match(JSON.stringify(workflow), /KLINORBIS_N8N_SHARED_SECRET/);
  assert.match(JSON.stringify(workflow), /KLINORBIS_AGENT_URL/);
  assert.doesNotMatch(JSON.stringify(workflow), /(?:sk-|Bearer\s+[A-Za-z0-9._-]{20,}|password\s*[:=]\s*[^$])/i);
});

test("self-hosted n8n deployment uses Postgres, Redis queue mode and a separate worker", async () => {
  const compose = await readFile(new URL("../deploy/n8n/docker-compose.yml", import.meta.url), "utf8");
  const engine = await readFile(new URL("../lib/workflow-engine.ts", import.meta.url), "utf8");
  assert.match(compose, /EXECUTIONS_MODE:\s*queue/);
  assert.match(compose, /n8n-worker:/);
  assert.match(compose, /command:\s*worker --concurrency=/);
  assert.match(compose, /DB_TYPE:\s*postgresdb/);
  assert.match(compose, /QUEUE_BULL_REDIS_HOST:\s*redis/);
  assert.match(compose, /KLINORBIS_AGENT_URL/);
  assert.match(engine, /dispatchToN8n/);
  assert.match(engine, /x-klinorbis-signature/);
  assert.match(engine, /AbortSignal\.timeout/);
});

test("n8n connector distinguishes a ready signing key from a connected server", async () => {
  const security = await readFile(new URL("../lib/security.ts", import.meta.url), "utf8");
  assert.match(security, /schedulerSigningReady/);
  assert.match(security, /İmzalı zamanlayıcı hazır · n8n adresi yok/);
  assert.match(security, /dış n8n sunucu URL'si tanımlanana kadar bağlı sayılmaz/);
});

test("pilot orchestrator is persistent, disclosed, unit-routed and human-gated", async () => {
  const source = await readFile(new URL("../lib/pilot-automation.ts", import.meta.url), "utf8");
  assert.match(source, /Kimliksiz eğitim\/pilot verisi/);
  assert.match(source, /integrationEvents/);
  assert.match(source, /workflowJobs/);
  assert.match(source, /human_handoff/);
  assert.match(source, /onConflictDoNothing/);
  assert.match(source, /advancePilotAutomation/);
});
