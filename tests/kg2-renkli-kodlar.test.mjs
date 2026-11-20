// KG2: renkli kodlar. Çağrı her personele açık; ilerletme yalnız ekip; sıra atlanmaz; süreler ve tatbikat ayrımı kayıtlı.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const OPS='ops@klinorbis.test',GVN='guvenlik@klinorbis.test',GVM='guvenlik-sef@klinorbis.test',ACY='acil@klinorbis.test',PER='per@klinorbis.test',KVK='kvkk@klinorbis.test';
async function setup(){
  const {d1,sqlite}=await createD1();const now=Date.now();
  setRuntime(d1,{demoEnabled:'0'});
  const add=(email,role,unit)=>{sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(email,email,role,now);
    if(unit)sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,?,'Test',1,0,1)").run(email,unit);};
  add(OPS,'operations_manager');add(GVN,'call_agent','GVN');add(GVM,'unit_manager','GVN');add(ACY,'clinician','ACY');add(PER,'call_agent','KRD');add(KVK,'privacy_officer');
  return {sqlite,api:await loadRoute('app/api/codes/route.ts')};
}
const post=async(api,email,body)=>{const r=await api.POST(browserJson('/api/codes',body,email));return {status:r.status,body:await r.json()};};
const get=async(api,email)=>(await (await api.GET(new Request(`${ORIGIN}/api/codes`,{headers:{'oai-authenticated-user-email':email}}))).json());

await test('çağrı: her personel çağırır, ekip ve operasyon yöneticisi bildirim alır; çift dokunuş tek kayıt; gözetim rolü çağıramaz',async()=>{
  const {sqlite,api}=await setup();
  const r=await post(api,PER,{action:'call',color:'beyaz',location:'Kardiyoloji polikliniği bekleme'});
  assert.equal(r.status,200);assert.equal(r.body.result.notified,3,'GVN iki üye + operasyon yöneticisi');
  const to=sqlite.prepare("SELECT email FROM staff_notifications WHERE kind='code' ORDER BY email").all().map(x=>x.email);
  assert.deepEqual(to,[GVM,GVN,OPS].sort());assert.ok(!to.includes(ACY),'mavi ekibi beyaz kod bildirimi almaz');
  assert.equal((await post(api,PER,{action:'call',color:'beyaz',location:'Kardiyoloji polikliniği bekleme'})).body.result.duplicate,true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM emergency_codes').get().n,1);
  assert.equal((await post(api,KVK,{action:'call',color:'beyaz',location:'X yeri'})).status,403);
  assert.equal((await post(api,PER,{action:'call',color:'mor',location:'X yeri'})).status,400);
  assert.equal((await post(api,PER,{action:'call',color:'kirmizi',location:''})).status,400);
});

await test('ilerletme: yalnız ekip; onay → varış → kapanış sırası; ilk yapan kaydedilir; süreler hesaplanır',async()=>{
  const {sqlite,api}=await setup();
  const ref=(await post(api,PER,{action:'call',color:'mavi',location:'Dahiliye servisi oda 12'})).body.result.reference;
  assert.equal((await post(api,GVN,{action:'advance',reference:ref,step:'ack'})).status,403,'güvenlik mavi kodu ilerletemez');
  assert.equal((await post(api,PER,{action:'advance',reference:ref,step:'ack'})).status,403,'çağıran kişi ekip değil');
  assert.equal((await post(api,ACY,{action:'advance',reference:ref,step:'arrive'})).status,409,'onaysız varış yok');
  assert.equal((await get(api,ACY)).open[0].next,'ack');assert.equal((await get(api,PER)).open[0].next,null);
  assert.equal((await post(api,ACY,{action:'advance',reference:ref,step:'ack'})).status,200);
  assert.equal((await post(api,OPS,{action:'advance',reference:ref,step:'ack'})).status,409,'ikinci onay yok');
  assert.equal((await post(api,ACY,{action:'advance',reference:ref,step:'close'})).status,409,'varışsız kapanış yok');
  assert.equal((await post(api,ACY,{action:'advance',reference:ref,step:'arrive'})).status,200);
  assert.equal((await post(api,ACY,{action:'advance',reference:ref,step:'close',note:'Ekip ulaştı'})).status,200);
  const row=sqlite.prepare('SELECT * FROM emergency_codes WHERE reference=?').get(ref);
  assert.equal(row.acked_by,ACY);assert.ok(row.acked_at>=row.called_at&&row.arrived_at>=row.acked_at&&row.closed_at>=row.arrived_at);
  assert.equal((await get(api,OPS)).history[0].reference,ref);assert.equal((await get(api,PER)).history.length,0,'geçmiş yalnız yöneticide');
  assert.equal((await get(api,GVM)).history.length,0,'birim yöneticisi yalnız kendi ekibinin geçmişini görür');
  assert.deepEqual(sqlite.prepare("SELECT action FROM audit_logs WHERE resource=? ORDER BY id").all(ref).map(r=>r.action),['code.called','code.acked','code.arrived','code.closed']);
});

await test('tatbikat yalnız yönetici; bildirimde ve kayıtta ayrı işaretli',async()=>{
  const {sqlite,api}=await setup();
  assert.equal((await post(api,PER,{action:'call',color:'kirmizi',location:'B blok mutfak',drill:true})).status,403);
  const ref=(await post(api,GVM,{action:'call',color:'kirmizi',location:'B blok mutfak',drill:true})).body.result.reference;
  assert.equal(sqlite.prepare('SELECT drill FROM emergency_codes WHERE reference=?').get(ref).drill,1);
  assert.match(sqlite.prepare("SELECT title FROM staff_notifications WHERE kind='code' LIMIT 1").get().title,/^TATBİKAT · Kırmızı kod/);
  assert.equal((await get(api,PER)).open[0].drill,true);
});

test('ekran: tek ana düğme, mavi kod tıbbi yönlendirme yapmaz, giriş zorunlu',()=>{
  const ui=readFileSync('app/kodlar/codes.tsx','utf8'),lib=readFileSync('lib/color-codes.ts','utf8'),page=readFileSync('app/kodlar/page.tsx','utf8');
  assert.equal((ui.match(/className="main"/g)??[]).length,1);
  assert.match(ui,/tıbbi müdahaleye yön vermez/);
  assert.doesNotMatch(ui+lib,/triyaj|erken uyarı|klinik öneri|kompresyon|adrenalin|ilaç dozu/i);
  assert.match(page,/requireChatGPTUser\('\/kodlar'\)/);
});
