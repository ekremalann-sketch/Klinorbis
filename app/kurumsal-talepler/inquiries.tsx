"use client";
import Link from "next/link";
import { ApiError, Receipt, StateBox, useLive } from "../work-ui";
import { useState } from "react";
import "../journeys.css";

type Row = { reference: string; institution: string; contactName: string; title: string | null; email: string; phone: string | null; institutionType: string; bedCount: string | null; message: string | null; status: string; createdAt: number; handledBy: string | null };

export default function Inquiries() {
  const live = useLive<{ inquiries: Row[] }>("/api/inquiries", 60_000);
  const [msg, setMsg] = useState("");
  const mark = async (reference: string) => {
    try {
      const r = await fetch("/api/inquiries", { method: "PATCH", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify({ reference }) });
      if (!r.ok) throw new ApiError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "İşlenemedi.", "ERR", r.status);
      setMsg("Talep görüşüldü olarak işaretlendi."); await live.reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  return <main className="hs">
    <div className="hs-top"><div><Link href="/merkez" className="hs-crumb">← Operasyon merkezi</Link><h1>Kurumsal görüşme talepleri</h1><p>Herkese açık formdan gelen talepler. 180 gün sonra otomatik silinir.</p></div></div>
    <Receipt text={msg} onClose={() => setMsg("")} />
    <StateBox live={live} empty={!live.data?.inquiries.length} emptyText="Henüz talep yok.">
      <div className="hs-list">{live.data?.inquiries.map((r) => <article key={r.reference} className="hs-card">
        <header><b>{r.institution}</b><span>{r.institutionType}{r.bedCount ? ` · ${r.bedCount} yatak` : ""} · {r.reference}</span><span>{new Date(r.createdAt).toLocaleString("tr-TR")}</span></header>
        <p>{r.contactName}{r.title ? ` · ${r.title}` : ""} · <a href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</p>
        {r.message && <p>{r.message}</p>}
        {r.status === "new" ? <button type="button" className="hs-btn primary" onClick={() => void mark(r.reference)}>Görüşüldü olarak işaretle</button> : <p className="hs-crumb">Görüşüldü · {r.handledBy}</p>}
      </article>)}</div>
    </StateBox>
  </main>;
}
