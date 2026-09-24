import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

test("n8n payload minimisation fails closed for nested keys and detected PII", async () => {
  const [route, workflowText] = await Promise.all([
    readFile(new URL("../app/api/integrations/n8n/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/integrations/klinorbis-n8n-workflows.json", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(workflowText);
  const minimisation = workflow.nodes.find((node) => node.name === "Şema ve Veri Minimizasyonu")?.parameters?.jsCode || "";
  assert.match(route, /containsForbiddenHealthData\(nested, depth \+ 1\)/);
  assert.match(route, /redactPII\(value\)\.detected\.length/);
  assert.match(route, /depth > 12\) return true/);
  assert.match(minimisation, /function blocked\(value, depth = 0\)/);
  assert.match(minimisation, /blocked\(nested, depth \+ 1\)/);
  assert.match(minimisation, /patientalias/);
});

test("owner-only Sites automation uses machine access plus HMAC without session cookies", async () => {
  const [monitor, workflowText, config, compose] = await Promise.all([
    readFile(new URL("../scripts/klinorbis-monitor.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/integrations/klinorbis-n8n-workflows.json", import.meta.url), "utf8"),
    readFile(new URL("../deploy/n8n/config.example", import.meta.url), "utf8"),
    readFile(new URL("../deploy/n8n/docker-compose.yml", import.meta.url), "utf8"),
  ]);
  const workflow = JSON.parse(workflowText);
  assert.match(monitor, /KLINORBIS_SITES_AUTH_TOKEN/);
  assert.match(monitor, /OAI-Sites-Authorization/);
  assert.doesNotMatch(monitor, /SESSION_COOKIE|\.cookie\s*=/);
  assert.equal(workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest")
    .every((node) => node.parameters.headerParameters.parameters.some((header) => header.name === "OAI-Sites-Authorization")), true);
  assert.match(config, /KLINORBIS_SITES_AUTH_TOKEN=REPLACE_WITH_SITES_MACHINE_ACCESS_TOKEN/);
  assert.match(compose, /KLINORBIS_SITES_AUTH_TOKEN/);
});

test("agent health records completed or failed cycles and purges expired rate limits", async () => {
  const [runtime, health, dashboard] = await Promise.all([
    readFile(new URL("../lib/agent-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/agent-health.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /source: "klinorbis-agent"/);
  assert.match(runtime, /status: "completed"/);
  assert.match(runtime, /status: "failed"/);
  assert.match(runtime, /delete\(rateLimitCounters\).*lt\(rateLimitCounters\.expiresAt/s);
  assert.match(health, /lastRunSucceeded/);
  assert.match(health, /lastSuccessfulRunAt/);
  assert.match(health, /"degraded"/);
  assert.match(dashboard, /son turu başarısız/);
});

test("CSP uses per-response nonces and application markup has no inline style attributes", async () => {
  const [worker, dashboard] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(worker, /unsafe-inline/);
  assert.match(worker, /'nonce-\$\{nonce\}'/);
  assert.match(worker, /replace\(\/<script/);
  assert.match(worker, /replace\(\/<style/);
  assert.doesNotMatch(dashboard, /style=\{\{/);
  assert.match(dashboard, /<progress/);
});

test("monitor treats authenticated JSON 401 responses as waiting, not system failures", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("KLINORBIS");
      return;
    }
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Kimlik doğrulaması gerekli.", code: "AUTH_REQUIRED" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [new URL("../scripts/klinorbis-monitor.mjs", import.meta.url).pathname, "--base", `http://127.0.0.1:${address.port}`], {
    env: { ...process.env, KLINORBIS_N8N_SHARED_SECRET: "", KLINORBIS_SITES_AUTH_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "exit");
  server.close();
  assert.equal(code, 3);
  assert.match(output, /0 doğrulandı · 10 veri bekliyor · 0 başarısız/);
});
