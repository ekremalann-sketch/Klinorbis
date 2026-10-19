import assert from 'node:assert/strict';
import test from 'node:test';
import {freshDb,seedTenant} from './helpers.ts';
import {withContext} from '../src/db.ts';
import {openCleaningJob,acceptJob,startJob,completeJob} from '../src/services/cleaning.ts';
import {bedBoard,reserveBed} from '../src/services/beds.ts';
import {provisionTenantKeys,rotateIdentityKey,loadKeyring} from '../src/keys.ts';
import {testKek} from './fixtures.ts';
import {adt} from '../src/bridge/fake-hbys.ts';
import {parseAdt} from '../src/bridge/hl7v2.ts';
import {ingestAdt} from '../src/bridge/ingest.ts';
import {retryMessage} from '../src/services/integration.ts';
const db=await freshDb(),A=await seedTenant(db,'MERGE-A');
const ctx={tenantId:A.tenantId,actor:'ops',allUnits:true};
test('kabul edilmiş temizlik işini başka görevli başlatamaz veya tamamlayamaz',async()=>{
 await db.query("UPDATE kb.beds SET cleaning_state='kirli' WHERE id=$1",[A.bedId]);
 const j=await withContext(db,ctx,tx=>openCleaningJob(tx,A.tenantId,A.bedId,A.units.ctm));
 await withContext(db,ctx,tx=>acceptJob(tx,j.id,'worker-1'));
 await assert.rejects(withContext(db,ctx,tx=>startJob(tx,j.id,'worker-2')),/kabul eden/);
 await withContext(db,ctx,tx=>startJob(tx,j.id,'worker-1'));
 await assert.rejects(withContext(db,ctx,tx=>completeJob(tx,j.id,'worker-2')),/kabul eden/);
});
test('açık çelişkili yatak temiz ve boş olsa da hazır değildir ve ayrılamaz',async()=>{
 const room=(await db.query<{id:string}>("INSERT INTO kb.rooms(tenant_id,unit_id,code) VALUES($1,$2,'SIM-9') RETURNING id",[A.tenantId,A.units.dhl])).rows[0];
 const bed=(await db.query<{id:string}>("INSERT INTO kb.beds(tenant_id,room_id,unit_id,code,conflict) VALUES($1,$2,$3,'SIM-9','kirli_yataga_yatis') RETURNING id",[A.tenantId,room.id,A.units.dhl])).rows[0];
 const view=await withContext(db,ctx,tx=>bedBoard(tx));assert.equal(view.beds.find(b=>b.id===bed.id)?.ready,false);
 await assert.rejects(withContext(db,ctx,tx=>reserveBed(tx,bed.id,'AKS-SIM-0001',30,'ops')),/hazır değil/);
});
test('karantina yükü anahtar rotasyonu sonrasında açılır; süresi dolmuş yük yeniden işlenmez',async()=>{
 const kms=testKek(),keys=await provisionTenantKeys(db,A.tenantId,kms);
 const send=async(id:string)=>{const raw=adt('A01',{n:77,visit:'SIM-'+id,unit:'MISSING',room:'SIM',bed:'SIM'},id);return ingestAdt(db,{tenantId:A.tenantId},keys,parseAdt(raw),raw);};
 const old=await send('SIM-ROTATE');assert.equal(old.status,'quarantined');
 await rotateIdentityKey(db,A.tenantId,kms);const next=await loadKeyring(db,A.tenantId,kms);
 assert.equal((await retryMessage(db,A.tenantId,next,old.messageId!,'ops')).status,'quarantined');
 await db.query("UPDATE vault.inbound_payloads SET expires_at=now()-interval '1 second' WHERE message_id=$1",[old.messageId]);
 await assert.rejects(retryMessage(db,A.tenantId,next,old.messageId!,'ops'),/saklama süresi/);
});
test.after(()=>db.close());
