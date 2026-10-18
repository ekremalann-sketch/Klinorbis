// Kriptografi: takma ad belirteci (HMAC), kör indeks (aranabilir ama geri çevrilemez), zarf şifreleme (AES-256-GCM).
// Ana anahtar (KEK) üretimde KMS/HSM'dedir; burada KeyProvider arayüzüyle soyutlanır. Veritabanına yalnız sarılmış
// (şifreli) veri anahtarı ve şifreli metin yazılır; düz metin kimlik veritabanına hiç girmez.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface KeyProvider {
  /** Veri anahtarını ana anahtarla sarar (KMS "encrypt"). */
  wrap(dek: Buffer): Promise<{ wrapped: Buffer; kekRef: string }>;
  /** Sarılmış veri anahtarını açar (KMS "decrypt"). */
  unwrap(wrapped: Buffer, kekRef: string): Promise<Buffer>;
}

/** Yerel deneme/test anahtar sağlayıcısı: KEK ortam değişkeninden (32 bayt, base64). Üretimde HSM/KMS kullanın. */
export function localKeyProvider(kekBase64: string, kekRef = "local-kek-v1"): KeyProvider {
  const kek = Buffer.from(kekBase64, "base64");
  if (kek.length !== 32) throw new Error("KEK 32 bayt olmalı");
  return {
    async wrap(dek) { return { wrapped: seal(kek, dek, Buffer.from(kekRef)), kekRef }; },
    async unwrap(wrapped, ref) { if (ref !== kekRef) throw new Error("Bilinmeyen KEK"); return open(kek, wrapped, Buffer.from(ref)); },
  };
}

const IV = 12, TAG = 16;
/** AES-256-GCM: çıktı = iv(12) | etiket(16) | şifreli metin. aad: bağlam (kurum, amaç) — başka bağlamda çözülemez. */
export function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const body = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
export function open(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length < IV + TAG + 1) throw new Error("Şifreli veri bozuk");
  const d = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, IV));
  d.setAAD(aad);
  d.setAuthTag(sealed.subarray(IV, IV + TAG));
  return Buffer.concat([d.update(sealed.subarray(IV + TAG)), d.final()]);
}

/** TCKN biçim ve kontrol hanesi doğrulaması (yalnız biçim; kişinin varlığını doğrulamaz). */
export function validNationalId(v: string) {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = [...v].map(Number);
  const d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return (d10 + 10) % 10 === d[9] && d11 === d[10];
}

/** Kör indeks: aynı kimlik aynı değeri verir (tekilleştirme ve arama), anahtarsız geri çevrilemez. */
export function blindIndex(key: Buffer, tenantId: string, value: string) {
  return createHmac("sha256", key).update(`${tenantId}|bidx|${value.normalize("NFC").trim()}`).digest("hex");
}

/** Takma ad belirteci: kurum ve anahtarla HMAC; kısaltılmış, okunabilir "P-XXXXXXXXXX". */
export function pseudonymToken(key: Buffer, tenantId: string, value: string) {
  return `P-${createHmac("sha256", key).update(`${tenantId}|token|${value.normalize("NFC").trim()}`).digest("hex").slice(0, 12).toUpperCase()}`;
}

/** HBYS ziyaret/protokol numarası gibi dış kimliklerin anahtarlı karması. */
export function keyedHash(key: Buffer, tenantId: string, purpose: string, value: string) {
  return createHmac("sha256", key).update(`${tenantId}|${purpose}|${value}`).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Kurum anahtar halkası: amaç başına veri anahtarı (DEK) — açılmış hâli yalnız bellekte tutulur. */
export type Keyring = { identity: Buffer; pseudonym: Buffer; blindIndex: Buffer; identityKeyVersion: number; identityVersions?: Map<number, Buffer> };
export function newDek() { return randomBytes(32); }
