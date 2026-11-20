// K4: temizlik ve taşıma için telefonda tek düğmeli iş ekranı; QR ile yatak; 3 dokunuşla bitir.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const pj=await loadRoute('lib/phone-jobs.ts');
const J=(id,o)=>({id,kind:'cleaning',bed:'YTK-SIM-001',target:null,status:'queued',owner:null,version:1,created_at:1,...o});

test('liste: QR ile okutulan yatak en üstte, sonra kendi işlerim; başkasının işi görünmez',()=>{
  const jobs=[J('a',{bed:'YTK-SIM-003',created_at:1}),J('b',{bed:'YTK-SIM-002',status:'active',owner:'me'}),J('c',{bed:'YTK-SIM-005',status:'active',owner:'other'}),J('d',{bed:'YTK-SIM-007',created_at:2}),J('t',{kind:'transport'})];
  assert.deepEqual(pj.phoneJobs(jobs,'me','cleaning','YTK-SIM-007').map(j=>j.id),['d','b','a']);
  assert.deepEqual(pj.phoneJobs(jobs,'me','transport').map(j=>j.id),['t']);
});

test('tek düğme: İşi al → Başla → Bitir; kontrolü işi yapandan farklı yetkili yapar',()=>{
  assert.equal(pj.phoneStep(J('x'),'me').label,'İşi al');
  assert.equal(pj.phoneStep(J('x',{status:'accepted',owner:'me'}),'me').label,'Başla');
  assert.equal(pj.phoneStep(J('x',{status:'active',owner:'me'}),'me').label,'Bitir');
  assert.equal(pj.phoneStep(J('x',{status:'active',owner:'other'}),'me'),null);
  assert.equal(pj.phoneStep(J('x',{status:'check',owner:'me'}),'me',true),null,'kendi temizliğini kontrol edemez');
  assert.equal(pj.phoneStep(J('x',{status:'check',owner:'other'}),'me',true).action,'inspect');
  assert.deepEqual(pj.phoneStep(J('x',{kind:'transport',status:'active',owner:'me'}),'me'),{action:'deliver',label:'Teslim ettim',needsDelivery:true});
});

await test('sunucuda 3 dokunuş: temizlik personeli QR yatağındaki işi telefonda bitirir',async()=>{
  const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',CLEAN='clean@klinorbis.test',now=Date.now();
  setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
  sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)").run(CLEAN,'Temizlik','call_agent',now);
  sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,'CTM','Temizlik personeli',1,0,1)").run(CLEAN);
  const api=await loadRoute('app/api/hospital-coordination/route.ts');
  const post=(body,email=OPS)=>{const r=browserJson('/api/hospital-coordination',body,email);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
  const view=async(email)=>(await api.GET(new Request(ORIGIN+'/api/hospital-coordination',{headers:{'oai-authenticated-user-email':email,'x-klinorbis-sim-tenant':'SIM-KURUM-A'}}))).json();
  try{
    assert.equal((await post({action:'init'})).status,200);
    sqlite.prepare("INSERT INTO simops_members(tenant,email) VALUES('SIM-KURUM-A',?)").run(CLEAN);
    sqlite.prepare("INSERT INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES('SIM-KURUM-A',?,'CTM',?,?,1)").run(CLEAN,now-3600000,now+36000000);
    const b=sqlite.prepare("SELECT version FROM simops_beds WHERE tenant='SIM-KURUM-A' AND id='YTK-SIM-002'").get();
    assert.equal((await post({action:'departed',id:'YTK-SIM-002',version:b.version})).status,200);
    let taps=0;
    for(;;){
      const v=await view(CLEAN);assert.equal(v.me,CLEAN);
      const [job]=pj.phoneJobs(v.jobs,v.me,'cleaning','YTK-SIM-002',v.canInspect);
      const step=pj.phoneStep(job,v.me,v.canInspect);if(!step)break;
      assert.equal((await post({action:'transition',id:job.id,version:job.version,transition:step.action},CLEAN)).status,200);taps++;
      if(taps>5)break;
    }
    assert.equal(taps,3);
    assert.equal(sqlite.prepare("SELECT cleaning FROM simops_beds WHERE tenant='SIM-KURUM-A' AND id='YTK-SIM-002'").get().cleaning,'check');
  }finally{sqlite.close();}
});

test('ekranlar: /temizlik ve /tasima telefon görünümü; menüdeki Taşıma işlerim /tasima',async()=>{
  assert.match(await readFile('app/temizlik/page.tsx','utf8'),/<PhoneWork kind="cleaning"/);
  assert.match(await readFile('app/tasima/page.tsx','utf8'),/<PhoneWork kind="transport"/);
  assert.match(await readFile('lib/b-menu.ts','utf8'),/label: "Taşıma işlerim", href: "\/tasima"/);
  const ui=await readFile('app/temizlik/phone-work.tsx','utf8');
  assert.match(ui,/get\('yatak'\)/);
  assert.match(ui,/min-height:56px/);
});
