"use client";
// K8: "Telefon bildirimi" — ekran kapalıyken de iş bildirimi. Tek ana düğme; deneme ve kapatma "Diğer işlemler" altında.
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "ios-install" | "not-configured" | "blocked" | "off" | "on";
const post = (body: unknown) => fetch("/api/push", { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
const keyBytes = (b64: string) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

/** Tarayıcı desteği, kurulum ve bu cihazın abonelik durumu. */
async function detect(): Promise<{ state: State; key: string | null }> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!supported) return { state: ios && !standalone ? "ios-install" : "unsupported", key: null };
  const res = await fetch("/api/push", { cache: "no-store" }).catch(() => null);
  const data = res?.ok ? await res.json() as { configured: boolean; publicKey: string | null } : null;
  if (!data?.configured || !data.publicKey) return { state: "not-configured", key: null };
  if (Notification.permission === "denied") return { state: "blocked", key: data.publicKey };
  const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
  return { state: sub ? "on" : "off", key: data.publicKey };
}

export function PhonePush() {
  const [state, setState] = useState<State>("loading"), [key, setKey] = useState<string | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void detect().then((r) => { if (!alive) return; setKey(r.key); setState(r.state); });
    return () => { alive = false; };
  }, []);

  async function enable() {
    if (!key) return;
    setBusy(true); setMsg("");
    try {
      if (await Notification.requestPermission() !== "granted") { setState("blocked"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const res = await post({ action: "subscribe", endpoint: sub.endpoint });
      if (!res.ok) { await sub.unsubscribe().catch(() => undefined); throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Açılamadı."); }
      setState("on"); setMsg("Açıldı. Size iş düştüğünde telefon kilitliyken de bildirim gelir.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Açılamadı."); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg("");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (sub) { await post({ action: "unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setState("off"); setMsg("Bu cihazda telefon bildirimi kapatıldı.");
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMsg("");
    try { const r = await post({ action: "test" }); setMsg(r.ok ? "Deneme gönderildi. Birkaç saniye içinde gelmeli." : "Deneme gönderilemedi."); } finally { setBusy(false); }
  }

  const text: Record<State, string> = {
    loading: "",
    unsupported: "Bu tarayıcı telefon bildirimini desteklemiyor.",
    "ios-install": "iPhone’da önce Paylaş → “Ana Ekrana Ekle” ile Klinorbis’i ekleyin, sonra oradan açıp bu düğmeyi kullanın.",
    "not-configured": "Telefon bildirimi bu kurulumda henüz açılmadı. Sistem yöneticisi bildirim anahtarlarını eklemeli.",
    blocked: "Bildirim izni bu tarayıcıda kapalı. Tarayıcı ayarlarından Klinorbis için bildirime izin verin.",
    off: "Ekran kapalıyken de size düşen işler için bildirim alın.",
    on: "Telefon bildirimi bu cihazda açık.",
  };
  if (state === "loading") return null;
  return (
    <div className="phone-push" aria-live="polite">
      <small>{text[state]}</small>
      {state === "off" && <button type="button" className="pop-mark" disabled={busy} onClick={() => void enable()}>Telefon bildirimini aç</button>}
      {state === "on" && <details><summary>Diğer işlemler</summary>
        <button type="button" disabled={busy} onClick={() => void test()}>Deneme bildirimi gönder</button>
        <button type="button" disabled={busy} onClick={() => void disable()}>Bu cihazda kapat</button>
      </details>}
      {msg && <small role="status">{msg}</small>}
    </div>
  );
}
