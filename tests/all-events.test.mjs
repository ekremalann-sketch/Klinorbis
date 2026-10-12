import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createD1, loadRoute, ORIGIN, setRuntime } from './helpers/route-harness.mjs';
const { EVENT_TRIGGERS } = await loadRoute('lib/playbook-triggers.ts');
const route = await loadRoute('app/api/integrations/events/route.ts');
for (const trigger of EVENT_TRIGGERS) {
  await test(`${trigger.type}: signed event maps to ${trigger.playbook}, bad signature rejected, duplicate ignored`, async () => {
    const { d1, sqlite } = await createD1();
    try {
      const secret = 'synthetic-local-events-test-key';
      setRuntime(d1, { ownerEmail: 'owner@klinorbis.test', webhookSecret: secret, demoEnabled: '0' });
      const body = JSON.stringify({ type: trigger.type, note: 'Kurgusal kaynak olayı' });
      const timestamp = String(Date.now()), eventId = 'test-event-' + trigger.type;
      const signature = createHmac('sha256', secret).update(`${timestamp}.${eventId}.${body}`).digest('hex');
      const request = (sig) => new Request(`${ORIGIN}/api/integrations/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-klinorbis-timestamp': timestamp, 'x-klinorbis-event-id': eventId, 'x-klinorbis-signature': sig }, body });
      assert.equal((await route.POST(request('0'.repeat(64)))).status, 401);
      const first = await route.POST(request(signature));
      assert.equal(first.status, 201);
      const created = await first.json();
      assert.equal(sqlite.prepare('SELECT playbook_code FROM playbook_runs WHERE reference = ?').get(created.reference).playbook_code, trigger.playbook);
      const repeated = await route.POST(request(signature));
      const duplicate = await repeated.json();
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.reference, created.reference);
      assert.equal(sqlite.prepare('SELECT count(*) AS n FROM playbook_runs').get().n, 1);
    } finally { sqlite.close(); }
  });
}
