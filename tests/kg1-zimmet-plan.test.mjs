// KG1 (adım 2): zimmet imzası ve bakım/kalibrasyon planından otomatik iş.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const lib=await loadRoute('lib/assets.ts');
const OPS='ops@klinorbis.test',BMD='bmd@klinorbis.test',TKH='tkh@klinorbis.test',HEM='hemsire@klinorbis.test',BAS='baska@klinorbis.test',TEK='teknisyen@klinorbis.test';
async function setup(){
  const {d1,sqlite}=await createD1();const now=Date.now();
  setRuntime(d1,{demoEnabled:'0'});
  const add=(email,role,unit,active=1)=>{sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,?,?)').run(email,email,role,active,now);
    if(unit)sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,?,'Test',1,0,1)").run(email,unit);};
  add(OPS,'operations_manager');add(BMD,'unit_manager','BMD');add(TKH,'unit_manager','TKH');add(HEM,'clinician','KRD');add(BAS,'call_agent','CAG');add(TEK,'call_agent','BMD');
  add('pasif@klinorbis.test','call_agent','KRD',0);
  return {sqlite,api:await loadRoute('app/api/assets/route.ts')};
}
const post=async(api,email,body)=>{const r=await api.POST(browserJson('/api/assets',body,email));return {status:r.status,body:await r.json()};};
const get=async(api,email,q='')=>(await (await api.GET(new Request(`${ORIGIN}/api/assets${q}`,{headers:{'oai-authenticated-user-email':email}}))).json());

await test('zimmet: yönetici verir, yalnız zimmetli kişi kendi oturumuyla onaylar; makbuz ve denetim kaydı',async()=>{
  const {sqlite,api}=await setup();
  await post(api,BMD,{action:'create',kind:'biyomedikal',name:'Taşınabilir monitör',unitCode:'BMD'});
  assert.equal((await post(api,TEK,{action:'custody.assign',code:'BIO-0001',email:HEM})).status,403,'personel zimmet veremez');
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:'pasif@klinorbis.test'})).status,400,'pasif hesaba zimmet yok');
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:HEM})).status,200);
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:BAS})).status,409,'tek açık zimmet');
  const n=sqlite.prepare("SELECT path FROM staff_notifications WHERE email=?").get(HEM);assert.equal(n.path,'/varliklar?kod=BIO-0001');
  // Başka birimden zimmetli kişi varlığı görür; zimmetli olmayan göremez.
  assert.equal((await get(api,HEM)).assets[0].custody.mine,true);
  assert.equal((await get(api,BAS)).assets.length,0);
  assert.equal((await post(api,BAS,{action:'custody.accept',code:'BIO-0001'})).status,404,'başkası onaylayamaz');
  assert.equal((await post(api,BMD,{action:'custody.accept',code:'BIO-0001'})).status,403,'yönetici kişi adına onaylayamaz');
  const ok=await post(api,HEM,{action:'custody.accept',code:'BIO-0001'});assert.equal(ok.status,200);assert.match(ok.body.result.receipt,/^[0-9A-F]{16}$/);
  assert.equal((await post(api,HEM,{action:'custody.accept',code:'BIO-0001'})).status,409);
  assert.equal((await post(api,BAS,{action:'custody.return',code:'BIO-0001'})).status,404);
  assert.equal((await post(api,HEM,{action:'custody.return',code:'BIO-0001'})).status,200);
  assert.equal((await get(api,HEM)).assets.length,0,'iade sonrası görünmez');
  assert.equal((await post(api,BMD,{action:'custody.assign',code:'BIO-0001',email:BAS})).status,200,'iade sonrası yeni zimmet');
  assert.deepEqual(sqlite.prepare("SELECT action FROM audit_logs WHERE resource='BIO-0001' AND action LIKE 'asset.custody%' ORDER BY id").all().map(r=>r.action),
    ['asset.custody.assigned','asset.custody.accepted','asset.custody.returned','asset.custody.assigned']);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM asset_custody').get().n,2,'zimmet geçmişi silinmez');
});

await test('plan: vadeye 7 gün kala doğru birime tek iş; yapıldı denince yeni vade; plansız ve hurda iş üretmez',async()=>{
  const {sqlite,api}=await setup();const D=86400000,now=Date.now();
  await post(api,OPS,{action:'create',kind:'biyomedikal',name:'Defibrilatör',unitCode:'BMD',maintenanceIntervalDays:180,calibrationIntervalDays:365});
  await post(api,OPS,{action:'create',kind:'teknik',name:'Jeneratör',unitCode:'TKH',maintenanceIntervalDays:30});
  await post(api,OPS,{action:'create',kind:'teknik',name:'Sandalye',unitCode:'TKH'});
  await post(api,OPS,{action:'create',kind:'teknik',name:'Eski kompresör',unitCode:'TKH',maintenanceIntervalDays:30});
  sqlite.prepare("UPDATE assets SET status='hurda' WHERE code='TEK-0003'").run();
  sqlite.prepare("UPDATE assets SET last_maintenance_at=?,last_calibration_at=? WHERE code='BIO-0001'").run(now-100*D,now-360*D);
  assert.deepEqual(await lib.openDuePlanJobs(now),{opened:2},'kalibrasyon (5 gün kaldı) + jeneratör (kaydı yok); bakım 80 gün sonra');
  assert.deepEqual(await lib.openDuePlanJobs(now),{opened:0},'aynı vade için ikinci iş yok');
  const runs=sqlite.prepare('SELECT playbook_code,trigger_event FROM playbook_runs WHERE trigger_event LIKE ? ORDER BY trigger_event').all('asset:%');
  assert.deepEqual(runs.map(r=>r.playbook_code).sort(),['planli-bakim-teknik','planli-kalibrasyon']);
  assert.ok(sqlite.prepare("SELECT count(*) n FROM staff_notifications WHERE email=?").get(BMD).n>=1,'BMD birimine bildirim');
  // Kalibrasyon yapıldı → yeni vade bir yıl sonra; yeni iş açılmaz. Jeneratör bakımı yapıldı → 30 gün sonra, 7 gün kala yeniden.
  await post(api,BMD,{action:'update',code:'BIO-0001',version:1,change:'calibrated'});
  await post(api,TKH,{action:'update',code:'TEK-0001',version:1,change:'maintained'});
  assert.deepEqual(await lib.openDuePlanJobs(Date.now()),{opened:0});
  assert.deepEqual(await lib.openDuePlanJobs(Date.now()+24*D),{opened:1},'yeni vadeye 7 gün kala yeni iş');
});
