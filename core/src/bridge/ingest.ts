// Köprü mesajını çekirdeğe işler (kb_bridge rolüyle, tek işlemde):
//  1) Tekrar koruması: aynı kontrol numarası ikinci kez işlenmez.
//  2) Kimlik kasaya şifreli yazılır; operasyon tarafına yalnız takma ad belirteci geçer.
//  3) Yatış dönemi (encounter) ve yatak durumu güncellenir; nakil/taburcuda eski yatak "temizlik"e alınır ve
//     Temizlik birimine görev + temizlik işi açılır. Klinik veri işlenmez; HBYS'ye hiçbir şey yazılmaz.
import { createHash } from "node:crypto";
import { keyedHash, type Keyring } from "../crypto.ts";
import { withContext, type Database, type Queryable } from "../db.ts";
import { registerIdentity } from "../vault.ts";
import type { NormalizedAdt } from "./hl7v2.ts";

export type IngestResult = { status: "processed" | "duplicate" | "ignored"; encounterId?: string; tasks: string[] };
type Ctx = { tenantId: string; cleaningUnitCode?: string };

async function unitId(tx: Queryable, code: string) {
  const r = await tx.query<{ id: string }>("SELECT id FROM kb.units WHERE code = $1 AND active LIMIT 1", [code]);
  if (!r.rows[0]) throw new Error(`Bilinmeyen birim kodu: ${code}`);
  return r.rows[0].id;
}
async function bedId(tx: Queryable, unit: string, room: string | null, bed: string | null) {
  if (!room || !bed) return null;
  const r = await tx.query<{ id: string }>("SELECT b.id FROM kb.beds b JOIN kb.rooms r ON r.id = b.room_id WHERE b.unit_id = $1 AND r.code = $2 AND b.code = $3", [unit, room, bed]);
  return r.rows[0]?.id ?? null;
}
async function setBed(tx: Queryable, id: string, to: string) {
  await tx.query("UPDATE kb.beds SET status = $2 WHERE id = $1 AND status <> $2", [id, to]);
}
async function openCleaning(tx: Queryable, tenantId: string, bed: string, cleaningUnit: string, ref: string) {
  await tx.query("INSERT INTO kb.cleaning_jobs (tenant_id, bed_id, kind) VALUES ($1, $2, 'standart') ON CONFLICT DO NOTHING", [tenantId, bed]);
  const reference = `TSK-TMZ-${ref}`.slice(0, 64).toUpperCase().replace(/[^A-Z0-9-]/g, "-");
  await tx.query("INSERT INTO kb.tasks (tenant_id, reference, unit_id, source, title, due_at) VALUES ($1, $2, $3, 'bridge', 'Yatak temizliği ve hazırlık', now() + interval '45 minutes') ON CONFLICT DO NOTHING", [tenantId, reference, cleaningUnit]);
  return reference;
}

export async function ingestAdt(db: Database, ctx: Ctx, keys: Keyring, msg: NormalizedAdt, rawPayload: string, endpointId: string | null = null): Promise<IngestResult> {
  const payloadSha = createHash("sha256").update(rawPayload).digest("hex");
  return withContext(db, { tenantId: ctx.tenantId, actor: "kopru", role: "kb_bridge", allUnits: true }, async (tx) => {
    const ins = await tx.query<{ id: string }>(
      "INSERT INTO kb.inbound_messages (tenant_id, endpoint_id, message_type, control_id, payload_sha256) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, endpoint_id, control_id) DO NOTHING RETURNING id",
      [ctx.tenantId, endpointId, `ADT^${msg.event}`, msg.controlId, payloadSha]);
    let messageId=ins.rows[0]?.id;
    if(!messageId){
      const prior=(await tx.query<{id:string;payload_sha256:string;status:string;attempts:number}>("SELECT id,payload_sha256,status,attempts FROM kb.inbound_messages WHERE tenant_id=$1 AND endpoint_id IS NOT DISTINCT FROM $2::uuid AND control_id=$3 FOR UPDATE",[ctx.tenantId,endpointId,msg.controlId])).rows[0];
      if(!prior||prior.payload_sha256!==payloadSha)throw new Error("MESSAGE_ID_CONTENT_MISMATCH");
      if(prior.status!=="failed")return {status:"duplicate",tasks:[]};
      if(prior.attempts>=5)return {status:"ignored",tasks:[]};
      messageId=prior.id;
      await tx.query("UPDATE kb.inbound_messages SET status='received',attempts=attempts+1,error_code=NULL WHERE id=$1",[messageId]);
    }
    if (!msg.patient.nationalId) {
      await tx.query("UPDATE kb.inbound_messages SET status = 'ignored', error_code = 'NO_NATIONAL_ID', processed_at = now() WHERE id = $1", [messageId]);
      return { status: "ignored", tasks: [] };
    }
    const token = await registerIdentity(tx, ctx.tenantId, keys, { nationalId: msg.patient.nationalId, givenName: msg.patient.givenName, familyName: msg.patient.familyName });
    const visitHash = keyedHash(keys.pseudonym, ctx.tenantId, "visit", msg.visit.number);
    const unit = await unitId(tx, msg.visit.unitCode);
    const bed = await bedId(tx, unit, msg.visit.room, msg.visit.bed);
    const cleaningUnit = await unitId(tx, ctx.cleaningUnitCode ?? "CTM");
    const existing = (await tx.query<{ id: string; bed_id: string | null; status: string; source_message_at: string | null }>("SELECT id, bed_id, status, source_message_at FROM kb.encounters WHERE external_visit_hash = $1 FOR UPDATE", [visitHash])).rows[0];
    if(existing && ((existing.source_message_at&&msg.occurredAt.getTime()<new Date(existing.source_message_at).getTime())||(['discharged','cancelled'].includes(existing.status)&&msg.event!=='A03'))){
      await tx.query("UPDATE kb.inbound_messages SET status='ignored',error_code='SOURCE_ORDER_REVIEW',processed_at=now() WHERE id=$1",[messageId]);
      await tx.query("INSERT INTO audit.events(tenant_id,actor,action,resource,detail) VALUES($1,'kopru','bridge.source_review',$2,'Closed encounter or older source event; state unchanged')",[ctx.tenantId,msg.controlId]);
      const reviewRef=('TSK-REV-'+msg.controlId).slice(0,64).toUpperCase().replace(/[^A-Z0-9-]/g,'-');
      await tx.query("INSERT INTO kb.tasks(tenant_id,reference,unit_id,source,title,due_at) VALUES($1,$2,$3,'bridge','Kaynak olay sırası ve kapalı yatış mutabakatını incele',now()+interval '30 minutes') ON CONFLICT DO NOTHING",[ctx.tenantId,reviewRef,await unitId(tx,'YTK')]);
      return {status:'ignored',tasks:[reviewRef]};
    }
    const tasks: string[] = [];
    let encounterId = existing?.id;

    if (msg.event === "A01" || (msg.event === "A08" && !existing)) {
      if (!existing) {
        encounterId = (await tx.query<{ id: string }>("INSERT INTO kb.encounters (tenant_id, patient_token, external_visit_hash, unit_id, bed_id, status, admitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
          [ctx.tenantId, token, visitHash, unit, bed, msg.event === "A01" ? "admitted" : "expected", msg.event === "A01" ? msg.occurredAt : null])).rows[0].id;
      }
      if(existing && existing.status==='expected' && msg.event==='A01')await tx.query("UPDATE kb.encounters SET status='admitted',unit_id=$2,bed_id=$3,admitted_at=$4 WHERE id=$1",[existing.id,unit,bed,msg.occurredAt]);
      if (bed && msg.event === "A01") { await setBed(tx, bed, "occupied"); await tx.query("INSERT INTO kb.encounter_moves (tenant_id, encounter_id, to_bed_id, reason, source_message_id) VALUES ($1, $2, $3, 'admit', $4)", [ctx.tenantId, encounterId, bed, messageId]); }
    } else if (msg.event === "A02") {
      if (!existing) throw new Error("Nakil için yatış dönemi bulunamadı");
      const from = existing.bed_id;
      if (from && from !== bed) { await setBed(tx, from, "cleaning"); tasks.push(await openCleaning(tx, ctx.tenantId, from, cleaningUnit, `${msg.controlId}-${from.slice(0, 6)}`)); }
      await tx.query("UPDATE kb.encounters SET unit_id = $2, bed_id = $3, status = 'admitted' WHERE id = $1", [existing.id, unit, bed]);
      if (bed) await setBed(tx, bed, "occupied");
      await tx.query("INSERT INTO kb.encounter_moves (tenant_id, encounter_id, from_bed_id, to_bed_id, reason, source_message_id) VALUES ($1, $2, $3, $4, 'transfer', $5)", [ctx.tenantId, existing.id, from, bed, messageId]);
    } else if (msg.event === "A03") {
      if (!existing) throw new Error("Taburcu için yatış dönemi bulunamadı");
      const from = existing.bed_id;
      await tx.query("UPDATE kb.encounters SET status = 'discharged', discharged_at = $2, bed_id = NULL WHERE id = $1", [existing.id, msg.occurredAt]);
      if (from) { await setBed(tx, from, "cleaning"); tasks.push(await openCleaning(tx, ctx.tenantId, from, cleaningUnit, `${msg.controlId}-${from.slice(0, 6)}`)); }
      await tx.query("INSERT INTO kb.encounter_moves (tenant_id, encounter_id, from_bed_id, reason, source_message_id) VALUES ($1, $2, $3, 'discharge', $4)", [ctx.tenantId, existing.id, from, messageId]);
    }
    if(encounterId)await tx.query("UPDATE kb.encounters SET source_message_at=$2 WHERE id=$1",[encounterId,msg.occurredAt]);
    await tx.query("UPDATE kb.inbound_messages SET status = 'processed', processed_at = now() WHERE id = $1", [messageId]);
    await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, 'kopru', 'bridge.adt_processed', $2, $3)", [ctx.tenantId, msg.controlId, `${msg.event} · ${msg.visit.unitCode}`]);
    return { status: "processed", encounterId, tasks };
  });
}

/** Hata durumunda mesajı başarısız/ölü mektup olarak işaretler (ayrı işlemde; ana işlem geri alınmıştır). */
export async function recordFailure(db: Database, tenantId: string, controlId: string, messageType: string, rawPayload: string, code: string, endpointId: string | null = null) {
  const sha = createHash("sha256").update(rawPayload).digest("hex");
  await withContext(db, { tenantId, actor: "kopru", role: "kb_bridge", allUnits: true }, async (tx) => {
    await tx.query(`INSERT INTO kb.inbound_messages (tenant_id, endpoint_id, message_type, control_id, payload_sha256, status, attempts, error_code)
      VALUES ($1, $2, $3, $4, $5, 'failed', 1, $6)
      ON CONFLICT (tenant_id, endpoint_id, control_id) DO UPDATE SET attempts = LEAST(kb.inbound_messages.attempts + 1, 10), error_code = EXCLUDED.error_code,
        status = CASE WHEN kb.inbound_messages.attempts + 1 >= 5 THEN 'dead_letter' ELSE 'failed' END
      WHERE kb.inbound_messages.status IN ('received','failed') AND kb.inbound_messages.payload_sha256=EXCLUDED.payload_sha256`, [tenantId, endpointId, messageType, controlId.slice(0, 80) || "BILINMIYOR", sha, code.slice(0, 40)]);
  });
}
