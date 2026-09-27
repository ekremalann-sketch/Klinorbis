"use client";
// Yapılandırılmış operasyon formları (hasta nakli, taburculuk) ve FHIR R4 kapasite doğrulayıcı.
// Tüm doğrulama sunucuda yapılır; bu bileşen yalnız formu toplar ve sonucu gösterir.
import { useState, type FormEvent } from "react";

const DISCHARGE_ITEMS = [
  ["epikriz", "Epikriz / çıkış özeti hazır"], ["recete", "Reçete ve ilaç teslimi planlandı"], ["egitim", "Hasta/yakın bilgilendirmesi yapıldı"],
  ["kontrol", "Kontrol randevusu verildi"], ["ulasim", "Eve ulaşım ayarlandı"], ["fatura", "Vezne / provizyon işlemi tamam"],
] as const;

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) as T & { error?: string } };
}

export function OperationsForms() {
  const [kind, setKind] = useState<"transport" | "discharge">("transport");
  const [message, setMessage] = useState<{ text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const f = new FormData(element);
    const form = kind === "transport"
      ? { from: f.get("from"), to: f.get("to"), mobility: f.get("mobility"), priority: f.get("priority"), when: f.get("when") || undefined, oxygen: f.get("oxygen") === "on", monitor: f.get("monitor") === "on", escort: f.get("escort") === "on", note: f.get("note") }
      : { ward: f.get("ward"), plannedDate: f.get("plannedDate"), done: f.getAll("done"), note: f.get("note") };
    setBusy(true); setMessage(null);
    const r = await post<{ ticket: { reference: string }; destination: { unitName: string } }>("/api/tickets", { patientAlias: f.get("patientAlias"), formKind: kind, form });
    setBusy(false);
    if (!r.ok) { setMessage({ text: r.data.error || "Form gönderilemedi." }); return; }
    element.reset();
    setMessage({ text: `${r.data.ticket.reference} oluşturuldu · ${r.data.destination.unitName} kuyruğuna düştü.`, link: `/requests/${r.data.ticket.reference}` });
  }

  return (
    <section className="panel of-panel" aria-labelledby="of-title">
      <div className="panel-head"><div><h3 id="of-title">Operasyon formları</h3><p>Yapılandırılmış talep: doğru birime, doğru öncelikle, eksiksiz bilgiyle düşer. Hasta yalnız takma adla yazılır.</p></div></div>
      <div className="of-tabs" role="tablist" aria-label="Form türü">
        <button role="tab" aria-selected={kind === "transport"} className={kind === "transport" ? "active" : ""} onClick={() => setKind("transport")}>Hasta nakli</button>
        <button role="tab" aria-selected={kind === "discharge"} className={kind === "discharge" ? "active" : ""} onClick={() => setKind("discharge")}>Taburculuk</button>
      </div>
      <form className="of-form" onSubmit={submit} key={kind}>
        <label>Hasta / protokol takma adı<input name="patientAlias" required minLength={3} maxLength={40} pattern="[A-Za-zÇĞİÖŞÜçğıöşü0-9._\-]+" placeholder="ör. HST-2026-041" /></label>
        {kind === "transport" ? <>
          <label>Alınacak yer<input name="from" required minLength={2} maxLength={80} placeholder="ör. Radyoloji" /></label>
          <label>Götürülecek yer<input name="to" required minLength={2} maxLength={80} placeholder="ör. Kardiyoloji 3. kat" /></label>
          <label>Taşıma şekli<select name="mobility" required defaultValue=""><option value="" disabled>Seçin</option>{["Yürüyerek", "Tekerlekli sandalye", "Sedye", "Yatakla"].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Öncelik<select name="priority" defaultValue="Normal"><option>Normal</option><option>Yüksek</option></select></label>
          <label>Saat (boşsa hemen)<input name="when" type="time" /></label>
          <fieldset className="of-wide of-checks"><legend>Gerekli ekipman / eşlik</legend>
            <label className="of-check"><input type="checkbox" name="oxygen" />Oksijen desteği</label>
            <label className="of-check"><input type="checkbox" name="monitor" />Monitör</label>
            <label className="of-check"><input type="checkbox" name="escort" />Refakatçi personel</label>
          </fieldset>
        </> : <>
          <label>Servis / oda<input name="ward" required minLength={2} maxLength={60} placeholder="ör. Dahiliye 4B / 12" /></label>
          <label>Planlanan taburculuk tarihi<input name="plannedDate" type="date" required /></label>
          <fieldset className="of-wide of-checks"><legend>Tamamlanan adımlar (işaretlenmeyenler açık engel olarak birime iletilir)</legend>
            {DISCHARGE_ITEMS.map(([id, label]) => <label key={id} className="of-check"><input type="checkbox" name="done" value={id} />{label}</label>)}
          </fieldset>
        </>}
        <label className="of-wide">Operasyon notu <small>(tanı, tedavi veya kimlik yazmayın; telefon ve kimlik no otomatik maskelenir)</small><textarea name="note" maxLength={300} rows={2} /></label>
        <div className="of-wide of-actions"><button disabled={busy}>{busy ? "Gönderiliyor…" : kind === "transport" ? "Nakil talebi oluştur" : "Taburculuk talebi oluştur"}</button></div>
      </form>
      {message && <p className="of-message" role="status">{message.text} {message.link && <a href={message.link}>Talebi aç →</a>}</p>}
    </section>
  );
}

type Report = { ok: boolean; beds: number; units: { unitCode: string; unitName: string; total: number; occupied: number; available: number; cleaning: number; blocked: number; occupancy: number }[]; errors: string[]; warnings: string[]; error?: string };

export function FhirValidator() {
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSample() {
    const r = await fetch("/api/integrations/fhir", { cache: "no-store" });
    const d = await r.json() as { sample?: unknown; error?: string };
    if (!r.ok) { setMessage(d.error || "Örnek alınamadı."); return; }
    setText(JSON.stringify(d.sample, null, 2)); setReport(null); setMessage("Sentetik örnek yüklendi.");
  }
  async function run() {
    setBusy(true); setMessage("");
    const r = await post<Report>("/api/integrations/fhir", text || "{}");
    setBusy(false);
    if (r.status === 403 || r.status === 401) { setMessage(r.data.error || "Yetkiniz yok."); return; }
    if (r.data.error && !r.data.errors) { setMessage(r.data.error); return; }
    setReport(r.data);
  }

  return (
    <section className="panel of-panel" aria-labelledby="fhir-title">
      <div className="panel-head"><div><h3 id="fhir-title">FHIR R4 kapasite doğrulayıcı (test)</h3><p>HBYS&apos;nin göndereceği <code>Bundle</code> (Location, yatak durumu HL7 v2-0116) yapıştırılır; yataklar birimlere eşlenir. <b>Canlı bağlantı değildir, hiçbir veri saklanmaz</b>; entegrasyon öncesi eşleme ve veri kalitesi testi içindir.</p></div>
        <button type="button" className="of-secondary" onClick={() => void loadSample()}>Sentetik örnek yükle</button></div>
      <label className="of-code">FHIR Bundle (JSON)<textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} spellCheck={false} placeholder='{"resourceType":"Bundle","type":"collection","entry":[…]}' /></label>
      <div className="of-actions"><button type="button" disabled={busy || !text.trim()} onClick={() => void run()}>{busy ? "Doğrulanıyor…" : "Doğrula"}</button></div>
      {message && <p className="of-message" role="status">{message}</p>}
      {report && <div className="fhir-report" role="status">
        <p className={report.ok ? "fhir-ok" : "fhir-bad"}>{report.ok ? `Geçerli: ${report.beds} yatak, ${report.units.length} birim eşlendi.` : `${report.errors.length} hata bulundu; paket bu hâliyle alınmaz.`}</p>
        {report.units.length > 0 && <div className="fhir-table"><div className="head"><span>Birim</span><span>Toplam</span><span>Dolu</span><span>Boş</span><span>Temizlik</span><span>Kapalı</span><span>Doluluk</span></div>
          {report.units.map((u) => <div key={u.unitCode}><span><b>{u.unitName}</b> <small>{u.unitCode}</small></span><span>{u.total}</span><span>{u.occupied}</span><span>{u.available}</span><span>{u.cleaning}</span><span>{u.blocked}</span><span className={u.occupancy >= 90 ? "fhir-hot" : ""}>%{u.occupancy}</span></div>)}</div>}
        {report.errors.length > 0 && <><h4>Hatalar</h4><ul>{report.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul></>}
        {report.warnings.length > 0 && <><h4>Uyarılar</h4><ul>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></>}
      </div>}
    </section>
  );
}
