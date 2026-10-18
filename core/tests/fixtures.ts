// Sentetik test kimlikleri: kontrol hanesi algoritmasına uyan ama gerçek bir kişiye ait olmayan, rastgele üretilmiş
// numaralar ve açıkça kurgusal adlar. Gerçek kişisel veri kullanılmaz.
import { randomBytes } from "node:crypto";
import { localKeyProvider, newDek, type Keyring } from "../src/crypto.ts";

export function syntheticNationalId(seed: number) {
  const d = [9, 9, ...String(100000 + (seed % 899999)).padStart(7, "0").slice(-7).split("").map(Number)].slice(0, 9);
  const d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const d11 = ([...d, d10].reduce((a, b) => a + b, 0)) % 10;
  return [...d, d10, d11].join("");
}
export const testKeyring = (): Keyring => ({ identity: newDek(), pseudonym: newDek(), blindIndex: newDek(), identityKeyVersion: 1 });
export const testKek = () => localKeyProvider(randomBytes(32).toString("base64"));
export const FICTIONAL = { givenName: "Deneme", familyName: "Kurgusal" };
