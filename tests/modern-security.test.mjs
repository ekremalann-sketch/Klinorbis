import assert from 'node:assert/strict';
import test from 'node:test';
import {createD1,loadRoute,setRuntime} from './helpers/route-harness.mjs';
const {d1,sqlite}=await createD1();const owner='ops@klinorbis.test';setRuntime(d1,{ownerEmail:owner,demoEnabled:'0'});
await test('Güvenlik logunun ayrıntısında telefon/e-posta/TCKN maskelenir',async()=>{
 const {recordSecurityEvent}=await loadRoute('lib/security.ts');
 await recordSecurityEvent(new Request('https://klinorbis.test/api/test'),'test','medium',owner,'iletisim: hasta@example.com 0532 123 45 67 10000000146');
 const row=sqlite.prepare("select detail from security_events where event_type='test'").get();
 assert.ok(row.detail.includes('[EMAIL_MASKED]'));assert.ok(row.detail.includes('[PHONE_MASKED]'));assert.ok(row.detail.includes('[TCKN_MASKED]'));assert.ok(!row.detail.includes('hasta@example.com'));
});
await test('Öncelik şeridi tamamlanmış işi acil saymaz ve aynı hedefi tekrar etmez',async()=>{
 const {attentionItems}=await loadRoute('lib/attention.ts');const now=Date.now();
 const cards=attentionItems({tasks:[{status:'completed',priority:'Acil'},{status:'queued',priority:'Normal',dueAt:new Date(now-1000)}],approvals:[{status:'pending'}],calls:[]},now);
 assert.equal(new Set(cards.map(c=>c.view)).size,cards.length);assert.equal(cards[0].critical,false);assert.equal(cards[0].value,1);assert.ok(cards[0].detail.includes('1 geciken'));assert.equal(cards[1].critical,false);
});
await test('Rapor üretimde eğitim verisini dışarı çıkarmaz; kapsam sorgusu değişken limitini aşmaz',async()=>{
 const db=await loadRoute('db/index.ts'),ops=await loadRoute('lib/operations.ts');
 globalThis.__KLINORBIS_DEMO_ENABLED='1';await ops.ensureOperationalSeed(db.getDb());globalThis.__KLINORBIS_DEMO_ENABLED='0';
 const route=await loadRoute('app/api/reports/export/route.ts');
 const response=await route.GET(new Request('https://klinorbis.test/api/reports/export?report=NETWORK_SUMMARY',{headers:{'oai-authenticated-user-email':owner}}));
 assert.equal(response.status,200);const csv=await response.text();assert.ok(!csv.includes('XFR-PILOT'));assert.match(csv,/Toplam kaynak;0/);
});
await test('200 kayıtlı birimde rapor değişken sınırını aşmaz ve başka birimin işini içermez',async()=>{
 const now=Date.now(),email='manager@klinorbis.test';
 sqlite.prepare('insert into staff_accounts(email,display_label,system_role,active,created_at) values(?,?,?,?,?)').run(email,'Birim Yöneticisi','unit_manager',1,now);
 sqlite.prepare('insert into unit_memberships(email,unit_code,active) values(?,?,1)').run(email,'HIL');
 for(let i=0;i<205;i++){
  const ref='REPORT-'+i,unit=i===204?'RAD':'HIL';
  sqlite.prepare('insert into tickets(reference,patient_alias,subject,unit,unit_code,created_at,updated_at) values(?,?,?,?,?,?,?)').run(ref,'HST-TEST','Maskeleme testi',unit,unit,now,now);
  sqlite.prepare('insert into workflow_jobs(job_key,ticket_reference,rule_code,idempotency_key,correlation_id,next_run_at,created_at) values(?,?,?,?,?,?,?)').run('JOB-'+i,ref,'test','idem-'+i,'corr-'+i,now,now);
 }
 const route=await loadRoute('app/api/reports/export/route.ts');
 const response=await route.GET(new Request('https://klinorbis.test/api/reports/export?report=AUTOMATION',{headers:{'oai-authenticated-user-email':email}}));
 assert.equal(response.status,200);const csv=await response.text();assert.ok(csv.includes('REPORT-203'));assert.ok(!csv.includes('REPORT-204'));assert.equal(csv.split('\r\n').length,205);
});
