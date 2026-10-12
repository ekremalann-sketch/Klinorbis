import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, loadRoute, ORIGIN, setRuntime } from './helpers/route-harness.mjs';

test('live report replaces a stored training result with current scoped metrics', async () => {
  const { d1, sqlite } = await createD1();
  const owner = 'owner@klinorbis.test';
  setRuntime(d1, { ownerEmail: owner, demoEnabled: '0' });
  const at = Date.now();
  sqlite.prepare(`INSERT INTO report_assignments (reference, report_code, title, assigned_role, schedule, result_json, training, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run('RPT-TEST', 'NETWORK_SUMMARY', 'Test report', 'Operations', 'Pilot', '{"facilities":4,"available":108}', at, at, at);
  const route = await loadRoute('app/api/workspace/route.ts');
  const response = await route.GET(new Request(`${ORIGIN}/api/workspace`, { headers: { 'oai-authenticated-user-email': owner } }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.features.demo, false);
  assert.equal(data.reports[0].result.facilities, 0);
  assert.equal(data.reports[0].result.available, 0);
  assert.equal(data.reports[0].nextRunAt, null);
  assert.equal(data.reports[0].schedule, 'Ekran yenilemesinde anlık');
  sqlite.close();
});
