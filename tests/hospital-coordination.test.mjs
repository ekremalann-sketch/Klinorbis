import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';
const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',CLEAN='clean@klinorbis.test',OTHER='other@klinorbis.test',B='other-tenant@klinorbis.test';setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
const now=Date.now();for(const [email,role,unit] of [[CLEAN,'call_agent','CTM'],[OTHER,'operations_manager','YTK'],[B,'unit_manager','YTK']]){sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(email,'Personel SIM',role,now);sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,active) VALUES(?,?,'Sentetik',1)").run(email,unit);}
const api=await loadRoute('app/api/hospital-coordination/route.ts');const lib=await loadRoute('lib/hospital-coordination.ts');
const post=(body,email=OPS,tenant='SIM-KURUM-A')=>{const r=browserJson('/api/hospital-coordination',body,email);r.headers.set('x-klinorbis-sim-tenant',tenant);return api.POST(r);};
const get=(email=OPS,tenant='SIM-KURUM-A')=>api.GET(new Request(ORIGIN+'/api/hospital-coordination',{headers:{'oai-authenticated-user-email':email,'x-klinorbis-sim-tenant':tenant}}));
let seq=0;const event=(bed,kind,sourceVersion,extra={})=>({id:'SIM-EVT-'+(++seq),bed,kind,sourceVersion,observedAt:Date.now(),authority:'YTKL-SIM-001',synthetic:true,...extra});
const bed=id=>sqlite.prepare('SELECT * FROM simops_beds WHERE tenant=? AND id=?').get('SIM-KURUM-A',id);
const job=id=>sqlite.prepare('SELECT * FROM simops_jobs WHERE tenant=? AND id=?').get('SIM-KURUM-A',id);
const transition=(id,action,email=OPS,confirmation)=>post({action:'transition',id,version:job(id).version,transition:action,confirmation},email);
let cleaning;
await test('HBYS: yetkisiz erişim ve kurulum reddedilir; gerçek sayaçlara dokunulmaz',async()=>{
 const before=['tickets','operational_tasks','patient_notifications'].map(t=>sqlite.prepare('SELECT count(*) n FROM '+t).get().n);
 assert.equal((await api.GET(new Request(ORIGIN+'/api/hospital-coordination'))).status,401);
 assert.equal((await post({action:'init'},CLEAN)).status,403);
 assert.equal((await post({action:'init'})).status,200);
 for(const e of [CLEAN,OTHER]){sqlite.prepare('INSERT INTO simops_members(tenant,email) VALUES(?,?)').run('SIM-KURUM-A',e);for(const u of ['CTM','ULS'])sqlite.prepare('INSERT INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES(?,?,?,?,?,1)').run('SIM-KURUM-A',e,u,now-1000,now+3600000);}
 sqlite.prepare('INSERT INTO simops_members(tenant,email) VALUES(?,?)').run('SIM-KURUM-B',B);
 const result=await (await get()).json();assert.equal(result.beds.length,8);assert.equal(result.realConnection,'Kapalı');assert.match(result.label,/gerçek pilot sonucu değildir/);
 assert.deepEqual(['tickets','operational_tasks','patient_notifications'].map(t=>sqlite.prepare('SELECT count(*) n FROM '+t).get().n),before);
});
await test('HBYS: kurum kapsamı sunucuda zorlanır; başka kurumun kayıtları görünmez',async()=>{
 assert.equal((await get(B)).status,403);assert.equal((await get(OPS,'SIM-KURUM-B')).status,403);assert.equal((await post({action:'event',event:event('YTK-SIM-001','departure.confirmed',1)},B)).status,403);
});
await test('HBYS: gerçek veri ve fazladan kimlik alanı alınmaz; klinik karar kaynağı zorunlu',async()=>{
 assert.equal((await post({action:'event',event:event('YTK-SIM-001','departure.confirmed',1,{synthetic:false})})).status,403);
 assert.equal((await post({action:'event',event:event('YTK-SIM-001','departure.confirmed',1,{name:'Gerçek Ad'})})).status,422);
 assert.equal((await post({action:'event',event:event('YTK-SIM-001','departure.confirmed',1,{authority:'Karar yok'})})).status,422);
});
await test('kabul 1: resmî taburcu yatağı hazır yapmaz; fiziksel ayrılış tek temizlik görevi açar',async()=>{
 const a=await post({action:'event',event:event('YTK-SIM-001','discharge.recorded',1)});assert.equal(a.status,200);assert.equal(bed('YTK-SIM-001').physical,'occupied');assert.equal(lib.bedReady(bed('YTK-SIM-001')),false);
 const e=event('YTK-SIM-001','departure.confirmed',2);const response=await post({action:'event',event:e});cleaning=(await response.json()).task;assert.ok(cleaning);assert.equal(bed('YTK-SIM-001').cleaning,'queued');assert.equal(lib.bedReady(bed('YTK-SIM-001')),false);
 const duplicate=await (await post({action:'event',event:{...e}})).json();assert.equal(duplicate.duplicate,true);assert.equal(sqlite.prepare("SELECT count(*) n FROM simops_jobs WHERE kind='cleaning'").get().n,1);
 assert.equal((await post({action:'event',event:{...e,kind:'cancel'}})).status,409);
});
await test('temizlik: iki kişi aynı işi alamaz; sırayı atlayamaz; işi yapan kendi kontrolünü onaylayamaz',async()=>{
 const v=job(cleaning).version;const r=await Promise.all([post({action:'transition',id:cleaning,version:v,transition:'accept'},CLEAN),post({action:'transition',id:cleaning,version:v,transition:'accept'},OTHER)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
 const owner=job(cleaning).owner;assert.equal((await transition(cleaning,'inspect',OPS)).status,409);assert.equal((await transition(cleaning,'start',owner)).status,200);assert.equal((await transition(cleaning,'complete',owner)).status,200);assert.equal(lib.bedReady(bed('YTK-SIM-001')),false);
 assert.equal((await transition(cleaning,'inspect',owner)).status,403);const inspector=owner===OTHER?OPS:OTHER;assert.equal((await transition(cleaning,'inspect',inspector)).status,200);assert.equal(lib.bedReady(bed('YTK-SIM-001')),true);
});
await test('kapasite: teknik/personel engeli, eski kaynak veya HBYS çelişkisi hazır sayılmaz',()=>{
 const b=bed('YTK-SIM-001');for(const change of [{technical:0},{staffed:0},{review:1},{hbys:'occupied'},{physical:'occupied'},{observed_at:Date.now()-900001}])assert.equal(lib.bedReady({...b,...change}),false);
});
let transport;
await test('kabul 2: hedef yatağa eşzamanlı iki rezervasyon olmaz; yetkili karar zamanı kaydedilir',async()=>{
 const req={action:'transport',bed:'YTK-SIM-002',target:'YTK-SIM-001',patient:'HST-SIM-001',authority:'YTKL-SIM-002',decidedAt:Date.now()};
 const r=await Promise.all([post(req),post({...req,patient:'HST-SIM-002'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);transport=(await r.find(x=>x.status===200).json()).id;assert.ok(job(transport).decision_at);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM simops_reservations').get().n,1);
});
await test('transport: varış ve çift doğrulama beyanı olmadan teslim tamamlanmaz; kaynak/hedef mutabakatı açık kalır',async()=>{
 assert.equal((await transition(transport,'accept')).status,200);assert.equal((await transition(transport,'start')).status,200);
 assert.equal((await transition(transport,'deliver',OPS,{target:'YTK-SIM-001',twoIdentifiersVerified:true})).status,422);
 assert.equal((await transition(transport,'deliver',OPS,{target:'YTK-SIM-003',twoIdentifiersVerified:true,receiverConfirmed:true,receiver:'PRS-SIM-004'})).status,422);
 assert.equal((await transition(transport,'deliver',OPS,{target:'YTK-SIM-001',twoIdentifiersVerified:true,receiverConfirmed:true,receiver:'PRS-SIM-004'})).status,200);
 assert.equal(job(transport).status,'done');assert.equal(bed('YTK-SIM-001').physical,'occupied');assert.equal(bed('YTK-SIM-002').physical,'departed');assert.equal(bed('YTK-SIM-001').review,1);assert.equal(bed('YTK-SIM-002').review,1);assert.ok(job(transport).delivery_evidence);
});
await test('iptal ve düzeltme bitmiş işi açmaz; inceleme işi ve kapasite engeli oluşturur',async()=>{
 const result=await (await post({action:'event',event:event('YTK-SIM-001','cancel',3)})).json();assert.equal(result.status,'review');assert.equal(job(cleaning).status,'done');assert.equal(job(transport).status,'done');assert.equal(job(result.task).kind,'review');assert.equal(lib.bedReady(bed('YTK-SIM-001')),false);
});
await test('sıra dışı mesaj yeni durumu ezmez; karantina kaydı tekrar göreve dönüşmez',async()=>{
 const before=JSON.stringify(bed('YTK-SIM-001'));const result=await (await post({action:'event',event:event('YTK-SIM-001','departure.confirmed',1)})).json();assert.equal(result.status,'stale');assert.equal(JSON.stringify(bed('YTK-SIM-001')),before);
 const bad=event('YTK-SIM-999','departure.confirmed',1);const r=await (await post({action:'event',event:bad})).json();assert.equal(r.status,'quarantine');for(let i=0;i<4;i++)assert.equal((await post({action:'retry',id:bad.id})).status,200);assert.equal((await post({action:'retry',id:bad.id})).status,409);
});
await test('acil durdurma yeni olay ve görevlendirmeyi durdurur',async()=>{
 sqlite.prepare("INSERT INTO integration_events(event_id,source,event_type,payload_hash,status,received_at) VALUES('automation:control','klinorbis','automation.control','-','paused',?)").run(Date.now());assert.equal((await post({action:'event',event:event('YTK-SIM-003','departure.confirmed',1)})).status,409);sqlite.prepare("DELETE FROM integration_events WHERE event_id='automation:control'").run();
});
await test('vardiya: vardiya dışı ve uygun olmayan kişiye görev yüklenmez; devir kabulüne kadar sahip korunur',async()=>{
 const e=event('YTK-SIM-004','departure.confirmed',1);const id=(await (await post({action:'event',event:e})).json()).task;
 sqlite.prepare("UPDATE simops_duty SET available=0 WHERE tenant='SIM-KURUM-A' AND email=? AND unit='CTM'").run(CLEAN);
 assert.equal((await transition(id,'accept',CLEAN)).status,403);
 sqlite.prepare("UPDATE simops_duty SET available=1,ends_at=? WHERE tenant='SIM-KURUM-A' AND email=? AND unit='CTM'").run(Date.now()-1,CLEAN);
 assert.equal((await transition(id,'accept',CLEAN)).status,403);
 sqlite.prepare("UPDATE simops_duty SET ends_at=? WHERE tenant='SIM-KURUM-A' AND email=? AND unit='CTM'").run(Date.now()+3600000,CLEAN);
 assert.equal((await transition(id,'accept',CLEAN)).status,200);
 const h=await post({action:'handoff',id,version:job(id).version,to:OTHER},CLEAN);assert.equal(h.status,200);assert.equal(job(id).owner,CLEAN);
 assert.equal((await post({action:'handoff',id,version:job(id).version,accept:true},OPS)).status,403);
 assert.equal((await post({action:'handoff',id,version:job(id).version,accept:true},OTHER)).status,200);assert.equal(job(id).owner,OTHER);
});
await test('mutabakat: bilinmeyen HBYS durumu onaylanamaz; güncel doğrulama eski işi açmaz',async()=>{
 let b=bed('YTK-SIM-001');assert.equal((await post({action:'reconcile',id:b.id,version:b.version,sourceChecked:true,physicalChecked:true,sourceVersion:b.source_version})).status,422);
 await post({action:'event',event:event(b.id,'occupancy.confirmed',4)});b=bed(b.id);assert.equal((await post({action:'reconcile',id:b.id,version:b.version,sourceChecked:true,physicalChecked:true,sourceVersion:b.source_version})).status,200);assert.equal(bed(b.id).review,0);assert.equal(job(transport).status,'done');
});
await test('kapasite engelleri sürümle ve yetkiyle değiştirilir; açık kontrol zorlanamaz',async()=>{
 let b=bed('YTK-SIM-003');assert.equal((await post({action:'bed-control',id:b.id,version:b.version,technical:false,staffed:false},CLEAN)).status,403);assert.equal((await post({action:'bed-control',id:b.id,version:b.version,technical:false,staffed:false})).status,200);assert.equal(bed(b.id).technical,0);assert.equal((await post({action:'bed-control',id:b.id,version:b.version,technical:true,staffed:true})).status,409);
});

await test('rezervasyon iptali yetki ve sürüm denetiminden sonra yatağı serbest bırakır',async()=>{
 const insert=sqlite.prepare("INSERT INTO simops_jobs(tenant,id,kind,bed,target,unit,authority,status,created_at,updated_at) VALUES('SIM-KURUM-A',?,'transport','YTK-SIM-002','YTK-SIM-001','ULS','YTKL-SIM-001',?,?,?)");
 insert.run('SIM-CANCEL','queued',Date.now(),Date.now());
 sqlite.prepare("INSERT INTO simops_reservations VALUES('SIM-KURUM-A','YTK-SIM-001','HST-SIM-001','SIM-CANCEL')").run();
 const body={action:'transport-cancel',id:'SIM-CANCEL',version:0,reason:'Kurgusal taşıma ertelendi'};
 assert.equal((await post(body,CLEAN)).status,403);
 assert.equal((await post({...body,version:1})).status,409);
 assert.equal((await post(body)).status,200);
 assert.equal(job('SIM-CANCEL').status,'cancelled');
 assert.equal(sqlite.prepare("SELECT count(*) n FROM simops_reservations WHERE job='SIM-CANCEL'").get().n,0);
 insert.run('SIM-ACTIVE','active',Date.now(),Date.now());
 assert.equal((await post({...body,id:'SIM-ACTIVE'})).status,409);
});
await test('eski açık iş kapalı kayıtlar tarafından kuyruktan düşürülmez',async()=>{
 const insert=sqlite.prepare("INSERT INTO simops_jobs(tenant,id,kind,bed,unit,authority,status,created_at,updated_at) VALUES('SIM-KURUM-A',?,'review','YTK-SIM-002',?,'YTKL-SIM-001',?,?,?)");
 insert.run('SIM-OLD-OPEN','CTM','queued',1,1);
 for(let i=0;i<205;i++)insert.run('SIM-CLOSED-'+i,'YTK','done',Date.now(),Date.now());
 const response=await get(CLEAN);
 assert.equal(response.status,200);
 const view=await response.json();
 assert.ok(view.jobs.some(j=>j.id==='SIM-OLD-OPEN'));
 assert.ok(view.jobs.every(j=>j.unit==='CTM'));
});
await test('süresi dolan rezervasyon başlatılamaz ve yeni talep yatağı alabilir',async()=>{
 const old=Date.now()-lib.TRANSPORT_HOLD_MS-1;
 sqlite.prepare("UPDATE simops_beds SET physical='departed',hbys='vacant',cleaning='ready',review=0,observed_at=? WHERE tenant='SIM-KURUM-A' AND id='YTK-SIM-001'").run(Date.now());
 sqlite.prepare("UPDATE simops_beds SET physical='occupied',review=0 WHERE tenant='SIM-KURUM-A' AND id='YTK-SIM-008'").run();
 sqlite.prepare("INSERT INTO simops_jobs(tenant,id,kind,bed,target,unit,authority,status,created_at,updated_at) VALUES('SIM-KURUM-A','SIM-EXPIRED','transport','YTK-SIM-008','YTK-SIM-001','ULS','YTKL-SIM-001','accepted',?,?)").run(old,old);
 sqlite.prepare("INSERT INTO simops_reservations VALUES('SIM-KURUM-A','YTK-SIM-001','HST-SIM-003','SIM-EXPIRED')").run();
 assert.equal((await transition('SIM-EXPIRED','start')).status,409);
 const response=await post({action:'transport',bed:'YTK-SIM-008',target:'YTK-SIM-001',patient:'HST-SIM-004',authority:'YTKL-SIM-002',decidedAt:Date.now()});
 assert.equal(response.status,200,await response.clone().text());
 assert.equal(job('SIM-EXPIRED').status,'cancelled');
 assert.equal(sqlite.prepare("SELECT job FROM simops_reservations WHERE bed='YTK-SIM-001'").get().job,(await response.json()).id);
});
