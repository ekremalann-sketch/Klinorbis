import test from 'node:test';
import assert from 'node:assert/strict';
import {freshDb,seedTenant} from './helpers.ts';
import {testKek} from './fixtures.ts';
import {withContext} from '../src/db.ts';
import {provisionTenantKeys,rotateIdentityKey,loadKeyring} from '../src/keys.ts';
import {registerIdentity,reidentify} from '../src/vault.ts';
import {adt,syntheticTckn} from '../src/bridge/fake-hbys.ts';
import {parseAdt} from '../src/bridge/hl7v2.ts';
import {ingestAdt,recordFailure} from '../src/bridge/ingest.ts';
const db=await freshDb(),A=await seedTenant(db,'HARD-A'),B=await seedTenant(db,'HARD-B'),kms=testKek();
const keys=await provisionTenantKeys(db,A.tenantId,kms),ctx={tenantId:A.tenantId};
const P={n:111,visit:'V-SIM-111',unit:'DHL',room:'312',bed:'312-A'};
const t0=new Date('2026-10-18T08:00:00Z');
await test('köprü: başarısız mesaj aynı kimlikle yeniden işlenir; işlenmiş kayıt hata ile düşürülemez',async()=>{
 const raw=adt('A01',P,'SIM-RETRY-1',t0);await recordFailure(db,A.tenantId,'SIM-RETRY-1','ADT^A01',raw,'TEMPORARY');assert.equal((await ingestAdt(db,ctx,keys,parseAdt(raw),raw)).status,'processed');
 await recordFailure(db,A.tenantId,'SIM-RETRY-1','ADT^A01',raw,'LATE_FAILURE');
 const row=(await db.query<{status:string;attempts:number}>("SELECT status,attempts FROM kb.inbound_messages WHERE control_id='SIM-RETRY-1'")).rows[0];assert.equal(row.status,'processed');assert.equal(row.attempts,2);
 await assert.rejects(ingestAdt(db,ctx,keys,parseAdt(raw),raw+'\rNTE|changed'),/MESSAGE_ID_CONTENT_MISMATCH/);
});
await test('köprü: eski olay güncel yatışı ezmez; taburcu sonrası geciken nakil yatışı açmaz',async()=>{
 const discharge=adt('A03',P,'SIM-DISCHARGE',new Date(t0.getTime()+3600000));assert.equal((await ingestAdt(db,ctx,keys,parseAdt(discharge),discharge)).status,'processed');
 const move=adt('A02',P,'SIM-LATE-MOVE',new Date(t0.getTime()+1800000));assert.equal((await ingestAdt(db,ctx,keys,parseAdt(move),move)).status,'ignored');
 assert.equal((await db.query<{status:string}>("SELECT status FROM kb.encounters WHERE tenant_id=$1",[A.tenantId])).rows[0].status,'discharged');
});
await test('kasa: rastgele acil erişim kimliği normal yetkiyi atlatamaz',async()=>{
 await assert.rejects(withContext(db,{tenantId:A.tenantId,actor:'no-permission'},tx=>tx.query("SELECT * FROM kb.reidentify('P-00A1','Yetkisiz fakat uzun gerekçe metni',$1)",[crypto.randomUUID()])),/yetkisi yok/);
});
await test('anahtar rotasyonu: eski şifreli kimlik yeni halkayla çözülür; KMS hatası aktif anahtarı kapatmaz',async()=>{
 const nid=syntheticTckn(112),token=await withContext(db,{tenantId:A.tenantId,actor:'bridge',role:'kb_bridge'},tx=>registerIdentity(tx,A.tenantId,keys,{nationalId:nid,givenName:'Kurgusal',familyName:'Kayıt'}));
 await rotateIdentityKey(db,A.tenantId,kms);const next=await loadKeyring(db,A.tenantId,kms);assert.notEqual(next.identityKeyVersion,keys.identityKeyVersion);
 const r=await withContext(db,{tenantId:A.tenantId,actor:'authorized',canReidentify:true},tx=>reidentify(tx,A.tenantId,next,token,'Kurgusal test için yetkili kimlik kontrolü'));assert.equal(r?.nationalId,nid);
 await assert.rejects(rotateIdentityKey(db,A.tenantId,{...kms,wrap:async()=>{throw Error('KMS unavailable');}}),/KMS unavailable/);
 assert.equal((await loadKeyring(db,A.tenantId,kms)).identityKeyVersion,next.identityKeyVersion);
});
await test('gömülü PostgreSQL: hata sonrası işlem bağlamı diğer kuruma taşınmaz',async()=>{
 await assert.rejects(withContext(db,{tenantId:A.tenantId,actor:'a',allUnits:true},async tx=>{await tx.query('SELECT 1');throw Error('rollback');}),/rollback/);
 const visible=await withContext(db,{tenantId:B.tenantId,actor:'b',allUnits:true},tx=>tx.query<{tenant_id:string}>('SELECT tenant_id FROM kb.encounters'));assert.equal(visible.rows.length,0);
 const empty=await db.transaction(async tx=>{await tx.query('SET LOCAL ROLE kb_app');return tx.query('SELECT * FROM kb.encounters');});assert.equal(empty.rows.length,0);
});

await test('kalıcı tekrar koruması: yeni işçi örneği aynı nonce değerini reddeder',async()=>{
 const {databaseNonceStore,sign,verify}=await import('../src/bridge/signer.ts');const body='yalnız-kurgusal-test',secret='synthetic-test-secret-only';const envelope=sign(secret,'sim-bridge',body);
 assert.equal((await verify(secret,envelope,body,databaseNonceStore(db,A.tenantId))).ok,true);
 assert.equal((await verify(secret,envelope,body,databaseNonceStore(db,A.tenantId))).reason,'tekrar');
});

test.after(()=>db.close());
