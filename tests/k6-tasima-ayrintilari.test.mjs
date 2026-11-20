// Çözüm Mimarı K6: taşıma şekli, izolasyon, planlı/acil, "hasta alındı" zamanı, gecikmede neden zorunlu.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson} from './helpers/route-harness.mjs';

const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test';setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
const api=await loadRoute('app/api/hospital-coordination/route.ts');
const post=body=>{const r=browserJson('/api/hospital-coordination',body,OPS);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
const job=id=>sqlite.prepare("SELECT * FROM simops_jobs WHERE tenant='SIM-KURUM-A' AND id=?").get(id);
const step=(id,transition,confirmation)=>post({action:'transition',id,version:job(id).version,transition,confirmation});
const ready=id=>sqlite.prepare("UPDATE simops_beds SET physical='departed',hbys='vacant',cleaning='ready',technical=1,staffed=1,review=0,observed_at=? WHERE tenant='SIM-KURUM-A' AND id=?").run(Date.now(),id);
const occupied=id=>sqlite.prepare("UPDATE simops_beds SET physical='occupied',review=0 WHERE tenant='SIM-KURUM-A' AND id=?").run(id);
const base={action:'transport',authority:'YTKL-SIM-002',decidedAt:Date.now()};
const OK={twoIdentifiersVerified:true,receiverConfirmed:true,receiver:'PRS-SIM-009'};

await test('taşıma şekli zorunlu; acil ve izolasyon kaydedilir; "Hasta alındı" zamanı yazılır',async()=>{
  assert.equal((await post({action:'init'})).status,200);
  sqlite.prepare("INSERT OR IGNORE INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES('SIM-KURUM-A',?,'ULS',?,?,1)").run(OPS,Date.now()-1000,Date.now()+3600000);
  occupied('YTK-SIM-002');ready('YTK-SIM-001');
  assert.equal((await post({...base,bed:'YTK-SIM-002',target:'YTK-SIM-001',patient:'HST-SIM-011'})).status,422,'şekil seçilmeden kayıt yok');
  assert.equal((await post({...base,bed:'YTK-SIM-002',target:'YTK-SIM-001',patient:'HST-SIM-011',mode:'roket'})).status,422);
  const r=await post({...base,bed:'YTK-SIM-002',target:'YTK-SIM-001',patient:'HST-SIM-011',mode:'sedye',urgency:'acil',isolation:true});assert.equal(r.status,200);
  const id=(await r.json()).id;const j=job(id);
  assert.equal(j.transport_mode,'sedye');assert.equal(j.urgency,'acil');assert.equal(j.isolation,1);
  assert.equal((await step(id,'accept')).status,200);assert.equal((await step(id,'start')).status,200);
  assert.ok(job(id).picked_at,'hasta alındı zamanı');
  // Hedef süre aşılmış gibi: oluşturma 40 dk önce → gecikme nedeni zorunlu.
  sqlite.prepare("UPDATE simops_jobs SET created_at=? WHERE id=?").run(Date.now()-40*60000,id);
  let d=await step(id,'deliver',{target:'YTK-SIM-001',...OK});assert.equal(d.status,422);assert.match((await d.json()).error,/gecikme nedenini/);
  assert.equal((await step(id,'deliver',{target:'YTK-SIM-001',...OK,delayReason:'uydurma'})).status,422);
  d=await step(id,'deliver',{target:'YTK-SIM-001',...OK,delayReason:'asansor'});assert.equal(d.status,200);
  assert.equal(job(id).delay_reason,'asansor');
});

test('ekranda taşıma şekli, acil/izolasyon etiketleri, "Hasta alındı" ve gecikme nedeni; klinik dil yok',async()=>{
  const src=await readFile('app/hbys/coordination.tsx','utf8');
  assert.match(src,/Taşıma şekli<select/);assert.match(src,/İzolasyon önlemi gerekli/);assert.match(src,/'Hasta alındı'/);assert.match(src,/Gecikme nedeni/);
  assert.doesNotMatch(await readFile('lib/coord-rules.ts','utf8'),/triyaj|erken uyarı|klinik öneri/i);
  assert.doesNotMatch(await readFile('drizzle/0020_tasima_ayrintilari.sql','utf8'),/DROP|DELETE/i);
});
