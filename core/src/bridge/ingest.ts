// Köprü mesajını çekirdeğe işler (kb_bridge rolüyle, tek işlemde):
//  1) Tekrar koruması: aynı kontrol numarası ikinci kez işlenmez.
//  2) Kod eşleme: HBYS birim/yatak kodu kb.code_mappings ile çözülür; eşleşmeyen kod mesajı KARANTİNAYA alır.
//  3) Olay sırası: yatış döneminin son olayından eski tarihli mesaj kaydı geri almaz (karantina: STALE).
//  4) Kimlik kasaya şifreli yazılır; operasyon tarafına yalnız takma ad geçer.
//  5) Doluluk HBYS'den gelir; boşalan yatak kendiliğinden "kirli" olur ve temizlik işi açılır.
//  6) A11/A12/A13 iptal/düzeltme mesajları uygulanır; güvenle uygulanamıyorsa karantina (CONFLICT).
// Karantinadaki ve hatalı mesajın ham hâli yeniden deneme için 7 gün şifreli saklanır. HBYS'ye hiçbir şey yazılmaz.
import { createHash } from "node:crypto";
import { keyedHash, seal, type Keyring } from "../crypto.ts";
import { withContext, type Database, type Queryable } from "../db.ts";
import { openCleaningJob } from "../services/cleaning.ts";
import { registerIdentity } from "../vault.ts";
import type { NormalizedAdt } from "./hl7v2.ts";

export type QuarantineReason = "UNMAPPED_UNIT" | "UNMAPPED_BED" | "STALE" | "NO_ENCOUNTER" | "CONFLICT" | "NO_NATIONAL_ID";
export type IngestResult = { status: "processed" | "duplicate" | "quarantined"; reason?: QuarantineReason; encounterId?: string; cleaningJobs: string[]; messageId?: string };
type Ctx = { tenantId: string; cleaningUnitCode?: string; system?: string };
class Quarantine extends Error { reason: QuarantineReason; constructor(reason: QuarantineReason) { super(reason); this.reason = reason; } }

async function resolveUnit(tx: Queryable, system: string, code: string) {
  const m = await tx.query<{ unit_id: string }>("SELECT unit_id FROM kb.code_mappings WHERE system = $1 AND kind = 'unit' AND external_code = $2 AND active", [system, code]);
  if (m.rows[0]) return m.rows[0].unit_id;
  const u = await tx.query<{ id: string }>("SELECT id FROM kb.units WHERE code = $1 AND active LIMIT 1", [code]);
  if (!u.rows[0]) throw new Quarantine("UNMAPPED_UNIT");
  return u.rows[0].id;
}
async function resolveBed(tx: Queryable, system: string, unit: string, unitCode: string, room: string | null, bed: string | null) {
  if (!room && !bed) return null;
  const ext = `${unitCode}^${room ?? ""}^${bed ?? ""}`;
  const m = await tx.query<{ bed_id: string }>("SELECT bed_id FROM kb.code_mappings WHERE system = $1 AND kind = 'bed' AND external_code = $2 AND active", [system, ext]);
  if (m.rows[0]) return m.rows[0].bed_id;
  const r = await tx.query<{ id: string }>("SELECT b.id FROM kb.beds b JOIN kb.rooms r ON r.id = b.room_id WHERE b.unit_id = $1 AND r.code = $2 AND b.code = $3", [unit, room, bed]);
  if (!r.rows[0]) throw new Quarantine("UNMAPPED_BED");
  return r.rows[0].id;
}
async function occupy(tx: Queryable, bedId: string | null) {
  if (bedId) await tx.query("UPDATE kb.beds SET occupancy = 'dolu', occupancy_source = 'hbys' WHERE id = $1 AND occupancy <> 'dolu'", [bedId]);
}
async function vacate(tx: Queryable, ctx: Ctx, bedId: string | null, cleaningUnit: string, out: string[]) {
  if (!bedId) return;
  const r = await tx.query("UPDATE kb.beds SET occupancy = 'bos', occupancy_source = 'hbys' WHERE id = $1 AND occupancy = 'dolu' RETURNING id", [bedId]);
  if (r.rows.length) out.push((await openCleaningJob(tx, ctx.tenantId, bedId, cleaningUnit)).id);
}

async function apply(tx: Queryable, ctx: Ctx, keys: Keyring, msg: NormalizedAdt, messageId: string): Promise<{ encounterId?: string; cleaningJobs: string[] }> {
  const system = ctx.system ?? "hbys";
  if (!msg.patient.nationalId) throw new Quarantine("NO_NATIONAL_ID");
  const visitHash = keyedHash(keys.pseudonym, ctx.tenantId, "visit", msg.visit.number);
  const unit = await resolveUnit(tx, system, msg.visit.unitCode);
  const bed = await resolveBed(tx, system, unit, msg.visit.unitCode, msg.visit.room, msg.visit.bed);
  const cleaningUnit = await resolveUnit(tx, system, ctx.cleaningUnitCode ?? "CTM");
  const enc = (await tx.query<{ id: string; bed_id: string | null; prior_bed_id: string | null; status: string; last_event_at: Date | null }>(
    "SELECT id, bed_id, prior_bed_id, status, last_event_at FROM kb.encounters WHERE external_visit_hash = $1 FOR UPDATE", [visitHash])).rows[0];
  if (enc?.last_event_at && msg.occurredAt.getTime() < new Date(enc.last_event_at).getTime()) throw new Quarantine("STALE");
  const jobs: string[] = [];
  const move = (encounterId: string, from: string | null, to: string | null, reason: string) =>
    tx.query("INSERT INTO kb.encounter_moves (tenant_id, encounter_id, from_bed_id, to_bed_id, reason, source_message_id) VALUES ($1, $2, $3, $4, $5, $6)", [ctx.tenantId, encounterId, from, to, reason, messageId]);
  const touch = (id: string, sets: string, params: unknown[] = []) => tx.query(`UPDATE kb.encounters SET ${sets}, last_event_at = $2 WHERE id = $1`, [id, msg.occurredAt, ...params]);

  switch (msg.event) {
    case "A01": case "A08": {
      if (enc && ["discharged", "cancelled"].includes(enc.status)) throw new Quarantine("CONFLICT");
      if (!enc) {
        const token = await registerIdentity(tx, ctx.tenantId, keys, { nationalId: msg.patient.nationalId, givenName: msg.patient.givenName, familyName: msg.patient.familyName });
        const admitted = msg.event === "A01";
        const id = (await tx.query<{ id: string }>("INSERT INTO kb.encounters (tenant_id, patient_token, external_visit_hash, unit_id, bed_id, status, admitted_at, last_event_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
          [ctx.tenantId, token, visitHash, unit, admitted ? bed : null, admitted ? "admitted" : "expected", admitted ? msg.occurredAt : null, msg.occurredAt])).rows[0].id;
        if (admitted) { await occupy(tx, bed); if (bed) await move(id, null, bed, "admit"); }
        return { encounterId: id, cleaningJobs: jobs };
      }
      if (msg.event === "A01" && enc.status === "expected") {
        await touch(enc.id, "status = 'admitted', admitted_at = $2, unit_id = $3, bed_id = $4", [unit, bed]);
        await occupy(tx, bed); if (bed) await move(enc.id, null, bed, "admit");
      } else await touch(enc.id, "unit_id = unit_id");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
    case "A02": {
      if (!enc) throw new Quarantine("NO_ENCOUNTER");
      if (enc.status !== "admitted" && enc.status !== "transferring") throw new Quarantine("CONFLICT");
      if (enc.bed_id !== bed) await vacate(tx, ctx, enc.bed_id, cleaningUnit, jobs);
      await touch(enc.id, "unit_id = $3, bed_id = $4, prior_bed_id = $5, status = 'admitted'", [unit, bed, enc.bed_id]);
      await occupy(tx, bed);
      await move(enc.id, enc.bed_id, bed, "transfer");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
    case "A03": {
      if (!enc) throw new Quarantine("NO_ENCOUNTER");
      if (enc.status === "discharged") return { encounterId: enc.id, cleaningJobs: jobs };
      await touch(enc.id, "status = 'discharged', discharged_at = $2, prior_bed_id = bed_id, bed_id = NULL");
      await vacate(tx, ctx, enc.bed_id, cleaningUnit, jobs);
      await move(enc.id, enc.bed_id, null, "discharge");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
    case "A11": { // yatış iptali
      if (!enc) throw new Quarantine("NO_ENCOUNTER");
      if (enc.status === "discharged") throw new Quarantine("CONFLICT");
      await touch(enc.id, "status = 'cancelled', bed_id = NULL");
      await vacate(tx, ctx, enc.bed_id, cleaningUnit, jobs);
      await move(enc.id, enc.bed_id, null, "correction");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
    case "A12": { // nakil iptali: önceki yatağa dönüş; önceki yatak hazır değilse insan karar verir
      if (!enc || !enc.prior_bed_id) throw new Quarantine(enc ? "CONFLICT" : "NO_ENCOUNTER");
      const prior = (await tx.query<{ occupancy: string; block_reason: string | null }>("SELECT occupancy, block_reason FROM kb.beds WHERE id = $1 FOR UPDATE", [enc.prior_bed_id])).rows[0];
      if (!prior || prior.occupancy === "dolu" || prior.block_reason) throw new Quarantine("CONFLICT");
      await vacate(tx, ctx, enc.bed_id, cleaningUnit, jobs);
      await touch(enc.id, "bed_id = prior_bed_id, prior_bed_id = NULL");
      await occupy(tx, enc.prior_bed_id);
      await move(enc.id, enc.bed_id, enc.prior_bed_id, "correction");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
    case "A13": { // taburcu iptali: yatak hâlâ boşsa geri alınır; doluysa insan karar verir
      if (!enc || enc.status !== "discharged" || !enc.prior_bed_id) throw new Quarantine(enc ? "CONFLICT" : "NO_ENCOUNTER");
      const prior = (await tx.query<{ occupancy: string }>("SELECT occupancy FROM kb.beds WHERE id = $1 FOR UPDATE", [enc.prior_bed_id])).rows[0];
      if (!prior || prior.occupancy === "dolu") throw new Quarantine("CONFLICT");
      await touch(enc.id, "status = 'admitted', discharged_at = NULL, bed_id = prior_bed_id, prior_bed_id = NULL");
      await occupy(tx, enc.prior_bed_id);
      await move(enc.id, null, enc.prior_bed_id, "correction");
      return { encounterId: enc.id, cleaningJobs: jobs };
    }
  }
  return { cleaningJobs: jobs };
}

/** Mesajı işler. Karantina gerekiyorsa veri değişiklikleri geri alınır, mesaj karantina olarak kaydedilir. */
export async function ingestAdt(db: Database, ctx: Ctx, keys: Keyring, msg: NormalizedAdt, rawPayload: string, endpointId: string | null = null, existingMessageId?: string): Promise<IngestResult> {
  const payloadSha = createHash("sha256").update(rawPayload).digest("hex");
  const bridge = { tenantId: ctx.tenantId, actor: "kopru", role: "kb_bridge" as const, allUnits: true };
  try {
    return await withContext(db, bridge, async (tx) => {
      let messageId = existingMessageId;
      if (!messageId) {
        const ins = await tx.query<{ id: string }>(
          "INSERT INTO kb.inbound_messages (tenant_id, endpoint_id, message_type, control_id, payload_sha256, event_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, endpoint_id, control_id) DO NOTHING RETURNING id",
          [ctx.tenantId, endpointId, `ADT^${msg.event}`, msg.controlId, payloadSha, msg.occurredAt]);
        messageId = ins.rows[0]?.id;
        if (!messageId) {
          const prior = (await tx.query<{id:string;payload_sha256:string;status:string;attempts:number}>("SELECT id,payload_sha256,status,attempts FROM kb.inbound_messages WHERE tenant_id=$1 AND endpoint_id IS NOT DISTINCT FROM $2::uuid AND control_id=$3 FOR UPDATE", [ctx.tenantId,endpointId,msg.controlId])).rows[0];
          if (!prior || prior.payload_sha256 !== payloadSha) throw new Error("MESSAGE_ID_CONTENT_MISMATCH");
          if (prior.status !== "failed" || prior.attempts >= 5) return {status:"duplicate" as const,cleaningJobs:[]};
          messageId = prior.id;
          await tx.query("UPDATE kb.inbound_messages SET status='received',attempts=attempts+1,error_code=NULL WHERE id=$1", [messageId]);
        }
      }
      if (existingMessageId) {
        const row = (await tx.query<{payload_sha256:string;status:string;attempts:number}>("SELECT payload_sha256,status,attempts FROM kb.inbound_messages WHERE id=$1 FOR UPDATE",[existingMessageId])).rows[0];
        if (!row || row.payload_sha256 !== payloadSha) throw new Error("MESSAGE_ID_CONTENT_MISMATCH");
        if (!["quarantined","failed"].includes(row.status) || row.attempts >= 5) return {status:"duplicate" as const,cleaningJobs:[]};
      }
      const out = await apply(tx, ctx, keys, msg, messageId);
      await tx.query("UPDATE kb.inbound_messages SET status = 'processed', processed_at = now(), quarantine_reason = NULL, error_code = NULL WHERE id = $1", [messageId]);
      await tx.query("DELETE FROM vault.inbound_payloads WHERE message_id = $1", [messageId]);
      await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, 'kopru', 'bridge.adt_processed', $2, $3)", [ctx.tenantId, msg.controlId, `${msg.event}`]);
      return { status: "processed" as const, messageId, ...out };
    });
  } catch (error) {
    if (!(error instanceof Quarantine)) throw error;
    // Karantina kaydı ayrı işlemde: veri değişikliği yok, yalnız mesaj izi ve şifreli ham yük.
    return withContext(db, bridge, async (tx) => {
      let id = existingMessageId;
      if (!id) {
        const inserted = await tx.query<{id:string}>(
          "INSERT INTO kb.inbound_messages(tenant_id,endpoint_id,message_type,control_id,payload_sha256,event_at,status,quarantine_reason) VALUES($1,$2,$3,$4,$5,$6,'quarantined',$7) ON CONFLICT(tenant_id,endpoint_id,control_id) DO NOTHING RETURNING id",
          [ctx.tenantId,endpointId,'ADT^'+msg.event,msg.controlId,payloadSha,msg.occurredAt,error.reason]);
        id = inserted.rows[0]?.id;
      }
      const prior = (await tx.query<{id:string;status:string;payload_sha256:string}>("SELECT id,status,payload_sha256 FROM kb.inbound_messages WHERE tenant_id=$1 AND endpoint_id IS NOT DISTINCT FROM $2::uuid AND control_id=$3 FOR UPDATE",[ctx.tenantId,endpointId,msg.controlId])).rows[0];
      if (!prior || prior.payload_sha256 !== payloadSha) throw new Error("MESSAGE_ID_CONTENT_MISMATCH");
      if (["processed","resolved","dead_letter"].includes(prior.status)) return {status:"duplicate" as const,cleaningJobs:[]};
      id = prior.id;
      await tx.query("UPDATE kb.inbound_messages SET status=CASE WHEN attempts + $3 >= 5 THEN 'dead_letter' ELSE 'quarantined' END,quarantine_reason=$2,attempts=LEAST(attempts+$3,10),processed_at=now() WHERE id=$1",[id,error.reason,existingMessageId?1:0]);
      const sealed = seal(keys.identity, Buffer.from(rawPayload, "utf8"), Buffer.from(`${ctx.tenantId}|payload|${id}`));
      await tx.query("INSERT INTO vault.inbound_payloads (message_id, tenant_id, ciphertext, key_version) VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING", [id, ctx.tenantId, sealed, keys.identityKeyVersion]);
      await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource, detail) VALUES ($1, 'kopru', 'bridge.adt_quarantined', $2, $3)", [ctx.tenantId, msg.controlId, error.reason]);
      return { status: "quarantined" as const, reason: error.reason, messageId: id, cleaningJobs: [] };
    });
  }
}

/** Ayrıştırılamayan mesaj: başarısız/ölü mektup (5 denemeden sonra). Ham yük saklanmaz (ayrıştırılamadığı için içerik bilinmiyor). */
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
