// Köprü → çekirdek mesaj imzası: HMAC-SHA256(gizli, `${keyId}.${timestamp}.${nonce}.${gövde karması}`).
// 5 dakikalık zaman penceresi ve tek kullanımlık nonce ile tekrar oynatma engellenir. Gizli anahtarın kendisi
// veritabanında değil, ortamdaki gizli kasada; veritabanında yalnız parmak izi (sha256) tutulur.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { safeEqualHex } from "../crypto.ts";

export const WINDOW_MS = 5 * 60_000;
export type Envelope = { keyId: string; timestamp: string; nonce: string; signature: string };

export function bodyHash(body: string) { return createHash("sha256").update(body, "utf8").digest("hex"); }
export function sign(secret: string, keyId: string, body: string, now = Date.now(), nonce = randomUUID()): Envelope {
  const timestamp = String(now);
  const signature = createHmac("sha256", secret).update(`${keyId}.${timestamp}.${nonce}.${bodyHash(body)}`).digest("hex");
  return { keyId, timestamp, nonce, signature };
}

export type NonceStore = { seen(key: string, ttlMs: number): Promise<boolean> };
export function memoryNonceStore(): NonceStore {
  const m = new Map<string, number>();
  return { async seen(key, ttl) { const now = Date.now(); for (const [k, exp] of m) if (exp < now) m.delete(k); if (m.has(key)) return true; m.set(key, now + ttl); return false; } };
}

export async function verify(secret: string, env: Envelope, body: string, nonces: NonceStore, now = Date.now()) {
  if (!/^[a-z0-9-]{6,40}$/.test(env.keyId) || !/^\d{13}$/.test(env.timestamp) || !/^[0-9a-f-]{16,64}$/i.test(env.nonce) || !/^[0-9a-f]{64}$/.test(env.signature)) return { ok: false as const, reason: "biçim" };
  if (Math.abs(now - Number(env.timestamp)) > WINDOW_MS) return { ok: false as const, reason: "zaman penceresi" };
  const expected = createHmac("sha256", secret).update(`${env.keyId}.${env.timestamp}.${env.nonce}.${bodyHash(body)}`).digest("hex");
  if (!safeEqualHex(expected, env.signature)) return { ok: false as const, reason: "imza" };
  if (await nonces.seen(`${env.keyId}:${env.nonce}`, WINDOW_MS * 2)) return { ok: false as const, reason: "tekrar" };
  return { ok: true as const };
}

export function secretFingerprint(secret: string) { return createHash("sha256").update(secret).digest("hex"); }

/** Persistent nonce claim for a hospital receiver. Two workers/restarts share the same PostgreSQL claim. */
export function databaseNonceStore(db: import('../db.ts').Database, tenantId: string): NonceStore {
 return {async seen(key,ttlMs){
  if(key.length>110||ttlMs<1||ttlMs>900000)throw new Error('Geçersiz tekrar anahtarı');
  const {withContext}=await import('../db.ts');
  const r=await withContext(db,{tenantId,actor:'bridge-signature',role:'kb_bridge',allUnits:true},tx=>tx.query(
   `INSERT INTO kb.idempotency_keys(tenant_id,key,request_hash,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 millisecond')
    ON CONFLICT(tenant_id,key) DO UPDATE SET request_hash=excluded.request_hash,created_at=now(),expires_at=excluded.expires_at
    WHERE kb.idempotency_keys.expires_at<=now() RETURNING key`,[tenantId,'nonce:'+key,bodyHash(key),ttlMs]));
  return r.rows.length===0;
 }};
}
