// K8: Ekran kapalıyken de çalışan bildirim (web push, ücretsiz; SMS sağlayıcısı ayrı bir karardır).
//
// Gizlilik: push servisine (Google, Apple, Mozilla) bildirim içeriği GÖNDERİLMEZ. Telefona yalnız boş bir
// "yeni bildirim var" sinyali gider; servis çalışanı (public/sw.js) başlığı oturumla /api/notifications'tan okur.
// Bu yüzden şifreli yük (RFC 8291) gerekmez; yalnız VAPID imzası (RFC 8292) kullanılır.
//
// Anahtarlar ortam değişkenidir (KLINORBIS_VAPID_PUBLIC_KEY, KLINORBIS_VAPID_PRIVATE_KEY, KLINORBIS_VAPID_SUBJECT);
// koda veya depoya yazılmaz. Anahtar yoksa özellik "kapalı" görünür, açıkmış gibi gösterilmez.
import { SecurityError } from "./security";

type VapidEnv = { vapidPublicKey?: string; vapidPrivateKey?: string; vapidSubject?: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const db = () => {
  const d = (globalThis as typeof globalThis & { __KLINORBIS_DB?: D1Database }).__KLINORBIS_DB;
  if (!d) throw new SecurityError(503, "Veritabanı kullanılamıyor.", "DATABASE_UNAVAILABLE");
  return d;
};

export function vapidConfig(): Vapid | null {
  const env = ((globalThis as typeof globalThis & { __KLINORBIS_SECURITY_ENV?: VapidEnv }).__KLINORBIS_SECURITY_ENV ?? {}) as VapidEnv;
  const publicKey = env.vapidPublicKey?.trim(), privateKey = env.vapidPrivateKey?.trim();
  if (!publicKey || !privateKey) return null;
  if (b64urlDecode(publicKey).length !== 65 || b64urlDecode(privateKey).length !== 32) return null;
  const subject = env.vapidSubject?.trim() || "mailto:bildirim@klinorbis.invalid";
  return { publicKey, privateKey, subject };
}

// Yalnız bilinen tarayıcı push servislerine istek atılır (sunucu tarafı istek sahteciliğine karşı).
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
export function allowedEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith("." + h)) ? url.toString() : null;
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return new Uint8Array(); }
}
export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** VAPID (RFC 8292) imzalı Authorization başlığı. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${vapid.publicKey}`;
}

/** Kişinin cihazını kaydeder. Eski bildirimler için sinyal gitmez (yalnız bundan sonrakiler). Kişi başına en çok 5 cihaz. */
export async function subscribe(email: string, endpoint: string, now = Date.now()) {
  await db().batch([
    db().prepare(`INSERT INTO push_subscriptions(email,endpoint,last_notified_id,created_at)
      VALUES(?,?,(SELECT coalesce(max(id),0) FROM staff_notifications WHERE email=?),?)
      ON CONFLICT(endpoint) DO UPDATE SET email=excluded.email,last_notified_id=excluded.last_notified_id,failures=0,created_at=excluded.created_at`).bind(email, endpoint, email, now),
    db().prepare(`DELETE FROM push_subscriptions WHERE email=? AND id NOT IN (SELECT id FROM push_subscriptions WHERE email=? ORDER BY created_at DESC,id DESC LIMIT 5)`).bind(email, email),
  ]);
}
/** Yalnız kişinin kendi cihaz kaydı silinir. */
export async function unsubscribe(email: string, endpoint: string) {
  const r = await db().prepare("DELETE FROM push_subscriptions WHERE email=? AND endpoint=?").bind(email, endpoint).run();
  return Number(r.meta?.changes ?? 0);
}
export async function deviceCount(email: string) {
  return Number(await db().prepare("SELECT count(*) AS n FROM push_subscriptions WHERE email=?").bind(email).first("n") ?? 0);
}

/**
 * Okunmamış yeni bildirimi olan her cihaza tek sinyal gönderir (birden çok bildirim tek sinyalde birleşir).
 * Önce cihaz satırı koşullu güncellenerek "sahiplenilir"; eşzamanlı iki tur aynı sinyali iki kez göndermez.
 * 404/410 dönen (kaldırılmış) abonelik silinir; sürekli hata veren abonelik 20 denemeden sonra silinir.
 */
export async function dispatchPush(send: Fetcher = (u, i) => fetch(u, i), now = Date.now(), limit = 50) {
  const vapid = vapidConfig();
  if (!vapid) return { sent: 0, removed: 0, configured: false };
  const due = (await db().prepare(`SELECT * FROM (SELECT p.id,p.endpoint,p.last_notified_id AS last,
      (SELECT max(n.id) FROM staff_notifications n WHERE n.email=p.email AND n.read_at IS NULL) AS top
      FROM push_subscriptions p) WHERE top>last ORDER BY id LIMIT ?`).bind(limit).all<{ id: number; endpoint: string; last: number; top: number }>()).results;
  let sent = 0, removed = 0;
  for (const s of due) {
    const claimed = await db().prepare("UPDATE push_subscriptions SET last_notified_id=?,last_sent_at=? WHERE id=? AND last_notified_id<?").bind(s.top, now, s.id, s.top).run();
    if (!Number(claimed.meta?.changes ?? 0)) continue;
    if (!allowedEndpoint(s.endpoint)) { await db().prepare("DELETE FROM push_subscriptions WHERE id=?").bind(s.id).run(); removed++; continue; }
    try {
      const res = await send(s.endpoint, { method: "POST", headers: { Authorization: await vapidAuthorization(s.endpoint, vapid, now), TTL: "3600", Urgency: "high", "Content-Length": "0" } });
      if (res.status === 404 || res.status === 410) { await db().prepare("DELETE FROM push_subscriptions WHERE id=?").bind(s.id).run(); removed++; continue; }
      if (!res.ok) throw new Error(String(res.status));
      await db().prepare("UPDATE push_subscriptions SET failures=0 WHERE id=?").bind(s.id).run();
      sent++;
    } catch {
      // Sinyal gitmediyse sahiplenme geri alınır; bir sonraki tur yeniden dener.
      await db().prepare("UPDATE push_subscriptions SET failures=failures+1,last_notified_id=CASE WHEN last_notified_id=? THEN ? ELSE last_notified_id END WHERE id=?").bind(s.top, s.last, s.id).run();
      await db().prepare("DELETE FROM push_subscriptions WHERE id=? AND failures>=20").bind(s.id).run();
    }
  }
  return { sent, removed, configured: true };
}
