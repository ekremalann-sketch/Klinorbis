import assert from 'node:assert/strict';
import test from 'node:test';
import { browserJson, createD1, loadRoute, setRuntime } from './helpers/route-harness.mjs';
const { PLAYBOOKS } = await loadRoute('lib/playbooks.ts');
const route = await loadRoute('app/api/playbooks/route.ts');
const OWNER = 'owner@klinorbis.test', MANAGER = 'approver@klinorbis.test', CLINICIAN = 'clinician@klinorbis.test';
for (const playbook of PLAYBOOKS) {
  await test(`${playbook.code}: every step, approval separation, waiting time and automatic chains`, async () => {
    const { d1, sqlite } = await createD1();
    try {
      setRuntime(d1, { ownerEmail: OWNER, demoEnabled: '0' });
      const now = Date.now();
      for (const [email, role] of [[MANAGER, 'operations_manager'], [CLINICIAN, 'clinician']]) {
        sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, 'Synthetic approver', ?, 1, ?)").run(email, role, now);
        for (const code of new Set(playbook.steps.map(step => step.unitCode))) sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Synthetic role', 1, 1, 1)").run(email, code);
      }
      const post = (email, body) => route.POST(browserJson('/api/playbooks', body, email));
      const started = await post(OWNER, { action: 'start', code: playbook.code, note: 'Kurgusal otomatik doğrulama' });
      assert.equal(started.status, 201);
      const reference = (await started.json()).reference;
      for (let index = 0; index < playbook.steps.length; index++) {
        const step = playbook.steps[index];
        const run = sqlite.prepare('SELECT version, current_step FROM playbook_runs WHERE reference = ?').get(reference);
        assert.equal(run.current_step, index);
        const persisted = sqlite.prepare('SELECT unit_code, task_reference FROM playbook_steps WHERE run_reference = ? AND step_index = ?').get(reference, index);
        assert.equal(persisted.unit_code, step.unitCode);
        // Koşullu zincirler: tüm koşullar işaretlenir; böylece her bağlı akışın açılabildiği doğrulanır (koşulsuz açılmaması package1 testinde).
        const body = { action: 'step.complete', reference, version: run.version, note: 'Kurgusal adım teyidi', conditions: playbook.nextRules.map((r) => r.when).filter(Boolean) };
        const actor = step.approval ? (step.clinical ? CLINICIAN : MANAGER) : OWNER;
        if (step.approval) assert.equal((await post(OWNER, body)).status, 403, 'starter cannot approve own workflow');
        if (step.waitMinutes) {
          assert.equal((await post(actor, body)).status, 409, 'future step must remain blocked');
          // Only the isolated test database advances the scheduled step, never production time.
          sqlite.prepare('UPDATE playbook_steps SET activate_at = ? WHERE run_reference = ? AND step_index = ?').run(now - 1000, reference, index);
        }
        if (step.approval && step.clinical) assert.equal((await post(MANAGER, body)).status, 403, 'clinical approval requires clinician');
        const completed = await post(actor, body);
        assert.equal(completed.status, 200, `${playbook.code} step ${index}: ${await completed.text()}`);
        assert.equal(sqlite.prepare('SELECT status FROM operational_tasks WHERE reference = ?').get(persisted.task_reference).status, 'completed');
      }
      assert.equal(sqlite.prepare('SELECT status FROM playbook_runs WHERE reference = ?').get(reference).status, 'done');
      const children = sqlite.prepare('SELECT playbook_code FROM playbook_runs WHERE parent_reference = ?').all(reference).map(row => row.playbook_code).sort();
      assert.deepEqual(children, [...playbook.next].sort());
    } finally { sqlite.close(); }
  });
}
