import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, loadRoute, ORIGIN, setRuntime } from './helpers/route-harness.mjs';

const route = await loadRoute('app/api/patient-access/route.ts');

test('patient access excludes request actions outside its supported catalog', async () => {
  const { d1, sqlite } = await createD1();
  try {
    const email = 'owner@klinorbis.test';
    setRuntime(d1, { ownerEmail: email, demoEnabled: '0' });
    const response = await route.POST(new Request(`${ORIGIN}/api/patient-access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-klinorbis-request': 'browser', 'oai-authenticated-user-email': email },
      body: JSON.stringify({ action: 'response.record', response: 'invalid', changeId: 1 }),
    }));
    assert.equal(response.status, 400);
  } finally {
    sqlite.close();
  }
});
