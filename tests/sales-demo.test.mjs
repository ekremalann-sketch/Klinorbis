import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
async function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const { HOSPITAL_UNITS, findUnit, recommendUnit } = await load('../lib/hospital-units.ts');
const { advanceDemo } = await load('../lib/sales-demo.ts');
test('every unit code and localized name resolves to itself', () => {
  for (const unit of HOSPITAL_UNITS) {
    assert.equal(findUnit(unit.code).code, unit.code);
    assert.equal(findUnit(unit.code.toLowerCase()).code, unit.code);
    assert.equal(findUnit(unit.name).code, unit.code);
    assert.equal(recommendUnit('Gösterim talebi', unit.code).code, unit.code);
  }
});
test('demo transfer keeps source ownership until target acceptance', () => {
  let r = { id: 'DEMO-001', unit: 'CAG', target: '', priority: 'Normal', status: 'new', history: [] };
  assert.throws(() => advanceDemo(r, 'complete'));
  r = advanceDemo(r, 'claim');
  assert.throws(() => advanceDemo(r, 'transfer', 'CAG'));
  r = advanceDemo(r, 'transfer', 'BTI');
  assert.equal(r.unit, 'CAG');
  assert.throws(() => advanceDemo(r, 'complete'));
  r = advanceDemo(r, 'accept');
  assert.equal(r.unit, 'BTI');
  r = advanceDemo(r, 'review');
  assert.throws(() => advanceDemo(r, 'complete'));
  r = advanceDemo(r, 'approve');
  r = advanceDemo(r, 'complete');
  assert.equal(r.status, 'completed');
  assert.equal(r.history.length, 6);
  assert.throws(() => advanceDemo(r, 'claim'));
});
