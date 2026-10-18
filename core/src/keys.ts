// Kurum anahtarlarının hazırlanması ve yüklenmesi (yönetici işlemi; uygulama rolü vault.key_versions'a yazamaz).
// Her amaç için rastgele veri anahtarı üretilir, ana anahtarla (KMS/HSM) sarılır ve yalnız sarılı hâli saklanır.
// Rotasyon: yeni anahtar "active", eskisi "decrypt_only" olur; eski kayıtlar okunmaya devam eder.
import type { KeyProvider, Keyring } from "./crypto.ts";
import { newDek } from "./crypto.ts";
import type { Database, Queryable } from "./db.ts";

const PURPOSES = ["identity", "pseudonym", "blind_index"] as const;

export async function provisionTenantKeys(admin: Queryable, tenantId: string, kms: KeyProvider) {
  for (const purpose of PURPOSES) {
    const exists = await admin.query("SELECT 1 FROM vault.key_versions WHERE tenant_id = $1 AND purpose = $2 AND status = 'active'", [tenantId, purpose]);
    if (exists.rows.length) continue;
    const { wrapped, kekRef } = await kms.wrap(newDek());
    await admin.query("INSERT INTO vault.key_versions (tenant_id, purpose, wrapped_dek, kek_ref, algorithm) VALUES ($1, $2, $3, $4, $5)",
      [tenantId, purpose, wrapped, kekRef, purpose === "identity" ? "AES-256-GCM" : "HMAC-SHA256"]);
  }
  return loadKeyring(admin, tenantId, kms);
}

export async function loadKeyring(admin: Queryable, tenantId: string, kms: KeyProvider): Promise<Keyring> {
  const rows = (await admin.query<{ id: number; purpose: string; wrapped_dek: Uint8Array; kek_ref: string; status: string }>(
    "SELECT id, purpose, wrapped_dek, kek_ref, status FROM vault.key_versions WHERE tenant_id = $1 AND status IN ('active','decrypt_only')", [tenantId])).rows;
  const get = async (p: string) => { const r = rows.find((x) => x.purpose === p && x.status === "active"); if (!r) throw new Error(`Etkin anahtar yok: ${p}`); return { key: await kms.unwrap(Buffer.from(r.wrapped_dek), r.kek_ref), id: r.id }; };
  const identity = await get("identity");
  const identityVersions=new Map<number,Buffer>();
  for(const r of rows.filter(x=>x.purpose==="identity"))identityVersions.set(r.id,await kms.unwrap(Buffer.from(r.wrapped_dek),r.kek_ref));
  return { identity: identity.key, pseudonym: (await get("pseudonym")).key, blindIndex: (await get("blind_index")).key, identityKeyVersion: identity.id, identityVersions };
}

/** Kimlik anahtarı rotasyonu: yeni anahtar etkin olur; eskisi yalnız çözme için kalır. */
export async function rotateIdentityKey(admin: Database, tenantId: string, kms: KeyProvider) {
 const {wrapped,kekRef}=await kms.wrap(newDek());
 await admin.transaction(async tx=>{
  await tx.query("SELECT id FROM vault.key_versions WHERE tenant_id=$1 AND purpose='identity' AND status='active' FOR UPDATE",[tenantId]);
  await tx.query("UPDATE vault.key_versions SET status='decrypt_only' WHERE tenant_id=$1 AND purpose='identity' AND status='active'",[tenantId]);
  await tx.query("INSERT INTO vault.key_versions(tenant_id,purpose,wrapped_dek,kek_ref) VALUES($1,'identity',$2,$3)",[tenantId,wrapped,kekRef]);
  await tx.query("INSERT INTO audit.events(tenant_id,actor,action,resource) VALUES($1,'yonetici','security.key_rotated','vault.identity')",[tenantId]);
 });
}
