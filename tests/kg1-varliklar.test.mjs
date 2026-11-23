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
