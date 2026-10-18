"use client";
// Yönetim görünümleri (Operasyon Akışları ekranındaki sekmeler):
//  - İş yükü: birim başına açık/geciken iş, kişi başı yük, "işi kime verelim" önerisi ve tek tıkla atama
//  - Haftalık rapor: "nerede zaman ve para kaybediyoruz?" (son 7 gün, önceki haftayla karşılaştırma, yazdırılabilir)
import { useCallback, useEffect, useState } from "react";

type Member = { email: string; label: string; open: number };
type UnitLoad = { unitCode: string; unitName: string; open: number; overdue: number; escalated: number; people: number; perPersonAvg: number; level: "kimse-yok" | "yogun" | "normal" | "sakin"; members: Member[]; unassigned: { reference: string; overdue: boolean; priority: string }[]; canAssign: boolean };
type Workload = { units: UnitLoad[]; suggestions: { unitCode: string; unitName: string; reference: string; to: string; toLabel: string; reason: string }[]; shortStaffed?: string[]; canAssign: boolean; threshold: number };
type Weekly = {
  period: { from: string; to: string };
  current: { runs: number; done: number; cancelled: number; automatic: number; completedSteps: number; lateSteps: number; overHours: number; onTimeRate: number | null; escalated: number | null; chainsSkipped: number | null };
  previous: { runs: number; lateSteps: number; overHours: number; onTimeRate: number | null };
  change: { runs: number | null; overHours: number | null; onTimeRate: number | null };
  bottlenecks: { unitCode: string; unitName: string; lateSteps: number; overHours: number; stillOpen: number }[];
  slowest: { code: string; title: string; done: number; ratio: number }[];
  money: { followUpHours: number; costTL: number; assumptions: { followUpMinutesPerLateStep: number; staffHourlyCostTL: number }; note: string };
  advice: string[];
};
const LEVEL: Record<UnitLoad["level"], string> = { "kimse-yok": "Personel yok", yogun: "Yoğun", normal: "Normal", sakin: "Sakin" };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}

export function WorkloadView() {
  const [data, setData] = useState<Workload | null>(null);
  const [err, setErr] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [open, setOpen] = useState("");
  const load = useCallback(() => call<Workload>("/api/workload").then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Bilgi alınamadı.")), []);
  useEffect(() => { void load(); }, [load]);
  async function assign(reference: string, email: string, label: string) {
    setBusy(true); setErr(""); setMsg("");
    try { await call("/api/workload", { action: "assign", reference, email }); setMsg(`${reference} → ${label} atandı; kişiye bildirim gitti.`); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Atanamadı."); } finally { setBusy(false); }
  }
  if (!data) return <p role={err ? "alert" : "status"}>{err || "Yükleniyor…"}</p>;
  return <section className="mg-panel" aria-label="Personel iş yükü">
    <p className="pb-hint">Kişi başı {data.threshold} veya daha fazla açık iş ya da 3+ geciken iş olan birim “yoğun” sayılır. Öneriler yalnız öneridir; atamayı birim sorumlusu veya operasyon yöneticisi yapar.</p>
    <p className="pb-msg" role="status">{msg}</p>{err && <p className="pb-err" role="alert">{err}</p>}
    {!!data.shortStaffed?.length && <p className="sim-warn" role="alert">Açık işi olup etkin personeli olmayan birim: {data.shortStaffed.join(", ")}. Personel ve Yetki ekranından üye ekleyin.</p>}
    {data.suggestions.length > 0 && <div className="mg-suggest"><h3>Önerilen atamalar</h3><ul>{data.suggestions.map((s) => <li key={s.reference}><span>{s.reason}</span>
      <button type="button" className="pb-primary" disabled={busy} onClick={() => void assign(s.reference, s.to, s.toLabel)}>{s.reference} → {s.toLabel}</button></li>)}</ul></div>}
    <table className="pb-table"><thead><tr><th>Birim</th><th>Durum</th><th>Açık iş</th><th>Geciken</th><th>Personel</th><th>Kişi başı</th><th></th></tr></thead><tbody>
      {data.units.map((u) => <tr key={u.unitCode} className={u.level === "yogun" || u.level === "kimse-yok" ? "bad" : ""}>
        <td><b>{u.unitName}</b> <small>{u.unitCode}</small>{open === u.unitCode && <div className="mg-members">
          {u.members.map((m) => <span key={m.email}>{m.label}: <b>{m.open}</b></span>)}
          {u.canAssign && u.unassigned.map((t) => <label key={t.reference}>{t.reference}{t.overdue ? " · gecikti" : ""}
            <select defaultValue="" disabled={busy} onChange={(e) => { const m = u.members.find((x) => x.email === e.target.value); if (m) void assign(t.reference, m.email, m.label); }}><option value="">Kime verilsin?</option>{u.members.map((m) => <option key={m.email} value={m.email}>{m.label} ({m.open})</option>)}</select></label>)}
        </div>}</td>
        <td><span className={`mg-level ${u.level}`}>{LEVEL[u.level]}</span></td><td>{u.open}</td><td>{u.overdue}</td><td>{u.people}</td><td>{u.perPersonAvg}</td>
        <td><button type="button" className="pb-linkbtn" onClick={() => setOpen(open === u.unitCode ? "" : u.unitCode)}>{open === u.unitCode ? "Kapat" : "Kişiler"}</button></td>
      </tr>)}
    </tbody></table>
  </section>;
}

export function WeeklyReportView() {
  const [data, setData] = useState<Weekly | null>(null);
  const [err, setErr] = useState(""), [cost, setCost] = useState(400), [follow, setFollow] = useState(6);
  const load = useCallback(() => call<Weekly>(`/api/weekly-report?cost=${cost}&followup=${follow}`).then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Rapor alınamadı.")), [cost, follow]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <p role={err ? "alert" : "status"}>{err || "Yükleniyor…"}</p>;
  const c = data.current, d = data.change;
  const day = (v: string) => new Date(v).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });
  const sign = (v: number | null, unit = "") => (v === null ? "" : v === 0 ? " (değişmedi)" : ` (${v > 0 ? "+" : ""}${v}${unit} geçen haftaya göre)`);
  return <article className="mg-panel weekly" aria-label="Haftalık yönetim raporu">
    <header className="mg-head"><div><h3>Haftalık yönetim raporu</h3><p className="pb-hint">{day(data.period.from)} – {day(data.period.to)} · Klinorbis üzerinden yürüyen akışlar</p></div><button type="button" onClick={() => window.print()}>Yazdır</button></header>
    <div className="pb-kpis">
      <div><b>{c.runs}</b><span>başlatılan akış{sign(d.runs)}</span></div>
      <div><b>{c.onTimeRate === null ? "—" : `%${c.onTimeRate}`}</b><span>hedef sürede biten adım{sign(d.onTimeRate, " puan")}</span></div>
      <div className={c.overHours ? "bad" : ""}><b>{c.overHours} sa</b><span>hedefi aşan toplam bekleme{sign(d.overHours, " sa")}</span></div>
      <div><b>{c.lateSteps}</b><span>geciken adım</span></div>
      {c.escalated !== null && <div><b>{c.escalated}</b><span>yöneticiye yükselen iş</span></div>}
      <div><b>{c.automatic}</b><span>olay/zincirle kendiliğinden başlayan</span></div>
    </div>
    <section className="mg-money"><h4>Zaman ve para</h4>
      <p>Geciken adımların takibi için tahmini <b>{data.money.followUpHours} saat</b> personel zamanı ≈ <b>{data.money.costTL.toLocaleString("tr-TR")} TL</b>.</p>
      <div className="mg-assume"><label>Saatlik personel maliyeti (TL)<input type="number" min={50} max={5000} value={cost} onChange={(e) => setCost(Number(e.target.value) || 400)} /></label>
        <label>Gecikme başına takip (dk)<input type="number" min={1} max={60} value={follow} onChange={(e) => setFollow(Number(e.target.value) || 6)} /></label></div>
      <p className="pb-hint">{data.money.note}</p></section>
    <h4>En çok bekleten birimler</h4>
    {data.bottlenecks.length ? <table className="pb-table"><thead><tr><th>Birim</th><th>Geciken adım</th><th>Hedefi aşan bekleme</th><th>Hâlâ açık</th></tr></thead><tbody>
      {data.bottlenecks.map((b) => <tr key={b.unitCode}><td><b>{b.unitName}</b></td><td>{b.lateSteps}</td><td>{b.overHours} sa</td><td>{b.stillOpen}</td></tr>)}</tbody></table> : <p className="pb-hint">Bu hafta hedef süreyi aşan adım yok.</p>}
    <h4>Hedefinden uzun süren akışlar</h4>
    {data.slowest.length ? <table className="pb-table"><thead><tr><th>Akış</th><th>Tamamlanan</th><th>Süre / hedef</th></tr></thead><tbody>
      {data.slowest.map((p) => <tr key={p.code}><td>{p.title}</td><td>{p.done}</td><td>{p.ratio} kat</td></tr>)}</tbody></table> : <p className="pb-hint">Hedefinden uzun süren akış yok.</p>}
    {data.advice.length > 0 && <><h4>Öneriler</h4><ul className="sim-summary">{data.advice.map((a) => <li key={a}>{a}</li>)}</ul></>}
  </article>;
}
