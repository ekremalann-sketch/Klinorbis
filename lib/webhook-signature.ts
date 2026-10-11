// PBX: yalnız HMAC-SHA256(secret, timestamp.eventId.body).
export type SignatureScheme = "v2";

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function verifyPbxSignature(input: { secret: string; timestamp: string; eventId: string; rawBody: string; signature: string }): Promise<SignatureScheme | null> {
  const supplied = input.signature.toLowerCase();
  const v2 = await hmacHex(input.secret, `${input.timestamp}.${input.eventId}.${input.rawBody}`);
  if (constantTimeEqual(supplied, v2)) return "v2";
  return null;
}

/** İmzalanmış içerikten türetilen tekrar anahtarı (event-id'den bağımsız). */
export async function replayKey(timestamp: string, rawBody: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return `pbx-replay:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
