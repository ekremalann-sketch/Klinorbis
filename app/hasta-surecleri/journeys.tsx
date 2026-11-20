"use client";
// Hasta süreçleri: başvurudan çıkışa hastanın birimler arasındaki yolculuğu.
//  - Birimim sırası: kendi birimime düşen hastalar; "Başla", "Tamamla", "Reddet / aktar", "Tetkik ekle".
//  - Hastane akış panosu: her birimde kaç hasta bekliyor, işlemde, süresi aşıldı (kişisel veri yok).
//  - Tüm süreçler: yolu benim birimimden geçen hastaların baştan sona bütün adımları.
// Yetki sunucuda denetlenir; ekran yalnız sunucunun izin verdiği düğmeleri gösterir.
import Link from "next/link";
import { useMemo, useState } from "react";
import { qrSvg } from "../yatak/qr/qr-labels";
import { api, ApiError, FormDialog, Receipt, StaleBanner, StateBox, useLive } from "../work-ui";
import "../journeys.css";

type Step = { seq: number; unitCode: string; unitName: string; label: string; kind: string; optional: boolean; state: string; enteredAt: number | null; startedAt: number | null; finishedAt: number | null; note: string | null; rejectTo: string | null; overdue: boolean; slaMinutes: number };
type Journey = { reference: string; alias: string; pathway: string; clinic: string; status: string; version: number; createdAt: number | null; closedAt: number | null; closeReason: string | null; progress: number; steps: Step[]; current: Step | null;
  can: { start: boolean; complete: boolean; skip: boolean; reject: boolean; add: boolean; cancel: boolean } | null };
type Board = { code: string; name: string; waiting: number; active: number; overdue: number; doneToday: number; avgMinutes: number | null };
type Data = { board: Board[]; journeys: Journey[]; myQueue: Journey[]; totals: { active: number; completedToday: number; overdue: number }; canOpen: boolean;
  pathways: { code: string; label: string; summary: string; clinics: { code: string; name: string }[] }[]; addable: { code: string; label: string }[];
  consultUnits: { code: string; name: string }[]; units: { code: string; name: string }[] };
type Opened = { reference: string; trackingCode: string; pin: string; firstUnit: string; pathway: string };
type Dialog = null | { kind: "open" } | { kind: "reject" | "add" | "cancel" | "skip"; j: Journey };

const STATE: Record<string, string> = { pending: "Sırada", waiting: "Bekliyor", active: "İşlemde", done: "Tamamlandı", rejected: "Aktarıldı", skipped: "Gerekmedi" };
const hm = (t: number | null) => (t ? new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—");
const since = (t: number | null) => { if (!t) return ""; const m = Math.max(0, Math.round((Date.now() - t) / 60_000)); return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`; };

export default function Journeys() {
  const live = useLive<Data>("/api/patient-journey", 15_000);
  const [tab, setTab] = useState<"queue" | "board" | "all">("queue");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [receipt, setReceipt] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const data = live.data;

  const act = async (j: Journey, action: string, extra: Record<string, unknown> = {}) => {
    const r = await api<{ next?: string }>("/api/patient-journey", { action, reference: j.reference, version: j.version, ...extra });
    setReceipt(r.next ? `${j.alias}: ${r.next}` : `${j.alias}: işlem kaydedildi.`);
    await live.reload();
  };
  const quick = async (j: Journey, action: "start" | "complete") => {
    setBusy(j.reference);
    try { await act(j, action); } catch (e) { setReceipt((e as ApiError).message); } finally { setBusy(null); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return (data?.journeys ?? []).filter((j) => (!q || j.alias.toLocaleLowerCase("tr-TR").includes(q) || j.reference.toLowerCase().includes(q))
      && (!unitFilter || j.steps.some((s) => s.unitCode === unitFilter)));
  }, [data, query, unitFilter]);

  const pathway = data?.pathways.find((p) => p.code === form.pathway);

  return <main className="hs">
    <div className="hs-top">
      <div><Link href="/merkez" className="hs-crumb">← Operasyon merkezi</Link><h1>Hasta süreçleri</h1><p>Başvurudan çıkışa her hastanın hangi birimde olduğu, ne kadar beklediği ve sıradaki adımı.</p></div>
      {data?.canOpen && <button type="button" className="hs-btn primary" onClick={() => { setForm({}); setDialog({ kind: "open" }); }}>+ Yeni hasta başvurusu</button>}
    </div>
    <StaleBanner live={live} />
    <Receipt text={receipt} onClose={() => setReceipt("")} />
    {opened && <Slip opened={opened} onClose={() => setOpened(null)} />}
    <StateBox live={live}>
      {data && <>
        <section className="hs-kpis" aria-label="Özet">
          <div className="hs-kpi"><b>{data.totals.active}</b><span>Süreci devam eden hasta</span></div>
          <div className="hs-kpi"><b>{data.myQueue.length}</b><span>Birimimde bekleyen</span></div>
          <div className={`hs-kpi${data.totals.overdue ? " alert" : ""}`}><b>{data.totals.overdue}</b><span>Hedef süresi aşılan adım</span></div>
          <div className="hs-kpi"><b>{data.totals.completedToday}</b><span>Son 24 saatte tamamlanan</span></div>
        </section>
        <div className="hs-tabs" role="tablist" aria-label="Görünüm">
          {([["queue", `Birimimin sırası (${data.myQueue.length})`], ["board", "Hastane akış panosu"], ["all", `Tüm süreçler (${data.journeys.length})`]] as const).map(([k, l]) =>
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === "queue" && (data.myQueue.length
          ? <div className="hs-list">{data.myQueue.map((j) => <JourneyCard key={j.reference} j={j} busy={busy === j.reference} onQuick={quick} onDialog={setDialog} />)}</div>
          : <p className="hs-empty">Biriminizde bekleyen hasta yok. Yeni hasta geldiğinde burada ve bildirimlerde görünür.</p>)}

        {tab === "board" && (data.board.length
          ? <div className="hs-board">{data.board.map((u) => <article key={u.code} className={`hs-unit${u.overdue ? " late" : ""}`}>
              <h3>{u.name}</h3>
              <dl><div><dt>Bekleyen</dt><dd>{u.waiting}</dd></div><div><dt>İşlemde</dt><dd>{u.active}</dd></div><div><dt>Süre aşımı</dt><dd>{u.overdue}</dd></div></dl>
              <small>Bugün tamamlanan {u.doneToday}{u.avgMinutes !== null ? ` · ortalama ${u.avgMinutes} dk` : ""}</small>
              <button type="button" className="hs-btn" onClick={() => { setUnitFilter(u.code); setTab("all"); }}>Hastaları göster</button>
            </article>)}</div>
          : <p className="hs-empty">Henüz açık hasta süreci yok. Hasta kabul ilk başvuruyu açtığında birimler burada görünür.</p>)}

        {tab === "all" && <>
          <div className="hs-filter">
            <input type="search" placeholder="Protokol no veya süreç no ara" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Ara" />
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label="Birime göre süz">
              <option value="">Tüm birimler</option>
              {data.units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
          {filtered.length
            ? <div className="hs-list">{filtered.map((j) => <JourneyCard key={j.reference} j={j} busy={busy === j.reference} onQuick={quick} onDialog={setDialog} />)}</div>
            : <p className="hs-empty">Bu süzgeçle eşleşen süreç yok.</p>}
        </>}

        <FormDialog open={dialog?.kind === "open"} title="Yeni hasta başvurusu" submitLabel="Süreci başlat" onClose={() => setDialog(null)}
          description="Hastaya bir takip kodu ve PIN verilir. Hasta bu bilgilerle telefonundan sürecini izler."
          onSubmit={async () => {
            const r = await api<Opened>("/api/patient-journey", { action: "open", pathway: form.pathway, clinicUnit: form.clinic, alias: form.alias });
            setOpened(r); setDialog(null); setReceipt(`${r.pathway} başladı. İlk adım: ${r.firstUnit}.`); await live.reload();
          }}>
          <div className="hs-form">
            <label>Başvuru türü<select required value={form.pathway ?? ""} onChange={(e) => setForm({ ...form, pathway: e.target.value, clinic: "" })}>
              <option value="" disabled>Seçin</option>{data.pathways.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
              {pathway && <span className="hint">{pathway.summary}</span>}</label>
            <label>Başvurulan birim<select required value={form.clinic ?? ""} onChange={(e) => setForm({ ...form, clinic: e.target.value })} disabled={!pathway}>
              <option value="" disabled>Seçin</option>{pathway?.clinics.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label>Protokol no / kısa kayıt adı<input required minLength={2} maxLength={40} value={form.alias ?? ""} onChange={(e) => setForm({ ...form, alias: e.target.value })} autoComplete="off" />
              <span className="hint">Ad-soyad, T.C. kimlik no veya telefon yazmayın; HBYS protokol numarasını girin. Yazılırsa otomatik maskelenir.</span></label>
          </div>
        </FormDialog>

        {dialog && dialog.kind !== "open" && <FormDialog open title={dialog.kind === "reject" ? "Reddet / başka birime aktar" : dialog.kind === "add" ? "Tetkik, işlem veya konsültasyon ekle" : dialog.kind === "skip" ? "Bu adım gerekmiyor" : "Süreci sonlandır"}
          danger={dialog.kind === "cancel"} submitLabel={dialog.kind === "reject" ? "Aktar" : dialog.kind === "add" ? "Ekle ve hastayı yönlendir" : dialog.kind === "skip" ? "Adımı atla" : "Sonlandır"}
          description={dialog.kind === "add" ? "Seçtiğiniz birimlere sırayla gider; tetkik sonrası hasta sonuç değerlendirmesi için biriminize döner. Klinik karar sizindir; istemi HBYS'ye ayrıca girin." : `${dialog.j.alias} · ${dialog.j.current?.unitName} · ${dialog.j.current?.label}`}
          onClose={() => { setDialog(null); setPicked([]); }}
          onSubmit={async () => {
            if (dialog.kind === "add") await act(dialog.j, "add", { add: picked, consultUnit: form.consult || undefined });
            else await act(dialog.j, dialog.kind, { note: form.note, targetUnit: dialog.kind === "reject" ? form.target || undefined : undefined });
            setDialog(null); setPicked([]); setForm({});
          }}>
          <div className="hs-form">
            {dialog.kind === "reject" && <label>Hastanın gideceği birim<select value={form.target ?? ""} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              <option value="">{dialog.j.current?.rejectTo ? `Varsayılan: ${data.units.find((u) => u.code === dialog.j.current?.rejectTo)?.name}` : "Seçin"}</option>
              {data.units.filter((u) => u.code !== dialog.j.current?.unitCode).map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}</select></label>}
            {dialog.kind === "add" && <>
              <div className="hs-checks">{data.addable.map((a) => <label key={a.code}><input type="checkbox" checked={picked.includes(a.code)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.code] : picked.filter((x) => x !== a.code))} />{a.label}</label>)}</div>
              <label>Konsültasyon birimi<select value={form.consult ?? ""} onChange={(e) => setForm({ ...form, consult: e.target.value })}>
                <option value="">Konsültasyon yok</option>{data.consultUnits.filter((u) => u.code !== dialog.j.current?.unitCode).map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}</select></label>
            </>}
            {dialog.kind !== "add" && <label>Gerekçe<textarea required minLength={3} maxLength={300} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <span className="hint">Hastaya gösterilmez; denetim kaydına yazılır. Kişisel veri yazmayın.</span></label>}
          </div>
        </FormDialog>}
      </>}
    </StateBox>
  </main>;
}

function JourneyCard({ j, busy, onQuick, onDialog }: { j: Journey; busy: boolean; onQuick: (j: Journey, a: "start" | "complete") => void; onDialog: (d: Dialog) => void }) {
  const c = j.current;
  return <article className="hs-card">
    <header><b>{j.alias}</b><span>{j.pathway} · {j.clinic} · {j.reference}</span><span>{j.status === "active" ? `Başlangıç ${hm(j.createdAt)}` : j.status === "completed" ? `Tamamlandı ${hm(j.closedAt)}` : `Sonlandırıldı: ${j.closeReason ?? ""}`}</span></header>
    <progress className="hs-bar" value={j.progress} max={100} aria-label={`İlerleme %${j.progress}`} />
    <ol className="hs-steps" aria-label="Süreç adımları">{j.steps.map((s) => <li key={`${s.seq}-${s.unitCode}`} className={`${s.state}${s.overdue ? " late" : ""}`} title={`${STATE[s.state]}${s.finishedAt ? ` · ${hm(s.finishedAt)}` : ""}${s.note ? ` · ${s.note}` : ""}`}>{s.unitName} · {s.label}</li>)}</ol>
    {c && <div className="hs-now">
      <p><b>Şu an:</b> {c.unitName} — {c.label} · {STATE[c.state]} · {since(c.enteredAt)}{c.overdue ? <strong> · hedef {c.slaMinutes} dk aşıldı</strong> : ` · hedef ${c.slaMinutes} dk`}</p>
      {j.can && <div className="hs-actions">
        {j.can.start && <button type="button" className="hs-btn" disabled={busy} onClick={() => onQuick(j, "start")}>Hastayı al / başla</button>}
        {j.can.complete && <button type="button" className="hs-btn primary" disabled={busy} onClick={() => onQuick(j, "complete")}>Tamamla ve sonraki birime gönder</button>}
        {j.can.add && <button type="button" className="hs-btn" disabled={busy} onClick={() => onDialog({ kind: "add", j })}>Tetkik / konsültasyon ekle</button>}
        {j.can.reject && <button type="button" className="hs-btn warn" disabled={busy} onClick={() => onDialog({ kind: "reject", j })}>Reddet / başka birime aktar</button>}
        {j.can.skip && <button type="button" className="hs-btn" disabled={busy} onClick={() => onDialog({ kind: "skip", j })}>Gerekmiyor</button>}
        {j.can.cancel && <button type="button" className="hs-btn danger" disabled={busy} onClick={() => onDialog({ kind: "cancel", j })}>Süreci sonlandır</button>}
      </div>}
    </div>}
  </article>;
}

function Slip({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/takip?kod=${encodeURIComponent(opened.trackingCode)}`;
  return <section className="hs-slip" aria-label="Hasta takip fişi">
    <div>
      <p className="print-only"><b>KLINORBIS · Hasta süreç takip fişi</b></p>
      <p>{opened.pathway} · Süreç no {opened.reference}</p>
      <p>Takip kodu: <code>{opened.trackingCode}</code></p>
      <p>PIN: <code>{opened.pin}</code></p>
      <p>Telefonunuzla QR kodu okutun veya <b>{origin}/takip</b> adresine kodu ve PIN&apos;i girin. PIN&apos;i kimseyle paylaşmayın.</p>
      <p className="noprint"><b>PIN yalnız şimdi gösterilir.</b> Fişi yazdırıp hastaya verin.</p>
      <div className="hs-actions noprint"><button type="button" className="hs-btn primary" onClick={() => window.print()}>Fişi yazdır</button><button type="button" className="hs-btn" onClick={onClose}>Kapat</button></div>
    </div>
    <span dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
  </section>;
}
