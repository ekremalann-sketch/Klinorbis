"use client";
// Hasta başvuru takibi: fişteki takip kodu ve PIN ile hastanın kendi süreci.
// Ad, kimlik no, tanı veya personel bilgisi gösterilmez; yalnız birim, adım, durum ve sıra.
import { useEffect, useState } from "react";
import "../journeys.css";

type Status = { status: string; statusText: string; pathway: string; startedAt: number | null; updatedAt: number | null;
  current: { unit: string; label: string; state: string; ahead: number | null; typicalMinutes: number } | null;
  steps: { unit: string; label: string; state: string; stateText: string; at: number | null }[] };
const hm = (t: number | null) => (t ? new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "");

export default function Tracking() {
  const [code, setCode] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("kod") ?? "").slice(0, 12)));
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (silent = false) => {
    if (!silent) { setBusy(true); setError(""); }
    try {
      const r = await fetch("/api/takip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, pin }), cache: "no-store" });
      const d = await r.json().catch(() => ({})) as Status & { error?: string };
      if (!r.ok) { setData(null); setError(d.error ?? "Bilgi alınamadı."); return; }
      setData(d);
    } catch { if (!silent) setError("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin."); } finally { if (!silent) setBusy(false); }
  };

  // Sayfa açık kaldıkça durum 30 sn'de bir yenilenir (süreç bitince durur).
  useEffect(() => {
    if (!data || data.status !== "active") return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 30_000);
    return () => window.clearInterval(id);
  });

  return <section className="tk" aria-labelledby="tk-title">
    <h1 id="tk-title">Başvuru takibi</h1>
    <p>Hasta kabulde verilen fişteki takip kodu ve 6 haneli PIN ile hangi birimde olduğunuzu, sıranızı ve sonraki adımı görün.</p>
    <form onSubmit={(e) => { e.preventDefault(); void load(); }}>
      <label>Takip kodu<input suppressHydrationWarning value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EF23" required maxLength={12} autoComplete="off" inputMode="text" /></label>
      <label>PIN<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" required maxLength={6} inputMode="numeric" type="password" autoComplete="off" /></label>
      <button type="submit" disabled={busy}>{busy ? "Sorgulanıyor…" : "Göster"}</button>
    </form>
    {error && <p className="tk-error" role="alert">{error}</p>}
    {data && <>
      <div className="tk-now" role="status" aria-live="polite">
        <small>{data.pathway} · {data.statusText}</small>
        {data.current ? <>
          <h2>{data.current.unit}</h2>
          <p>{data.current.label} — {data.current.state}{data.current.ahead !== null ? ` · önünüzde ${data.current.ahead} kişi var` : ""}</p>
          <p><small>Bu birimde hedef karşılama süresi {data.current.typicalMinutes} dakikadır.</small></p>
        </> : <h2>{data.status === "completed" ? "İşlemleriniz tamamlandı. Geçmiş olsun." : "Lütfen danışmaya başvurun."}</h2>}
      </div>
      <ol className="tk-line">{data.steps.map((s, i) => <li key={i} className={s.state}><b>{s.unit}</b><span>{s.label} · {s.stateText}{s.at ? ` · ${hm(s.at)}` : ""}</span></li>)}</ol>
    </>}
    <p className="tk-note">Bu ekranda tanı, tahlil sonucu veya kişisel bilgi gösterilmez. Sonuçlarınız için e-Nabız veya hastanenin hasta portalını kullanın. Acil bir durumda 112&apos;yi arayın.</p>
  </section>;
}
