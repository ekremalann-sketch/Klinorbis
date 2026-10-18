import assert from 'node:assert/strict';
import test from 'node:test';
import {browserJson,createD1,loadRoute,setRuntime} from './helpers/route-harness.mjs';
const {d1,sqlite}=await createD1();const owner='ops@klinorbis.test';setRuntime(d1,{ownerEmail:owner,demoEnabled:'0'});
const agent=await loadRoute('lib/agent-runtime.ts'),database=await loadRoute('db/index.ts'),control=await loadRoute('app/api/automation/control/route.ts');
await test('Üretim döngüsü eğitim çağrısı, talebi ve sevk üretmez',async()=>{
 const result=await agent.runAutomationAgent(database.getDb());assert.equal(result.ran,true);assert.equal(result.pilot.enabled,false);assert.equal(result.controlTower.enabled,false);
 for(const table of ['tickets','call_sessions','approvals','transfer_requests'])assert.equal(sqlite.prepare(`select count(*) n from ${table}`).get().n,0,table);
});
await test('Yetkisiz durdurma reddedilir; durdurma kalıcıdır ve denetim kaydıyla birlikte yazılır',async()=>{
 assert.equal((await control.POST(browserJson('/api/automation/control',{paused:true}))).status,401);
 const pause=await control.POST(browserJson('/api/automation/control',{paused:true},owner));assert.equal(pause.status,200);
 assert.equal((await agent.runAutomationAgent(database.getDb())).ran,false);
 const engine=await loadRoute('lib/workflow-engine.ts');assert.equal((await engine.runWorkflowCycle(database.getDb())).paused,true);
 assert.equal(sqlite.prepare("select count(*) n from audit_logs where action='automation.pause'").get().n,1);
 assert.equal((await control.POST(browserJson('/api/automation/control',{paused:false},owner))).status,200);
});
await test('Belirti metni klinik aciliyet veya klinik yönlendirme üretmez',async()=>{
 const {urgencySignal}=await loadRoute('lib/privacy.ts');for(const text of ['kalp krizi geçiriyor','zehirlenme şüphesi','anafilaksi başladı','çocukta havale var','ciddi yanık var'])assert.equal(urgencySignal(text).isEmergency,false,text);
 assert.equal(urgencySignal('kalp krizi yok').isEmergency,false);
});
await test('Eski eğitim kayıtları üretim listelerine ve sayaçlarına girmez',async()=>{
 globalThis.__KLINORBIS_DEMO_ENABLED='1';globalThis.__KLINORBIS_OPERATIONAL_SEEDED=false;
 const ops=await loadRoute('lib/operations.ts');await ops.ensureOperationalSeed(database.getDb());
 assert.ok(sqlite.prepare('select count(*) n from tickets').get().n>0);
 globalThis.__KLINORBIS_DEMO_ENABLED='0';
 const snapshot=await ops.workspaceSnapshot(database.getDb(),{email:owner,label:'Yönetici',role:'operations_manager',canSeeAllUnits:true,unitCodes:[]});
 assert.equal(snapshot.tickets.length,0);assert.equal(snapshot.calls.length,0);assert.equal(snapshot.tasks.length,0);assert.equal(snapshot.approvals.length,0);assert.equal(snapshot.capacity.length,0);assert.equal(snapshot.transfers.length,0);
 const route=await loadRoute('app/api/tickets/route.ts');const result=await route.GET(new Request('https://klinorbis.test/api/tickets',{headers:{'x-chatgpt-user-email':owner}}));
 // Snapshot assertion checks before-limit SQL filtering; route authorization is covered by the access matrix.
 assert.notEqual(result.status,500);
});
