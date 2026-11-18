// K9: yatış kararı girilince 2 saat sayacı başlar; 90. dk uyarı, 120. dk aşım. Acilde 8 saat sayacı (6. saatte uyarı).
// Dayanak: Acil Servis Hizmetleri Uygulama Usul ve Esasları Tebliği md. 11/3 (8 saat) ve 11/4 (2 saat).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const t=await loadRoute('lib/admission-timers.ts');
const M=60_000;

test('2 saat sayacı: 89 dk normal, 90 dk uyarı, 120 dk aşım; yerleşince durur',()=>{
  const now=Date.UTC(2026,10,12,12);
  const at=(min,arr=min+30)=>t.admissionTimer({arrived_at:now-arr*M,decided_at:now-min*M},now);
  assert.equal(at(89).decisionLevel,'normal');assert.equal(at(90).decisionLevel,'uyari');assert.equal(at(120).decisionLevel,'asim');
  const placed=t.admissionTimer({arrived_at:now-200*M,decided_at:now-150*M,placed_at:now-100*M},now);
  assert.equal(placed.decisionMinutes,50);assert.equal(placed.decisionLevel,'normal');
});

test('8 saat sayacı: 6. saatte uyarı, 8. saatte aşım',()=>{
  const now=Date.UTC(2026,10,12,12);
  const er=(min)=>t.admissionTimer({arrived_at:now-min*M,decided_at:now-10*M},now).erLevel;
  assert.deepEqual([er(359),er(360),er(479),er(480)],['normal','uyari','uyari','asim']);
  assert.equal(t.minutesText(135),'2 sa 15 dk');assert.equal(t.minutesText(45),'45 dk');
});

await test('sunucu: yatış zamanı kaydı, kurgusal kod zorunlu, tekrar yok, yerleşme sayacı durdurur',async()=>{
  const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',PRIV='kvkk@klinorbis.test';setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
  sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)").run(PRIV,'KVKK','privacy_officer',Date.now());
  const api=await loadRoute('app/api/hospital-coordination/route.ts');
  const post=(body,email=OPS)=>{const r=browserJson('/api/hospital-coordination',body,email);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
  try{
    assert.equal((await post({action:'init'})).status,200);
    sqlite.prepare("INSERT INTO simops_members(tenant,email) VALUES('SIM-KURUM-A',?)").run(PRIV);
    const now=Date.now();
    assert.equal((await post({action:'admission',patient:'Ali Veli',targetUnit:'DAH',arrivedAt:now-60*M,decidedAt:now-30*M})).status,422);
    assert.equal((await post({action:'admission',patient:'HST-SIM-001',targetUnit:'DAH',arrivedAt:now-10*M,decidedAt:now-30*M})).status,422,'geliş karardan sonra olamaz');
    assert.equal((await post({action:'admission',patient:'HST-SIM-001',targetUnit:'DAH',arrivedAt:now-200*M,decidedAt:now-95*M},PRIV)).status,403,'gözetim rolü yazamaz');
    const r=await post({action:'admission',patient:'HST-SIM-001',targetUnit:'DAH',arrivedAt:now-200*M,decidedAt:now-95*M});assert.equal(r.status,200);
    assert.equal((await post({action:'admission',patient:'HST-SIM-001',targetUnit:'DAH',arrivedAt:now-200*M,decidedAt:now-95*M})).status,409);
    const view=await (await api.GET(new Request(ORIGIN+'/api/hospital-coordination',{headers:{'oai-authenticated-user-email':OPS,'x-klinorbis-sim-tenant':'SIM-KURUM-A'}}))).json();
    const a=view.admissions[0];assert.equal(t.admissionTimer(a,Date.now()).decisionLevel,'uyari');
    assert.equal((await post({action:'admission-placed',id:a.id,version:a.version})).status,200);
    assert.ok(sqlite.prepare('SELECT placed_at FROM simops_admissions WHERE id=?').get(a.id).placed_at);
    assert.notEqual((await post({action:'admission-placed',id:a.id,version:a.version})).status,200,'ikinci kez yerleştirilemez');
  }finally{sqlite.close();}
});

test('panoda "Yatış bekleyenler" ve iki sayaç; klinik içerik alanı yok',async()=>{
  const src=await readFile('app/hbys/coordination.tsx','utf8');
  assert.match(src,/<AdmissionTimers list=\{data\.admissions\?\?\[\]\}/);
  assert.match(src,/\/ 2 sa ·/);assert.match(src,/\/ 8 sa ·/);
  assert.match(await readFile('drizzle/0017_yatis_sayaclari.sql','utf8'),/`decided_at` integer NOT NULL/);
  assert.doesNotMatch(await readFile('drizzle/0017_yatis_sayaclari.sql','utf8'),/diagnos|tani|reason/i);
});
