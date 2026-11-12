// K8: ekran kapalıyken telefon bildirimi (web push). İçerik push servisine gitmez; yalnız VAPID imzalı boş sinyal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,createPublicKey,verify} from 'node:crypto';
import {createD1,loadRoute,setRuntime,browserJson,ORIGIN} from './helpers/route-harness.mjs';

const wp=await loadRoute('lib/web-push.ts');
const FCM='https://fcm.googleapis.com/fcm/send/abc123';
const keys=()=>{const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const p=publicKey.export({format:'jwk'});
  return {vapidPublicKey:Buffer.concat([Buffer.from([4]),Buffer.from(p.x,'base64url'),Buffer.from(p.y,'base64url')]).toString('base64url'),vapidPrivateKey:privateKey.export({format:'jwk'}).d,vapidSubject:'mailto:bt@klinorbis.test',jwk:p};};

test('yalnız bilinen push servislerine istek atılır',()=>{
  for(const ok of [FCM,'https://updates.push.services.mozilla.com/wpush/v2/x','https://web.push.apple.com/abc','https://wns2-par02p.notify.windows.com/w/?token=1'])assert.ok(wp.allowedEndpoint(ok),ok);
  for(const bad of ['http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.test/x','https://evilfcm.googleapis.com.test/','https://localhost/x','https://fcm.googleapis.com:8443/x','https://u:p@fcm.googleapis.com/x',42,'x'.repeat(700)])assert.equal(wp.allowedEndpoint(bad),null,String(bad).slice(0,60));
});

test('VAPID imzası doğrulanabilir (ES256, hedef servis kökeni)',async()=>{
  const k=keys();
  const h=await wp.vapidAuthorization(FCM,{publicKey:k.vapidPublicKey,privateKey:k.vapidPrivateKey,subject:k.vapidSubject},Date.UTC(2026,10,12));
  const m=/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);assert.ok(m);assert.equal(m[4],k.vapidPublicKey);
  const claims=JSON.parse(Buffer.from(m[2],'base64url'));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'mailto:bt@klinorbis.test');
  assert.ok(verify('sha256',Buffer.from(`${m[1]}.${m[2]}`),{key:createPublicKey({key:k.jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(m[3],'base64url')));
});

async function setup(env){
  const {d1,sqlite}=await createD1();const now=Date.now();
  setRuntime(d1,{demoEnabled:'0',...env});
  for(const e of ['a@klinorbis.test','b@klinorbis.test'])sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,'call_agent',1,?)").run(e,e,now);
  const note=(email,key)=>sqlite.prepare("INSERT INTO staff_notifications(email,kind,title,detail,path,dedupe_key,created_at) VALUES(?,'task','Size iş atandı','Temizlik','/islerim',?,?)").run(email,key,Date.now());
  return {sqlite,note};
}

await test('anahtar yoksa kapalı görünür, açıkmış gibi davranmaz',async()=>{
  await setup({});const api=await loadRoute('app/api/push/route.ts');
  const get=new Request(`${ORIGIN}/api/push`,{headers:{'oai-authenticated-user-email':'a@klinorbis.test'}});
  const g=await (await api.GET(get)).json();assert.equal(g.configured,false);assert.equal(g.publicKey,null);
  assert.equal((await api.POST(browserJson('/api/push',{action:'subscribe',endpoint:FCM},'a@klinorbis.test'))).status,503);
  assert.deepEqual(await wp.dispatchPush(async()=>{throw new Error('çağrılmamalı');}),{sent:0,removed:0,configured:false});
});

await test('kilitli telefona sinyal: yeni bildirim → tek sinyal, içerik yok; eski bildirim sinyal üretmez',async()=>{
  const k=keys();const {sqlite,note}=await setup(k);const api=await loadRoute('app/api/push/route.ts');
  note('a@klinorbis.test','eski');
  assert.equal((await api.POST(browserJson('/api/push',{action:'subscribe',endpoint:'https://evil.test/x'},'a@klinorbis.test'))).status,400);
  assert.equal((await api.POST(browserJson('/api/push',{action:'subscribe',endpoint:FCM},'a@klinorbis.test'))).status,200);
  const calls=[];const send=async(url,init)=>{calls.push({url,init});return new Response(null,{status:201});};
  assert.equal((await wp.dispatchPush(send)).sent,0,'abonelikten önceki bildirim için sinyal yok');
  note('a@klinorbis.test','y1');note('a@klinorbis.test','y2');note('b@klinorbis.test','baskasi');
  assert.equal((await wp.dispatchPush(send)).sent,1,'iki yeni bildirim tek sinyal');
  assert.equal(calls[0].url,FCM);assert.equal(calls[0].init.body,undefined,'içerik gönderilmez');
  assert.match(calls[0].init.headers.Authorization,/^vapid t=.+, k=/);assert.equal(calls[0].init.headers.Urgency,'high');
  assert.equal((await wp.dispatchPush(send)).sent,0,'aynı bildirim için ikinci sinyal yok');
  // Gönderilemezse geri alınır, sonraki turda yeniden denenir.
  note('a@klinorbis.test','y3');
  assert.equal((await wp.dispatchPush(async()=>new Response(null,{status:500}))).sent,0);
  assert.equal((await wp.dispatchPush(send)).sent,1,'hata sonrası yeniden deneme');
  // Kaldırılmış abonelik (410) silinir.
  note('a@klinorbis.test','y4');
  assert.equal((await wp.dispatchPush(async()=>new Response(null,{status:410}))).removed,1);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
});

await test('kişi yalnız kendi cihazını kapatır; deneme bildirimi kendisine gider; cihaz sınırı 5',async()=>{
  const k=keys();const {sqlite}=await setup(k);const api=await loadRoute('app/api/push/route.ts');
  await api.POST(browserJson('/api/push',{action:'subscribe',endpoint:FCM},'a@klinorbis.test'));
  const r=await (await api.POST(browserJson('/api/push',{action:'unsubscribe',endpoint:FCM},'b@klinorbis.test'))).json();
  assert.equal(r.removed,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1);
  const orig=globalThis.fetch;const sent=[];globalThis.fetch=async(u)=>{sent.push(String(u));return new Response(null,{status:201});};
  try{const t=await (await api.POST(browserJson('/api/push',{action:'test'},'a@klinorbis.test'))).json();assert.equal(t.sent,1);}finally{globalThis.fetch=orig;}
  assert.deepEqual(sent,[FCM]);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM staff_notifications WHERE email='a@klinorbis.test' AND title='Deneme bildirimi'").get().n,1);
  for(let i=0;i<7;i++)await wp.subscribe('a@klinorbis.test',`${FCM}-${i}`,Date.now()+i);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM push_subscriptions WHERE email='a@klinorbis.test'").get().n,5);
});

test('servis çalışanı ve ekran: içerik oturumla okunur, tek ana düğme, iPhone ve kapalı kurulum dürüst anlatılır',()=>{
  const sw=readFileSync('public/sw.js','utf8');
  assert.match(sw,/fetch\("\/api\/notifications"/);assert.doesNotMatch(sw,/event\.data\.(json|text)/,'push yükü okunmaz');
  assert.match(sw,/!raw\.startsWith\("\/\/"\)/,'yalnız site içi yola gider');
  const ui=readFileSync('app/phone-push.tsx','utf8');
  assert.match(ui,/Telefon bildirimini aç/);assert.match(ui,/Ana Ekrana Ekle/);assert.match(ui,/henüz açılmadı/);assert.match(ui,/<summary>Diğer işlemler<\/summary>/);
  assert.match(readFileSync('app/layout.tsx','utf8'),/manifest: "\/manifest\.webmanifest"/);
  assert.match(readFileSync('worker/index.ts','utf8'),/ctx\.waitUntil\(dispatchPush\(\)/);
  assert.doesNotMatch(readFileSync('scripts/vapid-keys.mjs','utf8'),/KLINORBIS_VAPID_PRIVATE_KEY=[A-Za-z0-9_-]{20,}/,'depoda anahtar yok');
});
