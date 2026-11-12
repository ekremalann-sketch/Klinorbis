// K8: Telefon bildirimi için VAPID anahtar çifti üretir (yerelde, ücretsiz). Çıktıyı DEPOYA YAZMAYIN;
// barındırma panelinde gizli ortam değişkeni olarak girin:
//   KLINORBIS_VAPID_PUBLIC_KEY, KLINORBIS_VAPID_PRIVATE_KEY, KLINORBIS_VAPID_SUBJECT (ör. mailto:bt@hastane.example)
import { generateKeyPairSync } from "node:crypto";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" }), priv = privateKey.export({ format: "jwk" });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
console.log(`KLINORBIS_VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
console.log(`KLINORBIS_VAPID_PRIVATE_KEY=${priv.d}`);
