// K6: "Hasta ayrıldı" → otomatik temizlik işi → kontrol → hazır. Gizli menü yok; hazır yatak zamanla düşmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',NURSE='nurse@klinorbis.test',CLEAN='clean@klinorbis.test',CHECK='check@klinorbis.test',STRANGER='stranger@klinorbis.test';
setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
const now=Date.now();
for(const [email,role,unit] of [[NURSE,'unit_manager','YTK'],[CLEAN,'call_agent','CTM'],[CHECK,'unit_manager','CTM'],[STRANGER,'unit_manager','ACY']]){
  sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(email,email,role,now);
  sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,?,'Test',1,0,1)").run(email,unit);
}
const api=await loadRoute('app/api/hospital-coordination/route.ts');const lib=await loadRoute('lib/hospital-coordination.ts');
const post=(body,email=OPS)=>{const r=browserJson('/api/hospital-coordination',body,email);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
const bed=id=>sqlite.prepare("SELECT * FROM simops_beds WHERE tenant='SIM-KURUM-A' AND id=?").get(id);
const job=id=>sqlite.prepare("SELECT * FROM simops_jobs WHERE tenant='SIM-KURUM-A' AND id=?").get(id);
const step=(id,action,email)=>post({action:'transition',id,version:job(id).version,transition:action},email);

await test('kurulum',async()=>{
  assert.equal((await post({action:'init'})).status,200);
  for(const e of [NURSE,CLEAN,CHECK,STRANGER]){sqlite.prepare('INSERT INTO simops_members(tenant,email) VALUES(?,?)').run('SIM-KURUM-A',e);sqlite.prepare('INSERT INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES(?,?,?,?,?,1)').run('SIM-KURUM-A',e,'CTM',now-3600000,now+36000000);}
});

let cleaning;
await test('zincir iki kullanıcıyla baştan sona: Hasta ayrıldı → temizlik → kontrol → hazır',async()=>{
  const b=bed('YTK-SIM-002');assert.equal(b.physical,'occupied');
  assert.equal((await post({action:'departed',id:b.id,version:b.version},STRANGER)).status,403,'başka birim kullanamaz');
  assert.equal((await post({action:'departed',id:b.id,version:b.version-1},NURSE)).status,409,'eski sürüm reddedilir');
  const r=await post({action:'departed',id:b.id,version:b.version},NURSE);assert.equal(r.status,200);
  cleaning=(await r.json()).task;assert.ok(cleaning);
  assert.equal(bed('YTK-SIM-002').physical,'departed');assert.equal(bed('YTK-SIM-002').cleaning,'queued');
  assert.equal((await post({action:'departed',id:'YTK-SIM-002',version:bed('YTK-SIM-002').version},NURSE)).status,409,'boş yatakta ikinci kez basılamaz');
  for(const a of ['accept','start','complete'])assert.equal((await step(cleaning,a,CLEAN)).status,200,a);
  assert.equal(lib.bedReady(bed('YTK-SIM-002')),false,'kontrol olmadan hazır değil');
  assert.equal((await step(cleaning,'inspect',CHECK)).status,200);
  assert.equal(lib.bedReady(bed('YTK-SIM-002')),true);
});

await test('hazır yatak 15 dakika sonra kendiliğinden düşmez',async()=>{
  sqlite.prepare("UPDATE simops_beds SET observed_at=? WHERE tenant='SIM-KURUM-A' AND id='YTK-SIM-002'").run(Date.now()-3*3600000);
  assert.equal(lib.bedReady(bed('YTK-SIM-002')),true);
  const view=await (await api.GET(new Request(ORIGIN+'/api/hospital-coordination',{headers:{'oai-authenticated-user-email':OPS,'x-klinorbis-sim-tenant':'SIM-KURUM-A'}}))).json();
  const row=view.beds.find(x=>x.id==='YTK-SIM-002');assert.equal(row.ready,true);assert.equal(row.stale,false);
});

await test('panoda dolu yatakta "Hasta ayrıldı" düğmesi var (gizli menü değil)',async()=>{
  const src=await readFile(new URL('../app/hbys/coordination.tsx',import.meta.url),'utf8');
  const board=src.slice(src.indexOf('function BedBoard'));
  assert.match(board,/bs\.key==='dolu'&&<button className="primary"/);
  assert.match(board,/action:'departed',id:b\.id,version:b\.version/);
  assert.match(board,/>Hasta ayrıldı</);
});
