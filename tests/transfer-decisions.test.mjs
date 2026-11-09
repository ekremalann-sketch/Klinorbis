// Transfer: hedef birimin kabul/ret kararı, gerekçeli ret ve yeni hedefle tekrar teklif (yalnız kurgusal veri).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const {d1,sqlite}=await createD1();
const OPS='ops@klinorbis.test',DOC='clinician@klinorbis.test',YTKM='ytk-manager@klinorbis.test',CTMM='ctm-manager@klinorbis.test';
setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
const now=Date.now();
for(const [email,role,unit] of [[DOC,'clinician','YTK'],[YTKM,'unit_manager','YTK'],[CTMM,'unit_manager','CTM']]){
 sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(email,'Personel SIM',role,now);
 sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,active) VALUES(?,?,'Sentetik',1)").run(email,unit);
}
const api=await loadRoute('app/api/hospital-coordination/route.ts');
const post=(body,email=OPS)=>{const r=browserJson('/api/hospital-coordination',body,email);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
const view=async(email)=>(await api.GET(new Request(ORIGIN+'/api/hospital-coordination',{headers:{'oai-authenticated-user-email':email,'x-klinorbis-sim-tenant':'SIM-KURUM-A'}}))).json();
const job=id=>sqlite.prepare("SELECT * FROM simops_jobs WHERE tenant='SIM-KURUM-A' AND id=?").get(id);
const reservation=bed=>sqlite.prepare("SELECT job FROM simops_reservations WHERE tenant='SIM-KURUM-A' AND bed=?").get(bed)?.job;
const decisions=id=>sqlite.prepare("SELECT round,decision,target,reason FROM simops_transfer_decisions WHERE tenant='SIM-KURUM-A' AND job=? ORDER BY round,at,decision DESC").all(id).map(r=>({...r}));
const ready=id=>sqlite.prepare("UPDATE simops_beds SET physical='departed',hbys='vacant',cleaning='ready',technical=1,staffed=1,review=0,observed_at=?,version=version+1 WHERE tenant='SIM-KURUM-A' AND id=?").run(Date.now()-1000,id);
const occupied=id=>sqlite.prepare("UPDATE simops_beds SET physical='occupied',hbys='occupied',review=0,version=version+1 WHERE tenant='SIM-KURUM-A' AND id=?").run(id);
const request=(bed,target,patient,email=DOC)=>post({action:'transport',bed,target,patient,authority:'YTKL-SIM-002',decidedAt:Date.now()},email);
const decide=(id,decision,email,reason)=>post({action:'transfer-decide',id,version:job(id).version,decision,reason},email);

await test('kurulum',async()=>{
 assert.equal((await post({action:'init'})).status,200);
 for(const e of [DOC,YTKM,CTMM])sqlite.prepare("INSERT INTO simops_members(tenant,email) VALUES('SIM-KURUM-A',?)").run(e);
});

await test('klinisyen isteği hedef birim kararını bekler; transport kabulü o zamana kadar yapılamaz',async()=>{
 occupied('YTK-SIM-002');ready('YTK-SIM-001');
 const r=await request('YTK-SIM-002','YTK-SIM-001','HST-SIM-001');assert.equal(r.status,200);
 const {id,status}=await r.json();assert.equal(status,'offered');assert.equal(job(id).reason,'WAIT_TARGET');
 assert.equal(reservation('YTK-SIM-001'),id,'karar beklerken yatak ayrılı kalır');
 assert.equal((await post({action:'transition',id,version:job(id).version,transition:'accept'})).status,409,'hedef kararı olmadan transport kabul edilmez');
 assert.equal((await decide(id,'accept',CTMM)).status,403,'başka birimin yöneticisi karar veremez');
 assert.equal((await decide(id,'accept',DOC)).status,403,'isteyen klinisyen kendi isteğini kabul edemez');
 const v=job(id).version;
 const both=await Promise.all([post({action:'transfer-decide',id,version:v,decision:'accept'},YTKM),post({action:'transfer-decide',id,version:v,decision:'accept'},OPS)]);
 assert.deepEqual(both.map(x=>x.status).sort(),[200,409],'aynı karar iki kez uygulanmaz');
 assert.equal(job(id).status,'queued');
 assert.deepEqual(decisions(id).map(d=>d.decision),['offered','accepted']);
 assert.equal((await post({action:'transition',id,version:job(id).version,transition:'accept'})).status,200);
});

await test('gerekçeli ret ayırmayı kaldırır; yeni hedefle tekrar teklif aynı transfer dosyasında izlenir',async()=>{
 occupied('YTK-SIM-004');ready('YTK-SIM-003');ready('YTK-SIM-005');
 const {id}=await (await request('YTK-SIM-004','YTK-SIM-003','HST-SIM-002')).json();
 assert.equal((await decide(id,'reject',YTKM)).status,422,'gerekçesiz ret');
 assert.equal((await decide(id,'reject',YTKM,'Kurgusal: hedef odada teknik kontrol bekleniyor')).status,200);
 assert.equal(job(id).status,'declined');assert.equal(reservation('YTK-SIM-003'),undefined,'reddedilen yatak serbest kalır');
 assert.equal((await decide(id,'accept',YTKM)).status,409,'reddedilen teklif sonradan kabul edilemez');
 const reoffer=(target,email=DOC)=>post({action:'transfer-reoffer',id,version:job(id).version,target},email);
 assert.equal((await reoffer('YTK-SIM-003')).status,409,'aynı reddedilen hedef tekrar teklif edilmez');
 assert.equal((await reoffer('YTK-SIM-005',CTMM)).status,403,'kaynak birimi dışındaki yönetici tekrar teklif edemez');
 const again=await reoffer('YTK-SIM-005');assert.equal(again.status,200);assert.equal((await again.json()).status,'offered');
 assert.equal(job(id).target,'YTK-SIM-005');assert.equal(reservation('YTK-SIM-005'),id);
 assert.equal((await decide(id,'accept',YTKM)).status,200);
 assert.deepEqual(decisions(id).map(d=>[d.round,d.decision,d.target]),[[1,'offered','YTK-SIM-003'],[1,'rejected','YTK-SIM-003'],[2,'offered','YTK-SIM-005'],[2,'accepted','YTK-SIM-005']]);
 assert.equal(decisions(id)[1].reason,'Kurgusal: hedef odada teknik kontrol bekleniyor');
 const snapshot=await view(OPS);assert.equal(snapshot.transferDecisions.filter(d=>d.job===id).length,4);
});

await test('hedef birim yöneticisi kendisine gelen teklifi görür; yönetici veya hedef birim isteği kendiliğinden kabul edilir',async()=>{
 occupied('YTK-SIM-006');ready('YTK-SIM-007');
 const {id}=await (await request('YTK-SIM-006','YTK-SIM-007','HST-SIM-003')).json();
 const managerView=await view(YTKM);assert.ok(managerView.jobs.some(j=>j.id===id&&j.status==='offered'),'hedef birim teklifi görür');
 assert.equal((await post({action:'transport-cancel',id,version:job(id).version,reason:'Kurgusal: plan değişti'})).status,200);
 const own=await (await request('YTK-SIM-006','YTK-SIM-007','HST-SIM-003',YTKM)).json();
 assert.equal(own.status,'queued','hedef birimin yöneticisi isterse kabul kendiliğinden kaydedilir');
 assert.deepEqual(decisions(own.id).map(d=>d.decision),['offered','accepted']);
});

await test('süresi dolan teklif karara açılmaz ve ayırma kalkar',async()=>{
 occupied('YTK-SIM-008');ready('YTK-SIM-001');
 sqlite.prepare("DELETE FROM simops_reservations WHERE tenant='SIM-KURUM-A' AND bed='YTK-SIM-001'").run();
 const old=Date.now()-31*60000;
 sqlite.prepare("INSERT INTO simops_jobs(tenant,id,kind,bed,target,unit,authority,patient,status,reason,created_at,updated_at) VALUES('SIM-KURUM-A','SIM-OFFER-OLD','transport','YTK-SIM-008','YTK-SIM-001','ULS','YTKL-SIM-001','HST-SIM-009','offered','WAIT_TARGET',?,?)").run(old,old);
 sqlite.prepare("INSERT INTO simops_reservations(tenant,bed,patient,job) VALUES('SIM-KURUM-A','YTK-SIM-001','HST-SIM-009','SIM-OFFER-OLD')").run();
 assert.equal((await decide('SIM-OFFER-OLD','accept',YTKM)).status,409);
 const snapshot=await view(OPS);assert.equal(snapshot.jobs.find(j=>j.id==='SIM-OFFER-OLD').status,'expired');
 assert.equal(snapshot.beds.find(b=>b.id==='YTK-SIM-001').reserved,false,'süresi dolan ayırma kapasiteden düşülmez');
});
