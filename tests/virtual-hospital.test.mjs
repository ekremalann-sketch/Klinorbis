import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRoute} from './helpers/route-harness.mjs';
const sim=await loadRoute('lib/virtual-hospital.ts');
test('virtual hospital has two campuses, 20+ units, 2–5 fictional staff per unit and shifts',()=>{
 assert.ok(sim.SIM_UNITS.length>=20);
 for(const u of sim.SIM_UNITS){const staff=sim.SIM_STAFF.filter(s=>s.unit===u.code);assert.ok(staff.length>=2&&staff.length<=5);assert.ok(staff.every(x=>x.sim));}
 const s=sim.newSimulation(sim.DEFAULT_SIM_SETTINGS,0);assert.equal(new Set(s.beds.map(b=>b.campus)).size,2);assert.ok(s.beds.every(b=>b.sim));
});
test('same seed produces reproducible events and 30 conflict-free absence proposals',()=>{
 const a=sim.advanceSimulation(sim.newSimulation(sim.DEFAULT_SIM_SETTINGS,0),240);
 assert.deepEqual(a,sim.advanceSimulation(sim.newSimulation(sim.DEFAULT_SIM_SETTINGS,0),240));
 const absence=a.events.find(e=>e.kind==='absence');assert.equal(absence.proposal.length,30);
 const slots=absence.proposal.filter(p=>p.startsAt).map(p=>p.physicianCode+'|'+p.startsAt);assert.equal(new Set(slots).size,slots.length);
 assert.ok(a.events.every(e=>e.sim&&(!e.patientAlias||e.patientAlias.startsWith('HST-SIM-'))));
});
test('stop freezes clock and no gains are claimed for unfinished cases',()=>{
 const s=sim.newSimulation(sim.DEFAULT_SIM_SETTINGS,0);assert.deepEqual(sim.advanceSimulation(s,120,true),s);
 const started=sim.advanceSimulation(s,1);const m=sim.simulationMetrics(started);assert.equal(m.completed,0);assert.equal(m.savedMinutes,0);
});
test('72 hour day/night pilot exercises handoffs, 48h callbacks and role-separated approvals',()=>{
 let s=sim.newSimulation(sim.DEFAULT_SIM_SETTINGS,0);for(let i=0;i<18;i++)s=sim.advanceSimulation(s,240);
 assert.equal(s.status,'completed');assert.ok(s.handoffs>=8);assert.ok(s.events.some(e=>e.kind==='icu'));
 assert.ok(s.events.some(e=>e.kind==='followup'&&e.status==='done'));
 assert.ok(s.events.some(e=>e.steps.some(x=>x.approval&&x.done&&x.actor?.startsWith('Hekim'))));
 assert.ok(s.notifications.some(n=>n.text.includes('yükseltildi')));assert.ok(s.skippedChains>0);
 assert.ok(s.events.filter(e=>['it','device','medicine','security'].includes(e.kind)).every(e=>e.patientAlias===null));
});
test('integration comparison is labeled, settings are bounded and results are not forced positive',()=>{
 assert.throws(()=>sim.validateSimSettings({speed:Infinity}));assert.throws(()=>sim.validateSimSettings({durationHours:10000}));
 const m=sim.simulationMetrics(sim.advanceSimulation(sim.newSimulation({...sim.DEFAULT_SIM_SETTINGS,integrated:true},0),240));
 assert.match(m.label,/gerçek pilot sonucu değildir/);assert.equal(m.savedMinutes,m.baselineMinutes-m.modeledMinutes);
});
