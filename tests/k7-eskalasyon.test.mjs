// K7: kural tablosu + eskalasyon (kişi → lider → yönetim); aynı yatak için tek bildirim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1,loadRoute,setRuntime,browserJson} from './helpers/route-harness.mjs';

const esc=await loadRoute('lib/coord-escalation.ts');
const M=60_000;

test('kural tablosu: hedef ve seviye hesabı',()=>{
  const now=Date.UTC(2026,10,12,12);
  const q=(min)=>esc.overdueMinutes({kind:'cleaning',status:'queued',created_at:now-min*M,updated_at:now-min*M},now);
  assert.equal(q(14),-1);assert.equal(q(15),0);
  assert.deepEqual([-1,0,14,15,29,30,200].map(esc.levelFor),[0,1,1,2,2,3,3]);
  assert.equal(esc.overdueMinutes({kind:'transport',status:'active',created_at:0,updated_at:now-31*M},now),1);
  assert.equal(esc.overdueMinutes({kind:'cleaning',status:'done',created_at:0,updated_at:0},now),null);
});

await test('hedefi aşan iş doğru kişiye gider; aynı yatağın iki işi tek bildirim; tekrar çalıştırmada çift bildirim yok',async()=>{
  const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',CLEAN='clean@klinorbis.test',LEAD='lead@klinorbis.test',now=Date.now();
  setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
  for(const [e,role,unit] of [[CLEAN,'call_agent','CTM'],[LEAD,'unit_manager','CTM']]){sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(e,e,role,now);sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,?,'Test',1,0,1)").run(e,unit);}
  const api=await loadRoute('app/api/hospital-coordination/route.ts');
  const r=browserJson('/api/hospital-coordination',{action:'init'},OPS);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');assert.equal((await api.POST(r)).status,200);
  const ins=sqlite.prepare("INSERT INTO simops_jobs(tenant,id,kind,bed,target,unit,status,owner,authority,created_at,updated_at) VALUES('SIM-KURUM-A',?,?,?,?,?,?,?,'YTKL-SIM-001',?,?)");
  // YTK-SIM-002: temizlik 20 dk kabul bekliyor (seviye 1) + taşıma 7 dk kabul bekliyor (seviye 1) → tek bildirim.
  ins.run('J1','cleaning','YTK-SIM-002',null,'CTM','queued',null,now-20*M,now-20*M);
  ins.run('J2','transport','YTK-SIM-002','YTK-SIM-003','CTM','queued',null,now-7*M,now-7*M);
  // YTK-SIM-005: temizlikçi işi 70 dk önce aldı, bitirmedi → 25 dk gecikme → seviye 2 (lider).
  ins.run('J3','cleaning','YTK-SIM-005',null,'CTM','active',CLEAN,now-80*M,now-70*M);
  const {getDb}=await loadRoute('db/index.ts');
  const out=await esc.escalateCoordJobs(getDb(),now);
  assert.equal(out.notified,2);
  const notes=sqlite.prepare("SELECT email,title,detail FROM staff_notifications WHERE kind='escalation' ORDER BY email,title").all();
  const bed2=notes.filter(n=>n.title.startsWith('YTK-SIM-002'));
  assert.ok(bed2.length>=1);assert.ok(bed2.every(n=>/2 iş gecikti \((Temizlik, Taşıma|Taşıma, Temizlik)\)/.test(n.title)),'aynı yatak tek bildirimde');
  assert.equal(new Set(bed2.map(n=>n.email)).size,bed2.length,'kişi başına tek bildirim');
  const bed5=notes.filter(n=>n.title.startsWith('YTK-SIM-005'));
  assert.deepEqual(bed5.map(n=>n.email),[LEAD],'seviye 2: ekip lideri');
  assert.match(bed5[0].detail,/Ekip lideri düzeyi/);
  assert.equal((await esc.escalateCoordJobs(getDb(),now)).notified,0,'aynı seviyede ikinci bildirim yok');
  // 40 dk sonra J3 yönetime çıkar.
  assert.equal((await esc.escalateCoordJobs(getDb(),now+20*M)).notified>=1,true);
  assert.ok(sqlite.prepare("SELECT count(*) n FROM staff_notifications WHERE email=? AND title LIKE 'YTK-SIM-005%'").get(OPS).n>=1,'seviye 3: yönetim');
  sqlite.close();
});
