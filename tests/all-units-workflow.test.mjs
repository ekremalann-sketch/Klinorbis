import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, loadRoute, ORIGIN, setRuntime } from './helpers/route-harness.mjs';

const { HOSPITAL_UNITS } = await loadRoute('lib/hospital-units.ts');
const route = await loadRoute('app/api/tickets/route.ts');
for (let index = 0; index < HOSPITAL_UNITS.length; index++) {
  const unit = HOSPITAL_UNITS[index];
  const target = HOSPITAL_UNITS[(index + 1) % HOSPITAL_UNITS.length];
  await test(`${unit.code}: create, scope denial, accept, start, transfer, target accept and close`, async () => {
    const { d1, sqlite } = await createD1();
    try {
      setRuntime(d1, { ownerEmail: 'owner@klinorbis.test', demoEnabled: '0' });
      const at = Date.now();
      for (const [email, code] of [['source@klinorbis.test', unit.code], ['target@klinorbis.test', target.code]]) {
        sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, 'Test team', 'unit_manager', 1, ?)").run(email, at);
        sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test role', 1, 1, 1)").run(email, code);
      }
      const request = (method, email, body) => new Request(`${ORIGIN}/api/tickets`, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-klinorbis-request': 'browser', 'oai-authenticated-user-email': email }, body: JSON.stringify(body) });
      const created = await route.POST(request('POST', 'source@klinorbis.test', { patientAlias: `TEST-${index + 1}`, subject: 'Kurgusal operasyon gösterimi için talep kaydı', unitCode: unit.code }));
      assert.equal(created.status, 201);
      const data = await created.json();
      assert.equal(data.destination.unitCode, unit.code);
      assert.equal(data.destination.assignedRole, unit.assignedRole);
      const ref = data.ticket.reference;
      const patch = (email, action, extra = {}) => route.PATCH(request('PATCH', email, { reference: ref, action, ...extra }));
      assert.equal((await patch('target@klinorbis.test', 'accept')).status, 403);
      for (const action of ['accept', 'start']) assert.equal((await patch('source@klinorbis.test', action)).status, 200);
      assert.equal((await patch('source@klinorbis.test', 'transfer', { targetUnitCode: target.code })).status, 200);
      assert.equal((await patch('source@klinorbis.test', 'resolve')).status, 403);
      const transferred = sqlite.prepare('SELECT unit_code, accepted_by, status FROM tickets WHERE reference = ?').get(ref);
      assert.deepEqual({ ...transferred }, { unit_code: target.code, accepted_by: null, status: 'Bekliyor' });
      for (const action of ['accept', 'start', 'resolve']) assert.equal((await patch('target@klinorbis.test', action)).status, 200);
      assert.equal((await patch('target@klinorbis.test', 'resolve')).status, 409);
      assert.equal(sqlite.prepare('SELECT status FROM operational_tasks WHERE ticket_reference = ?').get(ref).status, 'completed');
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM ticket_events WHERE ticket_reference = ? AND event_type = 'resolve'").get(ref).n, 1);
    } finally { sqlite.close(); }
  });
}
