import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("capacity control tower persists system-to-system decisions and advances without a user trigger", async () => {
  const [schema, engine, worker, workflow] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-tower.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/workflow-engine.ts", import.meta.url), "utf8"),
  ]);

  for (const table of ["facilities", "capacitySnapshots", "transferRequests", "staffShifts", "reportAssignments"]) {
    assert.match(schema, new RegExp(`export const ${table} = sqliteTable`), `${table} must be persistent`);
  }
  assert.match(engine, /const STEP_MS = 6_000/);
  assert.match(engine, /advanceControlTower/);
  assert.match(engine, /decideCapacity/);
  assert.match(engine, /rerouteToAlternative/);
  assert.match(engine, /runScheduledReports/);
  assert.match(engine, /refreshShiftTelemetry/);
  assert.match(engine, /onConflictDoNothing/);
  assert.match(engine, /appendAudit/);
  assert.match(engine, /capacitySeedRows\.slice\(index, index \+ 4\)/);
  assert.match(worker, /runAutomationAgent\(db, "scheduled-worker"\)/);
  assert.match(workflow, /CAPACITY_DECISION/);
});

test("workspace reads are side-effect free and the signed agent endpoint owns scheduled writes", async () => {
  const [operations, dashboard, agentRoute] = await Promise.all([
    readFile(new URL("../lib/operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/automation/agent/route.ts", import.meta.url), "utf8"),
  ]);
  const snapshotBody = operations.slice(operations.indexOf("export async function workspaceSnapshot"));
  assert.doesNotMatch(snapshotBody, /advancePilotAutomation|advanceControlTower|runWorkflowCycle/);
  assert.match(dashboard, /refreshInFlight/);
  assert.match(dashboard, /setInterval\(\(\) => void refresh\(true\), 5000\)/);
  assert.match(agentRoute, /x-klinorbis-signature/);
  assert.match(agentRoute, /WEBHOOK_REPLAY_WINDOW/);
  assert.match(agentRoute, /runAutomationAgent/);
});

test("owner access uses the stable Sites account identity as well as email", async () => {
  const [security, worker] = await Promise.all([
    readFile(new URL("../lib/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(security, /oai-authenticated-user-id/);
  assert.match(security, /ownerAccountUserId/);
  assert.match(worker, /KLINORBIS_OWNER_ACCOUNT_USER_ID/);
});

test("the operator UI exposes live counts, scoped reports and no manual capacity acceptance button", async () => {
  const [dashboard, operations, exportRoute] = await Promise.all([
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reports/export/route.ts", import.meta.url), "utf8"),
  ]);

  for (const label of [
    "Beklenen taburculuk",
    "Açık sevk / transfer",
    "Otomatik kabul / alternatif",
    "Gerekçeli otomatik ret",
    "Aktif vardiya ekibi",
    "Canlı, görevli ve dışa aktarılabilir operasyon raporları",
  ]) assert.match(dashboard, new RegExp(label));

  assert.doesNotMatch(dashboard, />\s*Kabul et\s*</i);
  assert.doesNotMatch(dashboard, /Manuel çalıştır/i);
  assert.match(dashboard, /\^\(CAG\|TRN\|TLP\|PLT\|S2S\)-/);
  assert.match(operations, /visibleJobRows/);
  assert.match(operations, /HOSPITAL_UNITS\.slice\(index, index \+ 10\)/);
  assert.match(operations, /scopeType: actor\.canSeeAllUnits \? row\.scopeType : "unit"/);
  assert.match(exportRoute, /requireActor/);
  assert.match(exportRoute, /actor\.unitCodes/);
  assert.match(exportRoute, /visibleTicketReferences/);
  assert.match(exportRoute, /inArray\(workflowJobs\.ticketReference, visibleTicketReferences\)/);
  assert.match(exportRoute, /report\.export/);
});

test("phone, tablet and desktop layouts use stable hit targets", async () => {
  const [css, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(css, /button\s*>\s*\*[\s\S]*pointer-events:\s*none/);
  for (const breakpoint of [1250, 900, 600]) assert.match(css, new RegExp(`max-width: ${breakpoint}px`));
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /strong:nth-of-type\(4\)::before \{ content: "UYGUN"/);
  assert.match(css, /strong:nth-of-type\(5\)::before \{ content: "TAHMİN"/);
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /viewportFit:\s*"cover"/);
});
