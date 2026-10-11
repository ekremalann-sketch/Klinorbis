"use client";
// Operasyon akışları ekranı:
//  1) Kütüphane: 80+ hazır akış (yatak hazırlığı, cihaz arızası, taburculuk…), adımları ve birimleri; "Başlat"
//  2) Etkin akışlar: hangi adımda, hangi birimde, ne kadar süredir; yetkiliyse "Adımı tamamla"
//  3) Akış ağı: birimler arası devirler ve bir akış kapanınca kendiliğinden başlayan akışlar
//  4) Olaylar: hangi sistem olayının hangi akışı kendiliğinden başlattığı (operasyon yöneticisi simüle edebilir)
//  5) Performans: akış süreleri, birim bekleme süreleri, hedef süreye uyum, şu an geciken adımlar
import { useCallback, useEffect, useMemo, useState } from "react";

type Step = { unitCode: string; task: string; minutes: number; approval: boolean; waitMinutes: number; clinical: boolean };
type Playbook = { code: string; title: string; category: string; trigger: string; steps: Step[]; next: string[] };
type RunStep = { stepIndex: number; unitCode: string; task: string; approval: boolean; completedBy: string | null; completedAt: string | number | null; startedAt: string | number; activateAt: string | number | null; dueAt: string | number | null; note: string | null };
type Run = { reference: string; playbookCode: string; title: string; status: string; currentStep: number; stepCount: number; note: string | null; parentReference: string | null; startedBy: string; version: number; createdAt: string | number; steps: RunStep[] };
type Data = {
  identity: { role: string; label: string; email: string; unitCodes: string[]; canSeeAllUnits: boolean };
  categories: string[]; playbooks: Playbook[]; units: { code: string; name: string }[]; runs: Run[];
  network: { units: { code: string; name: string; steps: number }[]; handoffs: { from: string; to: string; count: number }[]; chains: { from: string; to: string }[] };
  triggers: { type: string; label: string; source: string; playbook: string }[];
  serverNow: number;
  report: Report;
};
type Report = {
  totals: { runs: number; active: number; done: number; cancelled: number; completedSteps: number; onTimeRate: number | null; overdueNow: number; automatic: number };
  units: { unitCode: string; unitName: string; completed: number; avgWaitMinutes: number | null; onTimeRate: number | null; open: number; overdue: number }[];
  playbooks: { code: string; title: string; started: number; done: number; cancelled: number; avgMinutes: number | null; targetMinutes: number | null }[];
};

const WRITERS = ["operations_manager", "unit_manager", "clinician", "call_agent"];
const APPROVERS = ["operations_manager", "unit_manager"];
const mins = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)} gün` : m >= 60 ? `${Math.round(m / 60)} sa` : `${m} dk`);
const ago = (v: string | number) => { const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000)); return m < 60 ? `${m} dk` : m < 1440 ? `${Math.round(m / 60)} sa` : `${Math.round(m / 1440)} gün`; };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}

export function Playbooks() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"library" | "runs" | "network" | "events" | "report">("library");
  const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(""), [query, setQuery] = useState(""), [open, setOpen] = useState<string>("");
  const [note, setNote] = useState(""), [focusUnit, setFocusUnit] = useState("");
  const fetchData = useCallback(() => call<Data>("/api/playbooks"), []);
  const load = useCallback(async () => { const d = await fetchData(); setData(d); return d; }, [fetchData]);
  useEffect(() => { let alive = true; fetchData().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Bilgiler alınamadı."); }); return () => { alive = false; }; }, [fetchData]);

  const unitName = useCallback((code: string) => data?.units.find((u) => u.code === code)?.name ?? code, [data]);
  const byCode = useCallback((code: string) => data?.playbooks.find((p) => p.code === code), [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return (data?.playbooks || []).filter((p) => (!category || p.category === category) && (!q || `${p.title} ${p.trigger} ${p.steps.map((s) => `${s.task} ${unitName(s.unitCode)}`).join(" ")}`.toLocaleLowerCase("tr-TR").includes(q)));
  }, [data, category, query, unitName]);
  const triggeredBy = useCallback((code: string) => (data?.playbooks || []).filter((p) => p.next.includes(code)), [data]);

  async function act(body: Record<string, unknown>, success: (r: { reference?: string; started?: { title: string }[] }) => string) {
    setBusy(true); setErr(""); setMsg("");
    try { const r = await call<{ reference?: string; started?: { title: string }[] }>("/api/playbooks", body); setMsg(success(r)); setNote(""); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "İşlem tamamlanamadı."); } finally { setBusy(false); }
  }

  if (!data) return <section className="pb-panel"><p role="status">{err || "Yükleniyor…"}</p></section>;
  const me = data.identity;
  const canWrite = WRITERS.includes(me.role);
  const canDo = (unit: string) => me.canSeeAllUnits || me.unitCodes.includes(unit);
  const active = data.runs.filter((r) => r.status === "active");
  const selected = open ? byCode(open) : null;

  return <section className="pb-panel" aria-label="Operasyon akışları">
    <div className="pb-intro">
      <p><b>{data.playbooks.length} hazır akış</b> · {data.network.units.length} birim · {data.network.handoffs.length} birimler arası devir · {data.network.chains.length} zincir bağlantısı. Bir akış başlatıldığında ilk birimin iş kutusuna görev düşer; adım tamamlanınca sıradaki birime geçer. Onay adımlarını akışı başlatan kişi geçiremez. Akışlar operasyoneldir; klinik kararı her zaman yetkili sağlık personeli verir.</p>
    </div>
    <nav className="pa-tabs" aria-label="Akış ekranları">
      <button type="button" className={tab === "library" ? "active" : ""} aria-pressed={tab === "library"} onClick={() => setTab("library")}>Akış kütüphanesi ({data.playbooks.length})</button>
      <button type="button" className={tab === "runs" ? "active" : ""} aria-pressed={tab === "runs"} onClick={() => setTab("runs")}>Etkin akışlar ({active.length})</button>
      <button type="button" className={tab === "network" ? "active" : ""} aria-pressed={tab === "network"} onClick={() => setTab("network")}>Akış ağı</button>
      <button type="button" className={tab === "events" ? "active" : ""} aria-pressed={tab === "events"} onClick={() => setTab("events")}>Olay tetikleyicileri ({data.triggers.length})</button>
      <button type="button" className={tab === "report" ? "active" : ""} aria-pressed={tab === "report"} onClick={() => setTab("report")}>Performans{data.report.totals.overdueNow ? ` · ${data.report.totals.overdueNow} geciken` : ""}</button>
    </nav>
    <p className="pb-msg" role="status">{msg}</p>
    {err && <p className="pb-err" role="alert">{err}</p>}

    {tab === "library" && <div className={`pb-lib ${selected ? "with-detail" : ""}`}>
      <div>
        <div className="pb-filters">
          <label><span>Ara</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ör. yatak, cihaz, KVKK" /></label>
          <div className="pb-cats" role="group" aria-label="Kategori">
            <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>Tümü</button>
            {data.categories.map((c) => <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c} <em>{data.playbooks.filter((p) => p.category === c).length}</em></button>)}
          </div>
        </div>
        <ul className="pb-cards">{filtered.map((p) => <li key={p.code}>
          <button type="button" className={`pb-card ${open === p.code ? "on" : ""}`} onClick={() => { setOpen(p.code); setNote(""); }}>
            <small>{p.category}</small><strong>{p.title}</strong><span className="pb-trigger">{p.trigger}</span>
            <span className="pb-chain">{p.steps.map((s, i) => <i key={i} className={s.approval ? "appr" : ""}>{s.unitCode}</i>)}</span>
            <span className="pb-meta">{p.steps.length} adım · {p.steps.filter((s) => s.approval).length} onay{p.next.length ? ` · kapanınca ${p.next.length} akış başlatır` : ""}</span>
          </button>
        </li>)}</ul>
        {!filtered.length && <p>Bu aramaya uyan akış yok.</p>}
      </div>
      {selected && <aside className="pb-detail" aria-label={selected.title}>
        <div className="pb-detail-head"><div><small>{selected.category}</small><h2>{selected.title}</h2></div><button type="button" onClick={() => setOpen("")} aria-label="Kapat">✕</button></div>
        <p><b>Ne zaman:</b> {selected.trigger}</p>
        <ol className="pb-steps">{selected.steps.map((s, i) => <li key={i}><b>{unitName(s.unitCode)}</b> — {s.task} <small>{s.waitMinutes ? `önceki adımdan ${mins(s.waitMinutes)} sonra açılır · ` : ""}hedef {mins(s.minutes)}{s.clinical ? " · klinik onay (yalnız klinisyen)" : s.approval ? " · yönetici onayı" : ""}</small></li>)}</ol>
        {triggeredBy(selected.code).length > 0 && <p className="pb-links"><b>Şu akışlardan sonra kendiliğinden başlar:</b> {triggeredBy(selected.code).map((p) => <button type="button" key={p.code} onClick={() => setOpen(p.code)}>{p.title}</button>)}</p>}
        {selected.next.length > 0 && <p className="pb-links"><b>Kapanınca başlatır:</b> {selected.next.map((c) => <button type="button" key={c} onClick={() => setOpen(c)}>{byCode(c)?.title}</button>)}</p>}
        {canWrite && canDo(selected.steps[0].unitCode) ? <div className="pb-start">
          <label><span>Kısa not (isteğe bağlı; hasta kimliği yazmayın, telefon ve TCKN maskelenir)</span><textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="button" className="pb-primary" disabled={busy} onClick={() => void act({ action: "start", code: selected.code, note }, (r) => `Akış başlatıldı: ${r.reference}. İlk görev ${unitName(selected.steps[0].unitCode)} iş kutusunda.`).then(() => setTab("runs"))}>Akışı başlat</button>
        </div> : <p className="pb-hint">Bu akışı {unitName(selected.steps[0].unitCode)} birimi veya operasyon yöneticisi başlatır.</p>}
      </aside>}
    </div>}

    {tab === "runs" && <div className="pb-runs">
      {!data.runs.length && <div className="pb-empty"><p>Henüz akış başlatılmadı. Kütüphaneden bir akış seçip “Akışı başlat” deyin.</p><button type="button" onClick={() => setTab("library")}>Kütüphaneyi aç</button></div>}
      {data.runs.map((r) => { const pb = byCode(r.playbookCode); const cur = pb?.steps[r.currentStep]; const curRow = r.steps.find((x) => x.stepIndex === r.currentStep); const waiting = !!curRow?.activateAt && new Date(curRow.activateAt).getTime() > data.serverNow;
        const mine = r.status === "active" && cur && !waiting && canWrite && canDo(cur.unitCode) && (!cur.approval || (r.startedBy !== me.email && (cur.clinical ? me.role === "clinician" : APPROVERS.includes(me.role))));
        return <article key={r.reference} className={`pb-run ${r.status}`}>
          <header><div><small>{r.reference}{r.parentReference ? ` · ${r.parentReference} sonrasında otomatik` : ""}</small><h2>{r.title}</h2></div><span className={`pb-status ${r.status}`}>{r.status === "active" ? `${r.currentStep + 1}/${r.stepCount}. adım` : r.status === "done" ? "Tamamlandı" : "İptal"}</span></header>
          <ol className="pb-track">{(pb?.steps || []).map((s, i) => { const done = r.status === "done" || i < r.currentStep; const now = r.status === "active" && i === r.currentStep; const rs = r.steps.find((x) => x.stepIndex === i);
            return <li key={i} className={done ? "done" : now ? "now" : ""} aria-current={now ? "step" : undefined}><b>{s.unitCode}</b><span>{s.task}</span>{s.approval && <em>onay</em>}{now && rs && (rs.activateAt && new Date(rs.activateAt).getTime() > data.serverNow
              ? <small>{new Date(rs.activateAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} tarihinde açılacak</small>
              : <small>{ago(rs.activateAt ?? rs.startedAt)}dır bekliyor · hedef {mins(s.minutes)}{rs.dueAt && new Date(rs.dueAt).getTime() < data.serverNow ? " · GECİKTİ" : ""}</small>)}</li>; })}</ol>
          {r.note && <p className="pb-note">{r.note}</p>}
          {r.status === "active" && cur && <div className="pb-run-actions">
            {mine ? <button type="button" className="pb-primary" disabled={busy} onClick={() => void act({ action: "step.complete", reference: r.reference, version: r.version }, (x) => x.started?.length ? `Akış tamamlandı. Kendiliğinden başlayanlar: ${x.started.map((s) => s.title).join(", ")}.` : `${unitName(cur.unitCode)} adımı tamamlandı.`)}>{cur.approval ? "Onayla ve ilerlet" : "Adımı tamamla"}</button>
              : <span className="pb-hint">{waiting ? "Bu adım zamanı gelince açılacak." : `Sıradaki adım: ${unitName(cur.unitCode)}`}{cur.approval && !waiting ? (r.startedBy === me.email ? " · akışı siz başlattınız; onayı başka bir yetkili verir" : cur.clinical ? " (klinisyen onayı)" : " (yönetici onayı)") : ""}</span>}
            {(r.startedBy === me.email || APPROVERS.includes(me.role)) && <button type="button" disabled={busy} onClick={() => { const n = note; if (!n || n.trim().length < 5) { setErr("İptal için alttaki not alanına en az 5 karakterlik bir neden yazın."); return; } void act({ action: "cancel", reference: r.reference, version: r.version, note: n }, () => "Akış iptal edildi."); }}>İptal et</button>}
            <button type="button" onClick={() => { setTab("library"); setOpen(r.playbookCode); }}>Akış tanımını gör</button>
          </div>}
        </article>; })}
      {active.length > 0 && <label className="pb-cancel-note"><span>İptal nedeni (iptal için gerekli)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>}
    </div>}

    {tab === "events" && <section className="pb-events" aria-label="Olay tetikleyicileri">
      <p className="pb-hint">Hastane sistemleri imzalı olay gönderdiğinde (<code>/api/integrations/events</code>) ilgili akış kendiliğinden başlar; aynı olay ikinci kez akış açmaz. Şikâyet türündeki talep kaydı “Hasta şikâyeti” akışını kendisi başlatır. Gerçek sistem bağlantısı kurulana kadar operasyon yöneticisi olayı simüle edebilir; simülasyon olarak işaretlenir.</p>
      <table className="pb-table"><thead><tr><th>Olay</th><th>Kaynak sistem</th><th>Başlayan akış</th><th>İşlem</th></tr></thead><tbody>
        {data.triggers.map((t) => <tr key={t.type}><td><b>{t.label}</b><small><code>{t.type}</code></small></td><td>{t.source}</td><td><button type="button" className="pb-linkbtn" onClick={() => { setTab("library"); setOpen(t.playbook); }}>{byCode(t.playbook)?.title}</button></td>
          <td>{me.role === "operations_manager" && <button type="button" disabled={busy} onClick={() => void act({ action: "event.simulate", type: t.type }, (r) => `Simülasyon: ${t.label} → ${byCode(t.playbook)?.title} başladı (${r.reference}).`).then(() => setTab("runs"))}>Simüle et</button>}</td></tr>)}
      </tbody></table>
    </section>}

    {tab === "report" && <ReportView report={data.report} openPlaybook={(code) => { setTab("library"); setOpen(code); }} />}

    {tab === "network" && <NetworkView data={data} unitName={unitName} focus={focusUnit} setFocus={setFocusUnit} openPlaybook={(code) => { setTab("library"); setOpen(code); }} />}
  </section>;
}

function ReportView({ report, openPlaybook }: { report: Report; openPlaybook: (code: string) => void }) {
  const t = report.totals;
  const dur = (m: number | null) => (m === null ? "—" : mins(Math.max(1, m)));
  return <section className="pb-report" aria-label="Akış performansı">
    <div className="pb-kpis">
      <div><b>{t.runs}</b><span>başlatılan akış</span></div>
      <div><b>{t.active}</b><span>açık</span></div>
      <div><b>{t.done}</b><span>tamamlanan</span></div>
      <div><b>{t.onTimeRate === null ? "—" : `%${t.onTimeRate}`}</b><span>adımların hedef sürede tamamlanma oranı</span></div>
      <div className={t.overdueNow ? "bad" : ""}><b>{t.overdueNow}</b><span>şu an geciken adım</span></div>
      <div><b>{t.automatic}</b><span>olay veya zincirle kendiliğinden başlayan</span></div>
    </div>
    <h2>Birimler: kim bekletiyor?</h2>
    {report.units.length ? <table className="pb-table"><thead><tr><th>Birim</th><th>Tamamlanan adım</th><th>Ortalama bekleme</th><th>Hedefe uyum</th><th>Şu an açık</th><th>Geciken</th></tr></thead><tbody>
      {report.units.map((u) => <tr key={u.unitCode} className={u.overdue ? "bad" : ""}><td><b>{u.unitName}</b> <small>{u.unitCode}</small></td><td>{u.completed}</td><td>{dur(u.avgWaitMinutes)}</td><td>{u.onTimeRate === null ? "—" : `%${u.onTimeRate}`}</td><td>{u.open}</td><td>{u.overdue}</td></tr>)}
    </tbody></table> : <p className="pb-hint">Henüz tamamlanan adım yok.</p>}
    <h2>Akışlar: ne kadar sürüyor?</h2>
    {report.playbooks.length ? <table className="pb-table"><thead><tr><th>Akış</th><th>Başlatılan</th><th>Tamamlanan</th><th>İptal</th><th>Ortalama süre</th><th>Hedef toplam</th></tr></thead><tbody>
      {report.playbooks.map((p) => <tr key={p.code}><td><button type="button" className="pb-linkbtn" onClick={() => openPlaybook(p.code)}>{p.title}</button></td><td>{p.started}</td><td>{p.done}</td><td>{p.cancelled}</td><td>{dur(p.avgMinutes)}</td><td>{dur(p.targetMinutes)}</td></tr>)}
    </tbody></table> : <p className="pb-hint">Henüz akış başlatılmadı.</p>}
    <p className="pb-hint">Bekleme, adımın açılmasından (gecikmeli adımda açılış zamanından) tamamlanmasına kadar geçen süredir. Hedef, akış tanımındaki adım süresidir.</p>
  </section>;
}

function NetworkView({ data, unitName, focus, setFocus, openPlaybook }: { data: Data; unitName: (c: string) => string; focus: string; setFocus: (c: string) => void; openPlaybook: (code: string) => void }) {
  const top = data.network.units.slice(0, 24);
  const pos = useMemo(() => Object.fromEntries(top.map((u, i) => { const t = (i / top.length) * Math.PI * 2 - Math.PI / 2; return [u.code, { x: 380 + Math.cos(t) * 300, y: 340 + Math.sin(t) * 300 }]; })) as Record<string, { x: number; y: number }>, [top]);
  const edges = data.network.handoffs.filter((h) => pos[h.from] && pos[h.to]);
  const related = data.playbooks.filter((p) => !focus || p.steps.some((s) => s.unitCode === focus));
  return <div className="pb-net">
    <svg viewBox="0 0 760 690" className="pb-svg" role="group" aria-label="Birimler arası iş devri ağı">
      <defs><marker id="pbarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#6b7f95" /></marker></defs>
      {edges.map((e) => { const A = pos[e.from], B = pos[e.to]; const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1; const on = !focus || e.from === focus || e.to === focus;
        return <line key={e.from + e.to} x1={A.x + (dx / L) * 30} y1={A.y + (dy / L) * 30} x2={B.x - (dx / L) * 33} y2={B.y - (dy / L) * 33} stroke={on ? (focus ? (e.from === focus ? "#0f6b5e" : "#b45309") : "#9aa9b9") : "#edf1f5"} strokeWidth={Math.min(5, 0.6 + e.count * 0.6)} markerEnd="url(#pbarr)" />; })}
      {top.map((u) => <g key={u.code} transform={`translate(${pos[u.code].x},${pos[u.code].y})`} className={`pb-node ${focus === u.code ? "on" : ""}`} role="button" tabIndex={0} aria-label={`${u.name}: ${u.steps} adım. Bağlantıları göster`} onClick={() => setFocus(focus === u.code ? "" : u.code)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(focus === u.code ? "" : u.code); } }}>
        <circle r="28" /><text y="-1" textAnchor="middle">{u.code}</text><text y="13" textAnchor="middle" className="sub">{u.steps} adım</text>
      </g>)}
    </svg>
    <section className="pb-net-side">
      <h2>{focus ? `${unitName(focus)}: ${related.length} akışta görev alıyor` : "En yoğun devirler"}</h2>
      {focus && <button type="button" onClick={() => setFocus("")}>Tüm ağı göster</button>}
      {!focus && <ol className="pb-handoffs">{data.network.handoffs.slice(0, 14).map((h) => <li key={h.from + h.to}><button type="button" onClick={() => setFocus(h.from)}>{unitName(h.from)}</button> → <button type="button" onClick={() => setFocus(h.to)}>{unitName(h.to)}</button> <small>{h.count} akışta</small></li>)}</ol>}
      {focus && <ul className="pb-related">{related.map((p) => <li key={p.code}><button type="button" onClick={() => openPlaybook(p.code)}>{p.title}</button> <small>{p.steps.filter((s) => s.unitCode === focus).map((s) => s.task).join(" · ")}</small></li>)}</ul>}
      <h2>Zincirler: bir akış kapanınca başlayanlar</h2>
      <ul className="pb-chains">{data.network.chains.filter((c) => !focus || [c.from, c.to].some((code) => data.playbooks.find((p) => p.code === code)?.steps.some((s) => s.unitCode === focus))).map((c) => <li key={c.from + c.to}><button type="button" onClick={() => openPlaybook(c.from)}>{data.playbooks.find((p) => p.code === c.from)?.title}</button> → <button type="button" onClick={() => openPlaybook(c.to)}>{data.playbooks.find((p) => p.code === c.to)?.title}</button></li>)}</ul>
    </section>
  </div>;
}
