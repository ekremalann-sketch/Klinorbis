"use client";
import { useState } from "react";
import UnitPicker from "./unit-picker";
import DemoSummary from "./demo-summary";
import { HOSPITAL_UNITS } from "../../lib/hospital-units";
import { ROLE_MAP, type RoleKey } from "../../lib/role-map";
import { advanceDemo, demoStatusLabels, type DemoAction, type DemoRequest } from "../../lib/sales-demo";

const initialRequests: DemoRequest[] = [
  { id: "DEMO-001", unit: "CAG", target: "", priority: "Normal", status: "new", history: ["Kurgusal çağrıdan operasyon talebi oluşturuldu"] },
  { id: "DEMO-002", unit: "YTK", target: "", priority: "Yüksek", status: "assigned", history: ["Kurgusal kapasite talebi oluşturuldu", "Yatak yönetimi üstlendi"] },
  { id: "DEMO-003", unit: "KRD", target: "", priority: "Yüksek", status: "approval", history: ["Kurgusal koordinasyon talebi insan onayına sunuldu"] },
];
const tabs = ["Talep ve devir", "Komuta özeti", "Tüm birimler", "Kapasite", "Vardiya", "Roller", "Rapor ve denetim"] as const;
export default function SalesSandbox() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Talep ve devir");
  const [requests, setRequests] = useState<DemoRequest[]>(initialRequests);
  const [selected, setSelected] = useState("DEMO-001");
  const [unit, setUnit] = useState("CAG");
  const [target, setTarget] = useState("RND");
  const [priority, setPriority] = useState("Normal");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleKey>("operations_manager");
  const [message, setMessage] = useState("");
  const [shift, setShift] = useState<"active" | "pending" | "accepted">("active");
  const [capacity, setCapacity] = useState<Record<string, number>>({ YTK: 12, YOG: 2, ULS: 3 });
  const [events, setEvents] = useState<string[]>([]);
  const [nextId, setNextId] = useState(4);
  const current = requests.find(r => r.id === selected);
  const name = (code: string) => HOSPITAL_UNITS.find(u => u.code === code)?.name ?? code;
  const record = (event: string) => setEvents(items => [...items, event]);
  function act(action: DemoAction) {
    if (!current) return;
    try {
      const updated = advanceDemo(current, action, target);
      setRequests(items => items.map(r => r.id === current.id ? updated : r));
      const event = `${current.id}: ${updated.history.at(-1)}`;
      record(event); setMessage(event);
    } catch (error) { setMessage(error instanceof Error ? error.message : "İşlem uygulanamadı"); }
  }
  function reset() { setRequests(initialRequests); setSelected("DEMO-001"); setNextId(4); setShift("active"); setCapacity({ YTK: 12, YOG: 2, ULS: 3 }); setEvents([]); setMessage("Demo başlangıç durumuna döndü."); }
  function download() {
    const csv = "\uFEFFReferans;Birim;Öncelik;Durum\n" + requests.map(r => [r.id, name(r.unit), r.priority, demoStatusLabels[r.status]].join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "klinorbis-kurgusal-demo.csv"; link.click(); URL.revokeObjectURL(url); setMessage("Kurgusal demo raporu indirildi.");
  }
  return <section className="sales-sandbox" aria-labelledby="sandbox-title">
    <header><div><span className="kicker">ETKİLEŞİMLİ ÜRÜN TURU</span><h2 id="sandbox-title">Bir talebi baştan sona birlikte yönetin</h2><p>Yalnızca kurgusal kayıtlar. İşlemler bu sekmenin belleğinde kalır; yenileyince sıfırlanır. Gerçek kurum verisine erişmez.</p></div><button aria-label="Demoyu sıfırla" onClick={reset}>Sıfırla</button></header>
    <nav aria-label="Etkileşimli demo modülleri">{tabs.map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); setMessage(""); }}>{t}</button>)}</nav>
    <p className="sandbox-feedback" role="status">{message || "4 adımda deneyin: 1 Üstlen · 2 Aktar · 3 Kabul et · 4 Tamamla."}</p>
    {tab === "Talep ve devir" && <div className="sandbox-columns">
      <div><h3>1 · Yeni talep</h3><form onSubmit={e => { e.preventDefault(); if (!unit) return; const id = `DEMO-${String(nextId).padStart(3, "0")}`; setNextId(n => n + 1); setRequests(items => [...items, { id, unit, target: "", priority, status: "new", history: ["Kurgusal operasyon talebi oluşturuldu"] }]); setSelected(id); record(`${id}: talep oluşturuldu (${name(unit)})`); setMessage(`${id} oluşturuldu. Şimdi talebi üstlenebilirsiniz.`); }}>
        <UnitPicker value={unit} onChange={setUnit}/>
        <label>Öncelik<select value={priority} onChange={e => setPriority(e.target.value)}><option>Normal</option><option>Yüksek</option></select></label><p>Bu gösterim kişisel bilgi veya klinik karar girişi istemez.</p><button type="submit" className="demo-primary" disabled={!unit}>Örnek talep oluştur</button></form></div><section className="sandbox-queue-step">
        <h3>2 · Talep kuyruğu</h3><div className="sandbox-queue">{requests.map(r => <button key={r.id} aria-pressed={selected === r.id} onClick={() => { setSelected(r.id); setMessage(""); }}><b>{r.id}</b><span>{name(r.unit)}</span><small>{demoStatusLabels[r.status]} · {r.priority}</small></button>)}</div>
      </section>
      <article><h3>3 · İşlem ve izlenebilirlik</h3>{current && <><p><b>{current.id}</b> · {name(current.unit)}</p><p>Durum: <strong>{demoStatusLabels[current.status]}</strong></p>
        {current.status === "new" && <button onClick={() => act("claim")}>Talebi üstlen</button>}
        {current.status === "assigned" && <><label>Hedef birim<select value={target} onChange={e => setTarget(e.target.value)}>{HOSPITAL_UNITS.filter(u => u.code !== current.unit).map(u => <option key={u.code} value={u.code}>{u.name}</option>)}</select></label><div className="sandbox-actions"><button disabled={target === current.unit} onClick={() => act("transfer")}>Birime devir öner</button><button onClick={() => act("review")}>İnsan onayına sun</button><button onClick={() => act("complete")}>Operasyon görevini tamamla</button></div></>}
        {current.status === "approval" && <><p>Klinik karar vermez. Bu düğmeler yalnızca yetkili kişi onayının örnek akışını gösterir.</p><div className="sandbox-actions"><button onClick={() => act("approve")}>Demo onayı ver</button><button onClick={() => act("reject")}>Demo onayını reddet</button></div></>}
        {current.status === "transfer" && <><p>Hedef: {name(current.target)}. Kaynak sahipliği kabul edilene kadar korunur.</p><button onClick={() => act("accept")}>Hedef birim olarak devri kabul et</button></>}
        {current.status === "completed" && <p>Görev kapandı. Geçmiş kayıtları aşağıda izlenebilir.</p>}
        <h4>Talep geçmişi</h4><ol>{current.history.map((event, i) => <li key={i}>{event}</li>)}</ol></>}
      </article>
    </div>}
    {tab === "Komuta özeti" && <DemoSummary/>}
    {tab === "Tüm birimler" && <><h3>{HOSPITAL_UNITS.length} birim · ortak operasyon omurgası</h3><p>Her birimin kapsamını, sorumlu rolünü ve örnek hedef süresini inceleyin. Birim açmak ilgili kuyruğu ve talep oluşturma ekranını gösterir.</p><label>Birim ara<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Örneğin kardiyoloji, teknik, çağrı" /></label><div className="sandbox-units">{HOSPITAL_UNITS.filter(u => `${u.name} ${u.scope}`.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))).map(u => <article key={u.code}><h4>{u.name}</h4><p>{u.scope}</p><small>{u.assignedRole} · Örnek hedef: {u.slaMinutes} dk</small><p>{requests.filter(r => r.unit === u.code && r.status !== "completed").length} açık demo talebi</p><button onClick={() => { setUnit(u.code); setTab("Talep ve devir"); const r = requests.find(r => r.unit === u.code); if (r) setSelected(r.id); setMessage(`${u.name} seçildi. Bu birime kurgusal talep oluşturabilirsiniz.`); }}>Birim kuyruğunu aç</button></article>)}</div></>}
    {tab === "Kapasite" && <><h3>Örnek kaynak rezervasyonu</h3><p>Yalnızca operasyon uygunluğunu gösterir; klinik uygunluk ve gerçek yatak rezervasyonu oluşturmaz.</p><div className="sandbox-units">{Object.entries(capacity).map(([code, available]) => <article key={code}><h4>{name(code)}</h4><p>Uygun kaynak: <strong>{available}</strong></p><button disabled={available === 0} onClick={() => { setCapacity(c => ({ ...c, [code]: c[code] - 1 })); record(`${name(code)}: demo kaynak rezerve edildi`); setMessage(`${name(code)} için bir örnek kaynak rezerve edildi.`); }}>Demo kaynak rezerve et</button><button disabled={available >= ({ YTK: 12, YOG: 2, ULS: 3 }[code] ?? 0)} onClick={() => { setCapacity(c => ({ ...c, [code]: c[code] + 1 })); record(`${name(code)}: demo rezervasyon bırakıldı`); setMessage("Demo rezervasyonu bırakıldı."); }}>Rezervasyonu bırak</button></article>)}</div></>}
    {tab === "Vardiya" && <><h3>Vardiya devri</h3><p>Açık görevler: {requests.filter(r => r.status !== "completed").length}. Gelen ekip kabul edene kadar mevcut ekip sorumludur.</p><p>Durum: {shift === "active" ? "A ekibi görevde" : shift === "pending" ? "B ekibinin kabulü bekleniyor" : "B ekibi devri kabul etti"}</p><button disabled={shift !== "active"} onClick={() => { setShift("pending"); record("Vardiya: A ekibi B ekibine devir önerdi"); setMessage("B ekibinin kabulü bekleniyor."); }}>Vardiya devri başlat</button><button disabled={shift !== "pending"} onClick={() => { setShift("accepted"); record("Vardiya: B ekibi devri kabul etti"); setMessage("Demo vardiya devri tamamlandı."); }}>B ekibi olarak kabul et</button></>}
    {tab === "Roller" && <><h3>Görev ve yetki sınırları</h3><p>Bu bir rol tanıtımıdır; gerçek hesabınıza yetki atamaz.</p><label>İncelenen rol<select value={role} onChange={e => setRole(e.target.value as RoleKey)}>{Object.entries(ROLE_MAP).map(([key, r]) => <option value={key} key={key}>{r.title}</option>)}</select></label><h4>{ROLE_MAP[role].home}</h4><ul>{ROLE_MAP[role].does.map(t => <li key={t}>{t}</li>)}</ul><h4>Yetki sınırları</h4><ul>{ROLE_MAP[role].cannot.map(t => <li key={t}>{t}</li>)}</ul></>}
    {tab === "Rapor ve denetim" && <><h3>Gösterim özeti</h3><p>Toplam {requests.length} talep · {requests.filter(r => r.status === "completed").length} tamamlanan · {requests.filter(r => r.status === "approval").length} onay bekleyen</p><button onClick={download}>Kurgusal raporu indir (CSV)</button><h4>Bu oturumun işlem izi</h4>{events.length ? <ol>{events.map((event, i) => <li key={i}>{event}</li>)}</ol> : <p>Henüz işlem yok. Talep oluşturun veya mevcut kuyruğu kullanın.</p>}<aside><h4>Kurumsal pilot öncesi</h4><p>Bu demo gerçek HBYS bağlantısını, kurum hesabı yetkilendirmesini, bildirim teslimini veya klinik kabulü kanıtlamaz. Satış görüşmesinde bu başlıklar kurumun entegrasyon ve kabul planıyla ayrı doğrulanmalıdır.</p></aside></>}
  </section>;
}
