import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';
const OWNER='owner@klinorbis.test';
async function fixture(){const {d1,sqlite}=await createD1();setRuntime(d1,{ownerEmail:OWNER});return {d1,sqlite};}
await test('localhost without explicit preview opt-in is not an owner',async()=>{
 await fixture();const route=await loadRoute('app/api/workspace/route.ts');
 assert.equal((await route.GET(new Request('http://localhost/api/workspace'))).status,401);
});
await test('privacy officer cannot create operations or unmasked call messages',async()=>{
 const {sqlite}=await fixture();sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES('privacy@test','Privacy','privacy_officer',1,?)").run(Date.now());
 for(const path of ['tickets','calls','calls/messages','calls/actions']){
  const route=await loadRoute('app/api/'+path+'/route.ts');const r=await route.POST(browserJson('/api/'+path,{},'privacy@test'));assert.equal(r.status,403);
 }
});
await test('pending approval prevents ticket completion; late approval never reopens a closed ticket',async()=>{
 const {sqlite}=await fixture();
 const tickets=await loadRoute('app/api/tickets/route.ts');const approvals=await loadRoute('app/api/approvals/route.ts');
 const response=await tickets.POST(browserJson('/api/tickets',{patientAlias:'DEMO-ACIL',subject:'gogus agrisi var'},OWNER));assert.equal(response.status,201);const {ticket}=await response.json();
 const req=browserJson('/api/tickets',{reference:ticket.reference,action:'resolve'},OWNER);
 const blocked=await tickets.PATCH(new Request(req,{method:'PATCH'}));assert.equal(blocked.status,409);
 sqlite.prepare("UPDATE tickets SET status='Çözüldü' WHERE reference=?").run(ticket.reference);
 const decision=await approvals.POST(browserJson('/api/approvals',{reference:'ONAY-'+ticket.reference,decision:'approve'},OWNER));assert.equal(decision.status,409);
 assert.equal(sqlite.prepare('SELECT status FROM tickets WHERE reference=?').get(ticket.reference).status,'Çözüldü');
});
await test('valid approval atomically updates the pending ticket and task',async()=>{
 const {sqlite}=await fixture();const tickets=await loadRoute('app/api/tickets/route.ts');const approval=await loadRoute('app/api/approvals/route.ts');
 const {ticket}=await (await tickets.POST(browserJson('/api/tickets',{patientAlias:'DEMO-ONAY',subject:'nefes alamiyorum'},OWNER))).json();
 const r=await approval.POST(browserJson('/api/approvals',{reference:'ONAY-'+ticket.reference,decision:'approve',note:'Numara 10000000146'},OWNER));assert.equal(r.status,200,JSON.stringify(await r.json()));
 assert.equal(sqlite.prepare('SELECT status FROM tickets WHERE reference=?').get(ticket.reference).status,'Kabul edildi');
 assert.equal(sqlite.prepare('SELECT status FROM operational_tasks WHERE ticket_reference=?').get(ticket.reference).status,'accepted');
 assert.ok(!sqlite.prepare('SELECT decision_note FROM approvals WHERE ticket_reference=?').get(ticket.reference).decision_note.includes('10000000146'));
});
await test('out-of-order transcript remains retryable after call.started',async()=>{
 await fixture();globalThis.__KLINORBIS_SECURITY_ENV.webhookSecret='test-secret';const route=await loadRoute('app/api/integrations/calls/route.ts');
 const pbx=(body,id)=>{const raw=JSON.stringify(body),time=String(Date.now());return new Request(ORIGIN+'/api/integrations/calls',{method:'POST',headers:{'content-type':'application/json','x-klinorbis-event-id':id,'x-klinorbis-timestamp':time,'x-klinorbis-signature':createHmac('sha256','test-secret').update(time+'.'+id+'.'+raw).digest('hex')},body:raw});};
 const line={eventType:'transcript.final',callReference:'CALL-RETRY-001',text:'Randevu bilgisi'};
 assert.equal((await route.POST(pbx(line,'evt-retry-001'))).status,409);
 assert.equal((await route.POST(pbx({eventType:'call.started',callReference:line.callReference},'evt-start-001'))).status,202);
 assert.equal((await route.POST(pbx(line,'evt-retry-001'))).status,202);
});
