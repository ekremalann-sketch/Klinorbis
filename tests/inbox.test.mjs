import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRoute } from './helpers/route-harness.mjs';
const { filterInboxTasks } = await loadRoute('lib/inbox.ts');
const tasks = [
  { reference: 'ticket', unitCode: 'KRD', assignedRole: 'Kardiyoloji', status: 'in_progress', priority: 'Normal', acceptedBy: 'a@test', ticketReference: 'KLI-1' },
  { reference: 'playbook', unitCode: 'TBR', assignedRole: 'Taburculuk', status: 'queued', priority: 'Yüksek', sourceType: 'playbook', dueAt: '2026-10-12T08:00:00Z' },
  { reference: 'call', unitCode: 'CAG', assignedRole: 'Çağrı', status: 'accepted', priority: 'Acil', callReference: 'CAG-1' },
  { reference: 'appointment', unitCode: 'RND', assignedRole: 'Randevu', status: 'scheduled', priority: 'Normal' },
  { reference: 'done', unitCode: 'BTI', assignedRole: 'BT', status: 'completed', priority: 'Normal' },
];
test('common inbox contains tickets, calls and playbook tasks; scheduled tasks have a separate filter', () => {
  assert.deepEqual(filterInboxTasks(tasks, 'open', 'a@test', '').map(t => t.reference), ['call', 'playbook', 'ticket']);
  assert.deepEqual(filterInboxTasks(tasks, 'mine', 'a@test', '').map(t => t.reference), ['ticket']);
  assert.equal(filterInboxTasks(tasks, 'mine', '', '').length, 0);
  assert.deepEqual(filterInboxTasks(tasks, 'scheduled', '', '').map(t => t.reference), ['appointment']);
  assert.equal(filterInboxTasks(tasks, 'all', '', '').length, 5);
  assert.deepEqual(filterInboxTasks(tasks, 'urgent', '', '').map(t => t.reference), ['call', 'playbook']);
  assert.deepEqual(filterInboxTasks(tasks, 'all', '', 'KLI-1').map(t => t.reference), ['ticket']);
  assert.deepEqual(filterInboxTasks(tasks, 'open', '', 'taburculuk').map(t => t.reference), ['playbook']);
});
