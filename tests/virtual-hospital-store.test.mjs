import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1,loadRoute,setRuntime,browserJson} from './helpers/route-harness.mjs';
const {d1,sqlite}=await createD1();const owner='sim-operator@example.test';setRuntime(d1,{ownerEmail:owner,demoEnabled:'0'});
const api=await loadRoute('app/api/virtual-hospital/route.ts'),store=await loadRoute('lib/virtual-hospital-store.ts'),db=(await loadRoute('db/index.ts')).getDb();
const actor={email:owner,label:'Kurgusal Yönetici',role:'operations_manager',unitCodes:[],canSeeAllUnits:true};
test('simulation requires signed-in operations manager and blocks cross-origin control',async()=>{
 assert.equal((await api.GET(new Request('https://klinorbis.test/api/virtual-hospital'))).status,401);
 assert.equal((await api.POST(new Request('https://klinorbis.test/api/virtual-hospital',{method:'POST',headers:{'content-type':'application/json',origin:'https://foreign.test','oai-authenticated-user-email':owner},body:JSON.stringify({action:'start'})}))).status,403);
 assert.throws(()=>store.requireSimulationManager({...actor,role:'clinician'}),/yalnız operasyon/);
 assert.throws(()=>store.requireSimulationManager({...actor,role:'security_officer'}),/yalnız operasyon/);
});
test('start, progress, stop and clear preserve live business tables and log lifecycle',async()=>{
 const tables=['tickets','operational_tasks','approvals','playbook_runs','appointments','audit_logs'];
 const counts=()=>tables.map(t=>sqlite.prepare(`select count(*) n from ${t}`).get().n);
 const before=counts();const start=await api.POST(browserJson('/api/virtual-hospital',{action:'start'},owner));assert.equal(start.status,200);
 const data=await start.json();assert.equal(data.state.sim,true);assert.equal(data.state.status,'running');
 await store.tickVirtualHospital(db,Date.now(),120);
 let result=await store.getVirtualHospital(db);assert.ok(result.state.events.length>0);assert.deepEqual(counts(),before);
 await store.controlVirtualHospital(db,actor,'stop');const cursor=(await store.getVirtualHospital(db)).state.cursor;
 await store.tickVirtualHospital(db,Date.now()+60000,120);assert.equal((await store.getVirtualHospital(db)).state.cursor,cursor);
 await store.controlVirtualHospital(db,actor,'clear');result=await store.getVirtualHospital(db);assert.equal(result.state,null);
 assert.deepEqual(result.audit.map(x=>x.action),['clear','stop','start']);assert.deepEqual(counts(),before);
});
test('concurrent ticks cannot duplicate events or advance the same time twice',async()=>{
 await store.controlVirtualHospital(db,actor,'start');await Promise.all([store.tickVirtualHospital(db,Date.now(),120),store.tickVirtualHospital(db,Date.now(),120)]);
 const s=(await store.getVirtualHospital(db)).state;assert.equal(s.cursor,120);assert.equal(new Set(s.events.map(e=>e.id)).size,s.events.length);
});
test('existing emergency stop freezes simulation and requires explicit new start',async()=>{
 sqlite.prepare("insert into integration_events(event_id,source,event_type,payload_hash,status,received_at) values('automation:control','test','control','test','paused',0)").run();
 const before=(await store.getVirtualHospital(db)).state.cursor;
 await store.tickVirtualHospital(db,Date.now()+60000,120);let snapshot=await store.getVirtualHospital(db);
 assert.equal(snapshot.state.status,'stopped');assert.equal(snapshot.state.cursor,before);assert.equal(snapshot.audit[0].action,'emergency-stop');
 await assert.rejects(()=>store.controlVirtualHospital(db,actor,'start'),/Acil durdurma/);
 sqlite.prepare("update integration_events set status='active' where event_id='automation:control'").run();
 await store.tickVirtualHospital(db,Date.now()+120000,120);assert.equal((await store.getVirtualHospital(db)).state.cursor,before);
 await store.controlVirtualHospital(db,actor,'clear');
});
