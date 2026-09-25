import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("santral webhook doğrulaması ortak modülü kullanır (davranış: behavior-approvals-webhook.test.mjs)", async () => {
  const route = await read("app/api/integrations/calls/route.ts");
  assert.match(route, /verifyPbxSignature\(/);
  assert.match(route, /replayKey\(timestamp, rawBody\)/);
  assert.doesNotMatch(route, /const \[duplicate\] = await db\.select\(\)\.from\(integrationEvents\)/, "okuma-sonra-yazma yarışı kalmamalı");
});

test("tüm HMAC uçları aynı timestamp.eventId.body sözleşmesini kullanır", async () => {
  const [calls, n8n, agent, engine] = await Promise.all([
    read("lib/webhook-signature.ts"),
    read("app/api/integrations/n8n/route.ts"),
    read("app/api/automation/agent/route.ts"),
    read("lib/workflow-engine.ts"),
  ]);
  for (const source of [calls, n8n, agent, engine]) assert.match(source, /\$\{(input\.)?timestamp\}\.\$\{(input\.)?eventId\}\./);
});

test("onay kararı rol ile sınırlı ve eşzamanlı ikinci karar 409 döner", async () => {
  const route = await read("app/api/approvals/route.ts");
  assert.match(route, /APPROVAL_DECIDER_ROLES = new Set<SystemRole>\(\["operations_manager", "unit_manager", "clinician"\]\)/);
  assert.match(route, /!APPROVAL_DECIDER_ROLES\.has\(actor\.role\)/);
  assert.match(route, /and\(eq\(approvals\.reference, approval\.reference\), eq\(approvals\.status, "pending"\)\)/);
  assert.match(route, /if \(!claimed\.length\)/);
  // Rol kontrolü yazmadan önce, birim kontrolünden sonra yapılmalı.
  const unitCheck = route.indexOf("requireUnitAccess(actor, approval.unitCode)");
  const roleCheck = route.indexOf("APPROVAL_DECIDER_ROLES.has");
  const write = route.indexOf(".update(approvals)");
  assert.ok(unitCheck > 0 && unitCheck < roleCheck && roleCheck < write);
});

test("arayüz yetkisiz rolde onay düğmelerini göstermez", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /const canDecide = \["operations_manager", "unit_manager", "clinician"\]\.includes\(/);
  assert.match(dashboard, /\{canDecide \? \(/);
});
