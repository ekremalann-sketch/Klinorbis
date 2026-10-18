// Kimlik kasası işlemleri: kaydetme (köprü) ve gerekçeli geri dönüş (yetkili personel).
import { open, seal, blindIndex, pseudonymToken, validNationalId, type Keyring } from "./crypto.ts";
import type { Queryable } from "./db.ts";

export type IdentityInput = { nationalId: string; givenName: string; familyName: string };

/** Kimliği şifreleyip kasaya yazar, takma ad belirtecini döndürür. Geçersiz TCKN kabul edilmez. */
export async function registerIdentity(tx: Queryable, tenantId: string, keys: Keyring, id: IdentityInput) {
  if (!validNationalId(id.nationalId)) throw new Error("TCKN biçimi geçersiz");
  const token = pseudonymToken(keys.pseudonym, tenantId, id.nationalId);
  const bidx = blindIndex(keys.blindIndex, tenantId, id.nationalId);
  const plaintext = Buffer.from(JSON.stringify({ n: id.nationalId, g: id.givenName.trim(), f: id.familyName.trim() }), "utf8");
  const sealed = seal(keys.identity, plaintext, Buffer.from(`${tenantId}|identity|${token}`));
  const r = await tx.query<{ token: string }>("SELECT kb.register_identity($1, $2, $3, $4) AS token", [token, bidx, sealed, keys.identityKeyVersion]);
  return r.rows[0].token;
}

/** Gerekçeli geri dönüş: veritabanı yalnız şifreli metni verir; çözme burada, bellekte yapılır. Her çağrı kayıtlıdır. */
export async function reidentify(tx: Queryable, tenantId: string, keys: Keyring, token: string, reason: string) {
  const r = await tx.query<{ identity_ciphertext: Uint8Array; key_version: number }>("SELECT * FROM kb.reidentify($1, $2)", [token, reason]);
  if (!r.rows.length) return null;
  const key=keys.identityVersions?.get(r.rows[0].key_version)??(r.rows[0].key_version===keys.identityKeyVersion?keys.identity:null);
  if(!key)throw new Error("Kimlik anahtar sürümü yüklenmedi");
  const plain = open(key, Buffer.from(r.rows[0].identity_ciphertext), Buffer.from(`${tenantId}|identity|${token}`));
  const o = JSON.parse(plain.toString("utf8")) as { n: string; g: string; f: string };
  return { nationalId: o.n, givenName: o.g, familyName: o.f };
}

/** Ekranda gösterim için maske: "Ay*** Yı***", TCKN "1******89". */
export function maskIdentity(id: { nationalId: string; givenName: string; familyName: string }) {
  const m = (s: string) => (s.length <= 2 ? `${s[0] ?? ""}*` : `${s.slice(0, 2)}***`);
  return { name: `${m(id.givenName)} ${m(id.familyName)}`, nationalId: `${id.nationalId[0]}******${id.nationalId.slice(-2)}` };
}
