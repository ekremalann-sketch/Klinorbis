import assert from "node:assert/strict";
import test from "node:test";
import {browserJson,createD1,loadRoute,setRuntime} from "./helpers/route-harness.mjs";
const OWNER="ops@klinorbis.test";
const {d1,sqlite}=await createD1();setRuntime(d1,{ownerEmail:OWNER});
const route=await loadRoute("app/api/automation/heartbeat/route.ts");
const agent=await loadRoute("lib/agent-runtime.ts"), database=await loadRoute("db/index.ts");
const beat=(email=OWNER)=>route.POST(browserJson("/api/automation/heartbeat",{},email));
const expire=()=>{sqlite.prepare("DELETE FROM rate_limit_counters").run();sqlite.prepare("UPDATE integration_events SET received_at=received_at-600000 WHERE source IN ('klinorbis-agent','agent-lock')").run();};
const cycles=()=>sqlite.prepare("SELECT COUNT(*) n FROM integration_events WHERE source='klinorbis-agent'").get().n;
await test("nabız: kimliksiz ve salt denetim rolü otomasyon çalıştıramaz",async()=>{
 assert.equal((await route.POST(browserJson('/api/automation/heartbeat',{}))).status,401);
 for(const role of ['privacy_officer','security_officer']){
  sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)").run(role+'@test.local',role,role,Date.now());
  assert.equal((await beat(role+'@test.local')).status,403);
 }
});
await test("eşzamanlı paneller ve zamanlayıcı ortak kilitle tek döngü çalıştırır",async()=>{
 expire();const n=cycles();
 const [x,y,z]=await Promise.all([beat(),beat(),agent.runAutomationAgent(database.getDb(),'scheduler-test')]);
 const results=[await x.json(),await y.json(),z];assert.equal(results.filter(r=>r.ran).length,1);assert.equal(cycles(),n+1);
});
await test("zaman dilimi değişse bile 25 saniye sonra ikinci döngü başlamaz",async()=>{
 expire();const RealDate=Date;let clock=Math.floor(RealDate.now()/30000)*30000+20000;
 globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 try{const a=await(await beat()).json();assert.equal(a.ran,true);clock+=25000;const b=await(await beat()).json();assert.equal(b.ran,false);clock+=6000;assert.equal((await(await beat()).json()).ran,true);}finally{globalThis.Date=RealDate;}
});
await test("30 saniyeden uzun çalışan döngü bitmeden başka döngü başlayamaz",async()=>{
 expire();sqlite.prepare("UPDATE integration_events SET status='running',received_at=? WHERE event_id='agent:lease'").run(Date.now()-40000);
 const n=cycles();assert.equal((await(await beat()).json()).ran,false);assert.equal(cycles(),n);
});
await test("yanıt zamanı değişince içerik aynı, iş ve kimlik değişince içerik farklıdır",async()=>{
 const {workspaceContentKey}=await loadRoute('lib/workspace-content.ts');
 const a={generatedAt:'one',identity:{email:'a'},reports:[{generatedAt:'one',available:3}],tasks:[{status:'queued'}],automation:{ageSeconds:1}};
 const b={...a,generatedAt:'two',reports:[{generatedAt:'two',available:3}],automation:{ageSeconds:5}};
 assert.equal(workspaceContentKey(a),workspaceContentKey(b));assert.notEqual(workspaceContentKey(a),workspaceContentKey({...b,tasks:[{status:'done'}]}));assert.notEqual(workspaceContentKey(a),workspaceContentKey({...b,identity:{email:'b'}}));
});
