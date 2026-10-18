"use client";
// Sanal hastane simülasyonu ekranı (yalnız operasyon yöneticisi).
// Kurgusal hastanede aynı olaylar telefon/kâğıt ve Klinorbis ile oynatılır; personel zamanı ve TL karşılığı
// karşılaştırılır. Her yerde "SİMÜLASYON" etiketi görünür; sonuç yazdırılabilir. Gerçek veri kullanılmaz.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimParams, SimulationResult } from "../lib/simulation";

type Meta = { label: string; hospital: { name: string; campuses: string[] }; defaults: SimParams; labels: Record<keyof SimParams, string>; scenarios: { key: string; label: string; detail: string }[]; paused: boolean; runs: { id: string; seed: number; createdAt: string | number; params: SimParams & { scenario?: string } }[] };
const MAIN: (keyof SimParams)[] = ["beds", "days", "staffHourlyCostTL", "seed"];
const ADVANCED: (keyof SimParams)[] = ["phoneCallMinutes", "reachFailRate", "retryWaitMinutes", "paperFormMinutes", "forgottenHandoffRate", "klinorbisActionMinutes", "stillCallRate"];
const RATE_KEYS = new Set<keyof SimParams>(["reachFailRate", "forgottenHandoffRate", "stillCallRate"]);
const SPEEDS = [["instant", "Anlık"], ["fast", "Hızlı"], ["slow", "Yavaş"]] as const;
const tl = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
const hrs = (m: number) => `${Math.round(m / 60).toLocaleString("tr-TR")} sa`;
const num = (n: number) => n.toLocaleString("tr-TR");

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}

export function Simulation() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [params, setParams] = useState<SimParams | null>(null);
  const [result, setResult] = useState<{ id: string; result: SimulationResult } | null>(null);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [confirmClear, setConfirmClear] = useState(false);
  const [scenario, setScenario] = useState("normal");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number][0]>("fast"), [cursor, setCursor] = useState(0);

  const load = useCallback(async () => { const m = await call<Meta>("/api/simulation"); setMeta(m); setParams((p) => p ?? m.defaults); return m; }, []);
  useEffect(() => { let alive = true; call<Meta>("/api/simulation").then((m) => { if (alive) { setMeta(m); setParams(m.defaults); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Bilgiler alınamadı."); }); return () => { alive = false; }; }, []);

  const hours = result?.result.timeline.length ?? 0;
  // Oynatma: zaman çizelgesi saat saat ilerler (sonuç zaten hesaplanmıştır; yalnız gösterim hızıdır).
  useEffect(() => {
    if (!result) return;
    if (speed === "instant") { setCursor(hours); return; }
    setCursor(0);
    const step = speed === "fast" ? 90 : 450;
    const timer = window.setInterval(() => setCursor((c) => { if (c >= hours) { window.clearInterval(timer); return c; } return c + 1; }), step);
    return () => window.clearInterval(timer);
  }, [result, speed, hours]);

  async function run() {
    if (!params) return;
    setBusy(true); setErr("");
    try { const r = await call<{ id: string; result: SimulationResult }>("/api/simulation", { action: "run", params, scenario }); setResult(r); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Simülasyon çalışmadı."); } finally { setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setErr("");
    try { const r = await call<{ id: string; result: SimulationResult }>(`/api/simulation?id=${encodeURIComponent(id)}`); setResult(r); setParams(r.result.params); setScenario(r.result.scenario?.key ?? "normal"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kayıt açılamadı."); } finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setErr("");
    try { await call("/api/simulation", { action: "clear" }); setResult(null); setConfirmClear(false); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kayıtlar silinemedi."); } finally { setBusy(false); }
  }

  if (!meta || !params) return <section className="sim-panel"><p role={err ? "alert" : "status"}>{err || "Yükleniyor…"}</p></section>;
  const input = (key: keyof SimParams, required = false) => <label key={key}>
    <span>{meta.labels[key]}{required && <b className="field-star" aria-hidden="true"> *</b>}</span>
    <input type="number" inputMode="decimal" required={required} step={RATE_KEYS.has(key) ? 0.01 : key === "klinorbisActionMinutes" || key === "phoneCallMinutes" ? 0.5 : 1}
      value={params[key]} onChange={(e) => setParams({ ...params, [key]: e.target.value === "" ? meta.defaults[key] : Number(e.target.value) })} />
  </label>;

  return <section className="sim-panel" aria-label="Sanal hastane simülasyonu">
    <p className="sim-label" role="note">{meta.label}</p><p><a href="/simulasyon">Otomatik hastane gününü aç</a></p>
    <div className="sim-head">
      <div>
        <h2>{meta.hospital.name}</h2>
        <p>{meta.hospital.campuses.join(" · ")} · aynı olaylar iki kez oynatılır: <b>telefon ve kâğıt</b> ile, <b>Klinorbis</b> ile. Gerçek veri kullanılmaz, yapay zekâ veya dış servis çağrılmaz.</p>
      </div>
    </div>
    {meta.paused && <p className="sim-warn" role="alert">Otomasyon acil durdurmada. Simülasyon da durdurma kalkana kadar çalışmaz.</p>}
    {err && <p className="pb-err" role="alert">{err}</p>}

    <form className="sim-form" onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <div className="sim-grid">{MAIN.map((key) => input(key, key !== "seed"))}
        <label><span>Senaryo (tatbikat / kriz günü)</span><select value={scenario} onChange={(e) => setScenario(e.target.value)}>{meta.scenarios.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
      </div>
      <p className="pb-hint">{meta.scenarios.find((x) => x.key === scenario)?.detail}</p>
      <details>
        <summary>Varsayımlar (dakika ve oranlar)</summary>
        <div className="sim-grid">{ADVANCED.map((key) => input(key))}</div>
        <p className="pb-hint">Oranlar 0–1 arasıdır (0,3 = %30). Varsayımlar sonuçla birlikte kaydedilir ve raporda görünür.</p>
      </details>
      <div className="sim-actions">
        <button type="submit" className="pb-primary" disabled={busy || meta.paused}>{busy ? "Çalışıyor…" : "Simülasyonu çalıştır"}</button>
        <button type="button" onClick={() => setParams(meta.defaults)} disabled={busy}>Varsayılanlara dön</button>
        {result && <button type="button" onClick={() => window.print()}>Raporu yazdır</button>}
      </div>
    </form>

    {result && <SimReport data={result.result} id={result.id} cursor={Math.min(cursor, hours)} speed={speed} setSpeed={setSpeed} />}

    <section className="sim-history" aria-label="Kayıtlı simülasyonlar">
      <h3>Kayıtlı simülasyonlar ({meta.runs.length})</h3>
      {meta.runs.length ? <ul>{meta.runs.map((r) => <li key={r.id}><button type="button" className="pb-linkbtn" onClick={() => void open(r.id)}>{r.id}</button> <small>{new Date(r.createdAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · {r.params.beds} yatak · {r.params.days} gün · {meta.scenarios.find((x) => x.key === (r.params.scenario ?? "normal"))?.label} · tohum {r.seed}</small></li>)}</ul> : <p className="pb-hint">Henüz kayıt yok.</p>}
      {meta.runs.length > 0 && (confirmClear
        ? <p className="sim-confirm">Tüm simülasyon kayıtları silinsin mi? Canlı verilere dokunulmaz. <button type="button" className="danger" disabled={busy} onClick={() => void clear()}>Evet, sil</button> <button type="button" onClick={() => setConfirmClear(false)}>Vazgeç</button></p>
        : <button type="button" onClick={() => setConfirmClear(true)}>Kayıtları temizle</button>)}
    </section>
  </section>;
}

function SimReport({ data, id, cursor, speed, setSpeed }: { data: SimulationResult; id: string; cursor: number; speed: string; setSpeed: (s: (typeof SPEEDS)[number][0]) => void }) {
  const p = data.phone, k = data.klinorbis, s = data.savings;
  const visible = data.timeline.slice(0, cursor);
  const maxEvents = Math.max(1, ...data.timeline.map((t) => t.events));
  const maxSaved = Math.max(1, data.timeline[data.timeline.length - 1]?.savedMinutes ?? 1);
  const W = 720, H = 180, bw = W / Math.max(1, data.timeline.length);
  const line = useMemo(() => visible.map((t, i) => `${i ? "L" : "M"}${(i + 0.5) * bw},${H - (t.savedMinutes / maxSaved) * (H - 12)}`).join(" "), [visible, bw, maxSaved]);
  const rows: [string, string | number, string | number][] = [
    ["Operasyon akışı", num(p.flows), num(k.flows)],
    ["Koordinasyon için personel zamanı", hrs(p.coordinationMinutes), hrs(k.coordinationMinutes)],
    ["Telefon görüşmesi (başarısız denemeler dahil)", num(p.calls), num(k.calls)],
    ["Ulaşılamayan arama", num(p.failedCalls), num(k.failedCalls)],
    ["\"Ne oldu?\" takip araması", num(p.followUpCalls), num(k.followUpCalls)],
    ["Unutulan devir", num(p.lostHandoffs), num(k.lostHandoffs)],
    ["Unutulan bağlı / zamanlı iş", num(p.forgottenChains + p.forgottenDelayed), num(k.forgottenChains + k.forgottenDelayed)],
    ["Hedef sürede biten adım", `%${p.onTimeRate}`, `%${k.onTimeRate}`],
    ["Akış süresi (ortalama / %90)", `${p.avgFlowMinutes} / ${p.p90FlowMinutes} dk`, `${k.avgFlowMinutes} / ${k.p90FlowMinutes} dk`],
    ["Gecikince yöneticiye yükselen iş", "—", num(k.escalations)],
  ];
  return <article className="sim-report" aria-label="Simülasyon sonucu">
    <p className="sim-label print-only">{data.label} · {id}</p>
    {data.scenario && data.scenario.key !== "normal" && <div className="sim-scenario" role="note"><b>Senaryo: {data.scenario.label}</b><span>{data.scenario.detail}</span>{data.scenario.crisis && <span>Kriz saatlerinde (10:00–18:00) hedefi aşan adım: telefonla <b>{data.scenario.crisis.phoneOverdue}</b> · Klinorbis ile <b>{data.scenario.crisis.klinorbisOverdue}</b></span>}</div>}
    <div className="pb-kpis">
      <div><b>{hrs(s.perDayMinutes)}</b><span>günde geri kazanılan personel zamanı</span></div>
      <div><b>{s.fteEquivalent.toLocaleString("tr-TR")}</b><span>tam zamanlı personel karşılığı (7,5 sa/gün)</span></div>
      <div><b>{tl(s.conservativeMonthTL)} – {tl(s.perMonthTL)}</b><span>aylık karşılık (temkinli – model)</span></div>
      <div><b>{tl(s.conservativeYearTL)} – {tl(s.perYearTL)}</b><span>yıllık karşılık (temkinli – model)</span></div>
      <div><b>%{p.onTimeRate} → %{k.onTimeRate}</b><span>hedef sürede biten adım</span></div>
      <div><b>{s.bedReadyMinutesPerFlow > 0 ? `${s.bedReadyMinutesPerFlow} dk` : "—"}</b><span>taburcu sonrası yatak başına daha erken hazır</span></div>
    </div>
    <ul className="sim-summary">{data.summary.map((line) => <li key={line}>{line}</li>)}</ul>

    <section className="sim-chart">
      <div className="sim-chart-head">
        <h3>Saat saat: olaylar ve biriken kazanç</h3>
        <div role="group" aria-label="Oynatma hızı" className="pb-cats">{SPEEDS.map(([key, label]) => <button key={key} type="button" aria-pressed={speed === key} onClick={() => setSpeed(key)}>{label}</button>)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Saatlik olay sayısı ve biriken zaman kazancı; ${cursor}. saat gösteriliyor`}>
        {visible.map((t, i) => <rect key={t.hour} x={i * bw + 1} width={Math.max(1, bw - 2)} y={H - (t.events / maxEvents) * (H * 0.55)} height={(t.events / maxEvents) * (H * 0.55)} fill="#c7d7ea"><title>{`${t.hour % 24}:00 · ${t.events} olay`}</title></rect>)}
        <path d={line} fill="none" stroke="#0f6b5e" strokeWidth="2.5" />
        {data.timeline.filter((t) => t.hour % (data.timeline.length > 48 ? 24 : 6) === 0).map((t) => <text key={t.hour} x={t.hour * bw} y={H + 14} fontSize="11" fill="#4a5566">{data.timeline.length > 48 ? `${t.hour / 24 + 1}. gün` : `${t.hour % 24}:00`}</text>)}
      </svg>
      <p className="pb-hint">Mavi sütun: o saatteki olay sayısı. Yeşil çizgi: telefon/kâğıda göre biriken personel zamanı kazancı ({hrs(visible[visible.length - 1]?.savedMinutes ?? 0)}).</p>
    </section>

    <h3>Telefon ve kâğıt ile Klinorbis</h3>
    <table className="pb-table"><thead><tr><th>Ölçü</th><th>Telefon ve kâğıt</th><th>Klinorbis</th></tr></thead>
      <tbody>{rows.map(([label, a, b]) => <tr key={label}><td>{label}</td><td>{a}</td><td><b>{b}</b></td></tr>)}</tbody></table>

    <h3>En çok zaman kazanan birimler</h3>
    <table className="pb-table"><thead><tr><th>Birim</th><th>Telefon ve kâğıt</th><th>Klinorbis</th><th>Fark</th></tr></thead>
      <tbody>{data.units.slice(0, 8).map((u) => <tr key={u.unitCode}><td>{u.unitName}</td><td>{hrs(u.phoneMinutes)}</td><td>{hrs(u.klinorbisMinutes)}</td><td><b>{hrs(u.savedMinutes)}</b></td></tr>)}</tbody></table>

    <details className="sim-assumptions" open>
      <summary>Varsayımlar ve sınırlar</summary>
      <ul>{data.assumptions.map((a) => <li key={a.key}>{a.label}: <b>{RATE_KEYS.has(a.key as keyof SimParams) ? `%${Math.round(a.value * 100)}` : a.value.toLocaleString("tr-TR")}</b></li>)}</ul>
      <p className="pb-hint">Olaylar: {num(data.events.total)} ({data.events.byType.slice(0, 6).map((e) => `${e.label} ${e.count}`).join(", ")}…). TL karşılığı yalnız koordinasyon zamanını (arama, form, takip) personel maliyetiyle çarpar; işten çıkarma veya kadro azaltma önermez. Temkinli değer model farkının yarısıdır. Gerçek kazanç ancak hastanenin kendi verisiyle yapılan pilotta ölçülür.</p>
    </details>
  </article>;
}
