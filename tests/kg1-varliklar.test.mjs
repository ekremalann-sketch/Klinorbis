// KG1 (adım 1): varlık kaydı. Yetki sunucuda; birim kapsamı; vade renkleri; eşzamanlı güncelleme; denetim kaydı; QR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const lib=await loadRoute('lib/assets.ts');
const OPS='ops@klinorbis.test',BMD='bmd@klinorbis.test',TKH='tkh@klinorbis.test',PER='per@klinorbis.test',PRV='kvkk@klinorbis.test';
async function setup(){
  const {d1,sqlite}=await createD1();const now=Date.now();
  setRuntime(d1,{demoEnabled:'0'});
  const add=(email,role,unit)=>{sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(email,email,role,now);
    if(unit)sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,?,'Test',1,0,1)").run(email,unit);};
  add(OPS,'operations_manager');add(BMD,'unit_manager','BMD');add(TKH,'unit_manager','TKH');add(PER,'call_agent','BMD');add(PRV,'privacy_officer');
  return {sqlite,api:await loadRoute('app/api/assets/route.ts')};
}
const get=async(api,email,q='')=>{const r=await api.GET(new Request(`${ORIGIN}/api/assets${q}`,{headers:{'oai-authenticated-user-email':email}}));return {status:r.status,body:await r.json()};};
const post=async(api,email,body)=>{const r=await api.POST(browserJson('/api/assets',body,email));return {status:r.status,body:await r.json()};};

test('vade rengi: gecikmiş kırmızı, 30 gün içi sarı, sonrası yeşil; plan yoksa "yok"',()=>{
  const now=Date.UTC(2026,10,19),D=86400000;
  assert.equal(lib.dueOf(null,null,now).level,'yok');
  assert.equal(lib.dueOf(null,180,now).level,'kirmizi','hiç bakım kaydı yoksa gecikmiş');
  assert.equal(lib.dueOf(now-200*D,180,now).level,'kirmizi');
  assert.equal(lib.dueOf(now-160*D,180,now).level,'sari');
  assert.equal(lib.dueOf(now-10*D,180,now).level,'yesil');
});

await test('kayıt: birim sorumlusu yalnız kendi birimine, personel ve gözetim rolü hiç açamaz; kod sıralı',async()=>{
  const {sqlite,api}=await setup();
  const ok=await post(api,BMD,{action:'create',kind:'biyomedikal',name:'İnfüzyon pompası',unitCode:'BMD',maintenanceIntervalDays:180,serial:'SN-KURGU-1'});
  assert.equal(ok.status,200);assert.equal(ok.body.result.code,'BIO-0001');
  assert.equal((await post(api,BMD,{action:'create',kind:'biyomedikal',name:'Defibrilatör',unitCode:'BMD'})).body.result.code,'BIO-0002');
  assert.equal((await post(api,BMD,{action:'create',kind:'teknik',name:'Jeneratör',unitCode:'TKH'})).status,403,'başka birime kayıt yok');
  assert.equal((await post(api,PER,{action:'create',kind:'teknik',name:'X',unitCode:'BMD'})).status,403,'personel kayıt açamaz');
  assert.equal((await post(api,PRV,{action:'create',kind:'teknik',name:'X',unitCode:'BMD'})).status,403,'gözetim rolü kayıt açamaz');
  assert.equal((await post(api,OPS,{action:'create',kind:'teknik',name:'Jeneratör',unitCode:'TKH'})).body.result.code,'TEK-0001');
  assert.equal((await post(api,OPS,{action:'create',kind:'uzay',name:'X',unitCode:'TKH'})).status,400);
  assert.equal((await post(api,OPS,{action:'create',kind:'teknik',name:'X',unitCode:'TKH',maintenanceIntervalDays:-3})).status,400);
  const audit=sqlite.prepare("SELECT count(*) n FROM audit_logs WHERE action='asset.created'").get().n;assert.equal(audit,3);
});

await test('okuma birimle sınırlı; QR kodu ile tek varlık açılır',async()=>{
  const {api}=await setup();
  await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Monitör',unitCode:'BMD'});
  await post(api,OPS,{action:'create',kind:'teknik',name:'Klima santrali',unitCode:'TKH'});
  assert.deepEqual((await get(api,BMD)).body.assets.map(a=>a.code),['BIO-0001']);
  assert.deepEqual((await get(api,TKH)).body.assets.map(a=>a.code),['TEK-0001']);
  assert.equal((await get(api,OPS)).body.assets.length,2);
  assert.equal((await get(api,PER)).body.canCreate,false);
  assert.deepEqual((await get(api,OPS,'?kod=tek-0001')).body.assets.map(a=>a.code),['TEK-0001']);
  assert.equal((await get(api,TKH,'?kod=BIO-0001')).body.assets.length,0,'başka birimin varlığı kodla da görünmez');
});

await test('güncelleme: sürüm çakışması 409, başka birim 404, hurda kilitli, her değişiklik denetimde',async()=>{
  const {sqlite,api}=await setup();
  await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Monitör',unitCode:'BMD',calibrationIntervalDays:365});
  assert.equal((await get(api,BMD)).body.assets[0].calibrationDue.level,'kirmizi');
  assert.equal((await post(api,BMD,{action:'update',code:'BIO-0001',version:1,change:'calibrated'})).status,200);
  const a=(await get(api,BMD)).body.assets[0];assert.equal(a.calibrationDue.level,'yesil');assert.equal(a.version,2);
  assert.equal((await post(api,BMD,{action:'update',code:'BIO-0001',version:1,change:'maintained'})).status,409,'eski sürümle güncelleme yok');
  assert.equal((await post(api,TKH,{action:'update',code:'BIO-0001',version:2,change:'maintained'})).status,404);
  assert.equal((await post(api,PER,{action:'update',code:'BIO-0001',version:2,change:'maintained'})).status,403);
  assert.equal((await post(api,BMD,{action:'update',code:'BIO-0001',version:2,change:'status',status:'hurda'})).status,200);
  assert.equal((await post(api,BMD,{action:'update',code:'BIO-0001',version:3,change:'status',status:'aktif'})).status,409);
  assert.deepEqual(sqlite.prepare("SELECT action FROM audit_logs WHERE resource='BIO-0001' ORDER BY id").all().map(r=>r.action),['asset.created','asset.calibrated','asset.status']);
});

test('ekran: tek ana düğme, QR varlığa bağlanır, klinik dil yok, giriş zorunlu',()=>{
  const ui=readFileSync('app/varliklar/assets.tsx','utf8'),page=readFileSync('app/varliklar/page.tsx','utf8');
  // Tek ana düğme: zimmet onayı bekliyorsa "Zimmeti onayla", değilse "Arıza bildir" (aynı yerde, biri ya da öteki).
  assert.equal((ui.match(/className="main"/g)??[]).length,2);assert.match(ui,/\?<button className="main"[^\n]+\n\s+:<button className="main"/);
  assert.match(ui,/\/varliklar\?kod=/);assert.match(ui,/Diğer işlemler/);
  assert.doesNotMatch(ui+readFileSync('lib/assets.ts','utf8'),/triyaj|erken uyarı|klinik öneri|tanı|tedavi/i);
  assert.match(page,/requireChatGPTUser\('\/varliklar'\)/);assert.match(page,/privateMeta/);
});

await test('tür ve durum yalnız tanımlı değerlerden seçilir; prototip adları reddedilir',async()=>{
  const {sqlite,api}=await setup();
  const proto=['constructor','__proto__','toString','hasOwnProperty'];
  for(const kind of proto)assert.equal((await post(api,OPS,{action:'create',kind,name:'Kurgusal cihaz',unitCode:'BMD'})).status,400,kind);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM assets').get().n,0);
  const ok=await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Kurgusal cihaz',unitCode:'BMD',ownerType:'constructor'});
  assert.equal(ok.status,200);assert.equal(sqlite.prepare('SELECT owner_type FROM assets').get().owner_type,'hastane','tanımsız sahiplik varsayılana düşer');
  for(const status of proto)assert.equal((await post(api,OPS,{action:'update',code:'BIO-0001',version:1,change:'status',status})).status,400,status);
  assert.deepEqual({...sqlite.prepare('SELECT status,version FROM assets').get()},{status:'aktif',version:1});
  assert.equal((await get(api,OPS,'?durum=constructor')).status,200);
  assert.equal((await post(api,OPS,{action:'update',code:'BIO-0001',version:1,change:'status',status:'bakimda'})).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM assets').get().status,'bakimda');
});

const DENY_AUDIT="CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test audit failure'); END";
const auditCount=(sqlite,code)=>sqlite.prepare('SELECT count(*) n FROM audit_logs WHERE resource=?').get(code).n;

await test('denetim yazılamazsa varlık kaydı ve güncellemesi iz bırakmaz',async()=>{
  const {sqlite,api}=await setup();
  const input={action:'create',kind:'biyomedikal',name:'Kurgusal cihaz',unitCode:'BMD'};
  sqlite.exec(DENY_AUDIT);
  assert.ok((await post(api,OPS,input)).status>=400);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM assets').get().n,0,'denetimsiz varlık kaydı kalmaz');
  sqlite.exec('DROP TRIGGER test_audit_failure');
  assert.equal((await post(api,OPS,input)).status,200);
  sqlite.exec(DENY_AUDIT);
  for(const body of [{change:'status',status:'hurda'},{change:'maintained'},{change:'calibrated'}]){
    assert.ok((await post(api,OPS,{action:'update',code:'BIO-0001',version:1,...body})).status>=400,body.change);
  }
  assert.deepEqual({...sqlite.prepare('SELECT status,version,last_maintenance_at m,last_calibration_at c FROM assets').get()},{status:'aktif',version:1,m:null,c:null});
  sqlite.exec('DROP TRIGGER test_audit_failure');
  assert.equal(auditCount(sqlite,'BIO-0001'),1);
  assert.equal((await post(api,OPS,{action:'update',code:'BIO-0001',version:1,change:'status',status:'bakimda'})).status,200);
  assert.equal(auditCount(sqlite,'BIO-0001'),2);
});

await test('denetim yazılamazsa zimmet onayı ve iadesi iz bırakmaz',async()=>{
  const {sqlite,api}=await setup();
  await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Kurgusal cihaz',unitCode:'BMD'});
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:PER})).status,200);
  const custody=()=>({...sqlite.prepare('SELECT accepted_at,receipt,returned_at,returned_by FROM asset_custody').get()});
  const before=auditCount(sqlite,'BIO-0001');
  sqlite.exec(DENY_AUDIT);
  assert.ok((await post(api,PER,{action:'custody.accept',code:'BIO-0001'})).status>=400);
  assert.deepEqual(custody(),{accepted_at:null,receipt:null,returned_at:null,returned_by:null},'onay kaydı kalmaz');
  sqlite.exec('DROP TRIGGER test_audit_failure');
  assert.equal(auditCount(sqlite,'BIO-0001'),before);
  assert.equal((await post(api,PER,{action:'custody.accept',code:'BIO-0001'})).status,200);
  const accepted=custody();assert.ok(accepted.accepted_at&&accepted.receipt);
  sqlite.exec(DENY_AUDIT);
  assert.ok((await post(api,PER,{action:'custody.return',code:'BIO-0001'})).status>=400);
  assert.deepEqual(custody(),accepted,'iade kaydı kalmaz');
  sqlite.exec('DROP TRIGGER test_audit_failure');
  assert.equal(auditCount(sqlite,'BIO-0001'),before+1);
  assert.equal((await post(api,PER,{action:'custody.return',code:'BIO-0001'})).status,200);
  assert.ok(custody().returned_at);
  assert.deepEqual(sqlite.prepare("SELECT action FROM audit_logs WHERE resource='BIO-0001' AND action LIKE 'asset.custody%' ORDER BY id").all().map(r=>r.action),
    ['asset.custody.assigned','asset.custody.accepted','asset.custody.returned']);
});

await test('eşzamanlı kayıtlar: kod ve denetim zinciri çakışması yeniden denenir, her kayıt tek denetim satırıyla yazılır',async()=>{
  const {sqlite,api}=await setup();
  const rs=await Promise.all([1,2,3,4].map(i=>post(api,OPS,{action:'create',kind:'teknik',name:`Kurgusal ekipman ${i}`,unitCode:'TKH'})));
  assert.deepEqual(rs.map(r=>r.status),[200,200,200,200]);
  assert.deepEqual(rs.map(r=>r.body.result.code).sort(),['TEK-0001','TEK-0002','TEK-0003','TEK-0004']);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM audit_logs WHERE action='asset.created'").get().n,4);
  const chain=sqlite.prepare('SELECT previous_hash p,current_hash c FROM audit_logs ORDER BY id').all();
  for(let i=1;i<chain.length;i++)assert.equal(chain[i].p,chain[i-1].c,'zincir kopmaz');
});

await test('denetim yazılamazsa zimmet verme iz bırakmaz: zimmet satırı ve bildirim kalmaz',async()=>{
  const {sqlite,api}=await setup();
  await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Kurgusal cihaz',unitCode:'BMD'});
  const before=auditCount(sqlite,'BIO-0001');
  const notes=()=>sqlite.prepare("SELECT count(*) n FROM staff_notifications WHERE email=? AND path='/varliklar?kod=BIO-0001'").get(PER).n;
  sqlite.exec(DENY_AUDIT);
  assert.ok((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:PER})).status>=400);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM asset_custody').get().n,0,'denetimsiz zimmet kalmaz');
  assert.equal(notes(),0,'bildirim de geri alınır');
  sqlite.exec('DROP TRIGGER test_audit_failure');
  assert.equal(auditCount(sqlite,'BIO-0001'),before);
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:PER})).status,200,'açık zimmet kalmadığı için yeniden verilebilir');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM asset_custody').get().n,1);
  assert.equal(notes(),1);
  assert.equal(auditCount(sqlite,'BIO-0001'),before+1);
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:PER})).status,409,'tek açık zimmet');
  assert.equal(auditCount(sqlite,'BIO-0001'),before+1,'reddedilen zimmet denetime yazılmaz');
});
