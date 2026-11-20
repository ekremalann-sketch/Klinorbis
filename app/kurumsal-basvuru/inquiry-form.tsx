"use client";
import Link from "next/link";
import { useState } from "react";

const TYPES = ["Özel hastane", "Devlet hastanesi", "Şehir hastanesi", "Üniversite hastanesi", "Tıp merkezi / poliklinik", "Hastane grubu", "Diğer"];

export default function InquiryForm() {
  const [f, setF] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (done) return <div className="kh-ok-box" role="status"><b>Talebiniz alındı.</b> Başvuru numaranız <b>{done}</b>. En geç 2 iş günü içinde verdiğiniz e-posta adresinden dönüş yapılacaktır.</div>;
  return <form className="kh-form" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, consent }) });
      const d = await r.json().catch(() => ({})) as { reference?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Talep gönderilemedi.");
      setDone(d.reference ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : "Talep gönderilemedi."); } finally { setBusy(false); }
  }}>
    <div className="kh-two">
      <label>Kurum adı<input required minLength={2} maxLength={120} value={f.institution ?? ""} onChange={set("institution")} autoComplete="organization" /></label>
      <label>Kurum türü<select required value={f.institutionType ?? ""} onChange={set("institutionType")}><option value="" disabled>Seçin</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
    </div>
    <div className="kh-two">
      <label>Ad soyad<input required minLength={2} maxLength={80} value={f.contactName ?? ""} onChange={set("contactName")} autoComplete="name" /></label>
      <label>Unvan<input maxLength={80} value={f.title ?? ""} onChange={set("title")} autoComplete="organization-title" /></label>
    </div>
    <div className="kh-two">
      <label>Kurumsal e-posta<input required type="email" maxLength={120} value={f.email ?? ""} onChange={set("email")} autoComplete="email" /></label>
      <label>Telefon<input type="tel" maxLength={20} value={f.phone ?? ""} onChange={set("phone")} autoComplete="tel" /></label>
    </div>
    <label>Yatak sayısı (yaklaşık)<input maxLength={20} inputMode="numeric" value={f.bedCount ?? ""} onChange={set("bedCount")} /></label>
    <label>İhtiyacınız<textarea maxLength={1500} value={f.message ?? ""} onChange={set("message")} placeholder="Örneğin: poliklinik ve tetkik akışı, acil servis, yatış ve taburculuk süreçleri" /></label>
    <label className="kh-hp" aria-hidden="true">Web sitesi<input tabIndex={-1} autoComplete="off" value={f.website ?? ""} onChange={set("website")} /></label>
    <label className="kh-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span><Link href="/aydinlatma">Aydınlatma metnini</Link> okudum. Verdiğim iletişim bilgileri yalnız bu talebe dönüş için kullanılır ve 180 gün sonra silinir.</span></label>
    {error && <p className="kh-err-box" role="alert">{error}</p>}
    <div><button type="submit" className="kh-btn" disabled={busy}>{busy ? "Gönderiliyor…" : "Talebi gönder"}</button></div>
  </form>;
}
