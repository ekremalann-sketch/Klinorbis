"use client";
// Hasta erişimi ve bilgilendirme ekranı:
//  1) Sistem nasıl işler: kanal → kayıt → kabul → onay → bilgilendirme → kapanış
//  2) Hekim yokluğu: bildir, planı gör, onay kutusuna gönder, hasta yanıtlarını işle
//  3) Bildirim kuyruğu: hangi hastaya, hangi kanaldan, hangi metin, durum
//  4) Kanal kuralları: kimlik doğrulama, ilk yanıt süresi, paylaşılabilecek ve paylaşılmayacak bilgi
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { maskEmail } from "../lib/privacy";

type Channel = { code: string; label: string; intakeUnit: string; firstResponseMinutes: number; identity: string; allowed: string; never: string; outbound: boolean };
type RequestType = { code: string; label: string; unit: string; automatedReply: boolean };
type Physician = { code: string; displayLabel: string; unitCode: string; facilityCode: string; dailyCapacity: number; training: boolean };
type Appt = { reference: string; patientAlias: string; physicianCode: string; unitCode: string; facilityCode: string; startsAt: string | number; status: string; clinicalPriority: boolean; allowOtherPhysician: boolean; preferredChannel: string | null; contactMasked: string | null; training: boolean };
type Absence = { reference: string; physicianCode: string; unitCode: string; day: string; reason: string; status: string; affectedCount: number; reportedBy: string; decidedBy: string | null };
type Change = { id: number; absenceReference: string; appointmentReference: string; option: string; proposedPhysicianCode: string | null; proposedFacilityCode: string | null; proposedStartsAt: string | number | null; reason: string; status: string; attempts: number };
type Note = { reference: string; appointmentReference: string | null; ticketReference: string | null; channel: string; template: string; body: string; status: string; provider: string; sendAfter: string | number; attempts: number; lastError: string | null };
type Data = {
  demoEnabled: boolean; mode: "live" | "training";
  identity: { role: string; label: string };
  catalog: { channels: Channel[]; requestTypes: RequestType[]; absenceReasons: Record<string, string>; options: Record<string, string>; responses: Record<string, string> };
  facilities: { code: string; name: string }[]; physicians: Physician[]; appointments: Appt[]; absences: Absence[]; changes: Change[]; notifications: Note[];
};

const when = (v: string | number | null | undefined) => (v ? new Date(v).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ABS_STATUS: Record<string, string> = { planned: "Onay bekliyor", approved: "Hastalar bilgilendiriliyor", closed: "Kapandı", rejected: "Plan reddedildi" };
const CHANGE_STATUS: Record<string, string> = { proposed: "Plan", review: "Hekim kararı bekliyor", offered: "Hastanın yanıtı bekleniyor", accepted: "Kabul etti", declined: "Başka zaman istedi", unreachable: "Ulaşılamadı", cancelled: "İptal" };
const NOTE_STATUS: Record<string, string> = { simulated:"Eğitim simülasyonu", queued: "Gönderime hazır", held: "Sessiz saat: 09:00'da", sent: "Gönderildi", delivered: "Ulaştı", failed: "Başarısız", call_task: "Telefonla aranacak" };
const CH: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "E-posta", phone: "Telefon", web: "Portal", desk: "Danışma" };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "x-klinorbis-request": "browser" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}

const STEPS = [
  { t: "1. Başvuru gelir", d: "Telefon, WhatsApp, SMS, web formu, e-posta veya danışma. Kanal ne olursa olsun tek kayıt açılır; telefon numarası ve TCKN metinden maskelenir.", who: "Çağrı merkezi / hasta iletişim" },
  { t: "2. Acil sinyal kontrolü", d: "“Göğüs ağrısı”, “nefes alamıyorum” gibi ifadelerde otomatik işlem durur, kayıt Acil Yönlendirme’ye düşer ve hekim onayı açılır. Hastaya 112 / acil servis söylenir; mesaj gönderilmez.", who: "Sistem + klinik rol" },
  { t: "3. Sınıflandırma ve kuyruk", d: "Randevu, değişiklik, iptal, sonuç, fatura, şikâyet, klinik soru. Her tür ilgili birim kuyruğuna ve süre hedefine (SLA) bağlanır.", who: "Sistem" },
  { t: "4. İşleme alma", d: "Birim görevlisi kaydı “kabul et” ile üstlenir. Kim, ne zaman aldı denetim izine yazılır; süre hedefi aşılırsa kayıt kırmızıya döner.", who: "Birim görevlisi" },
  { t: "5. Onay gereken işler", d: "Klinik devir, hekim yokluğunda toplu randevu değişikliği, klinik öncelikli hastanın ertelenmesi. Onayı, talebi açandan farklı bir yetkili verir.", who: "Birim sorumlusu / hekim" },
  { t: "6. Hasta bilgilendirme", d: "Hastanın izin verdiği kanaldan, tanı içermeyen kısa mesaj. 21:00–09:00 arası mesaj atılmaz; 24 saatten az kaldıysa telefonla aranır. Hasta EVET / ARA / İPTAL ile yanıtlar.", who: "Sistem + çağrı merkezi" },
  { t: "7. Kapanış", d: "Hastanın yanıtı kaydedilir. Eğitimde randevu taşınır; gerçek kayıtta kurum takviminde teyit görevi açılır. Tüm öneriler sonuçlanınca kayıt kapanır.", who: "Görevli" },
];

export function PatientAccess() {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"live" | "training">("live");
  const [tab, setTab] = useState<"model" | "absence" | "outbox" | "channels">("absence");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fetchData = useCallback(() => call<Data>(`/api/patient-access?mode=${mode}`), [mode]);
  const load = useCallback(async () => { try { setData(await fetchData()); } catch (e) { setMsg(e instanceof Error ? e.message : "Bilgiler alınamadı."); } }, [fetchData]);
  useEffect(() => { let alive = true; const timer = window.setTimeout(() => { setData(null); fetchData().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setMsg(e instanceof Error ? e.message : "Bilgiler alınamadı."); }); }, 0); return () => { alive = false; window.clearTimeout(timer); }; }, [fetchData]);
  async function run(body: unknown, done: string) {
    setBusy(true); setMsg("");
    try { await call("/api/patient-access", body); setMsg(done); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "İşlem tamamlanamadı."); } finally { setBusy(false); }
  }
  const doc = useCallback((code: string | null) => data?.physicians.find((p) => p.code === code)?.displayLabel ?? code ?? "—", [data]);
  const fac = useCallback((code: string | null) => data?.facilities.find((f) => f.code === code)?.name.replace(/ · Pilot$/, "") ?? code ?? "—", [data]);

  if (!data) return <section className="panel pa-panel"><p role="status">{msg || "Yükleniyor…"}</p></section>;
  const canReport = ["operations_manager", "unit_manager", "clinician"].includes(data.identity.role);
  const canRespond = ["operations_manager", "unit_manager", "clinician", "call_agent"].includes(data.identity.role);
  const canReview = data.identity.role === "clinician";
  const training = data.mode === "training";

  return <section className="pa-panel">
    {data.demoEnabled && <label className="pa-muted">Kayıt kapsamı <select value={mode} onChange={e=>setMode(e.target.value as "live"|"training")} disabled={busy}><option value="live">Kurum kayıtları</option><option value="training">Eğitim kayıtları</option></select></label>}
    <div className="pa-tabs" role="tablist" aria-label="Hasta erişimi bölümleri">
      {([["absence", "Hekim yokluğu"], ["outbox", "Hasta bilgilendirme"], ["model", "Sistem nasıl işler"], ["channels", "Kanal kuralları"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {data.demoEnabled && training && !data.physicians.length && data.identity.role === "operations_manager" && <button disabled={busy} onClick={()=>run({action:"demo.seed"},"Eğitim senaryosu açıldı.")}>Eğitim senaryosunu aç</button>}
    {training && <p className="pa-training"><b>EĞİTİM VERİSİ</b> · Takma kodlu örnek kayıtlar; gerçek SMS gönderilmez.</p>}
    <p className="pa-muted pa-oneline" title="Takvim aktarımı için bağlantı ucu hazır. Kuruma ait HBYS/MHRS ve mesaj sağlayıcısı bağlı değil; buradaki kabul, HBYS rezervasyon teyidi yerine geçmez.">HBYS/MHRS ve mesaj sağlayıcısı bağlı değil · ayrıntı için üzerine gelin</p><p className="pa-msg" role="status">{msg}</p>
    {tab === "model" && <Model />}
    {tab === "channels" && <Channels data={data} />}
    {tab === "absence" && <AbsenceBoard data={data} busy={busy} canReport={canReport} canRespond={canRespond} canReview={canReview} run={run} doc={doc} fac={fac} />}
    {tab === "outbox" && <Outbox data={data} busy={busy} canDispatch={["operations_manager", "unit_manager", "call_agent"].includes(data.identity.role)} run={run} />}
  </section>;
}

function Model() {
  return <div className="pa-model">
    <div className="panel pa-goal"><h2 className="pa-h">Sistem neyi hedefliyor?</h2><p>Hastanın hangi kanaldan ulaştığı fark etmeksizin başvurusunun <b>kaybolmaması</b>, <b>doğru birime</b> gitmesi, <b>süresinde</b> karşılanması ve sonucun hastaya <b>anlaşılır biçimde</b> bildirilmesi. Klinorbis tıbbi karar vermez; acil olasılıkta otomasyonu durdurup sağlık personeline devreder.</p></div>
    <ol className="pa-steps">{STEPS.map((s) => <li key={s.t} className="panel"><b>{s.t}</b><p>{s.d}</p><small>Sorumlu: {s.who}</small></li>)}</ol>
    <div className="panel pa-goal"><h2 className="pa-h">O gün doktor yoksa ne olur?</h2>
      <ol className="pa-list">
        <li><b>Bildirim:</b> Birim sorumlusu veya hekim, yokluğu gün ve nedenle girer. Neden yalnız iç kayıtta kalır; hastaya yazılmaz.</li>
        <li><b>Plan:</b> Sistem o günkü randevuları bulur ve her biri için öneri çıkarır: klinik öncelikli hasta → hekim değerlendirmesi; hasta başka hekime izin verdiyse → aynı gün aynı saatte branştan başka hekim; değilse → aynı hekimin 14 gün içindeki ilk uygun günü; o da yoksa → başka kampüs; hiçbiri yoksa → çağrı merkezi arar.</li>
        <li><b>Onay:</b> Plan, yokluğu bildirenden farklı bir yetkilinin onayına gider. Onaydan önce hastaya hiçbir şey gönderilmez.</li>
        <li><b>Bilgilendirme:</b> Onayla birlikte her hastaya izin verdiği kanaldan kısa mesaj kuyruğa girer; randevuya 24 saatten az kaldıysa veya izinli kanal yoksa çağrı merkezi görevi açılır.</li>
        <li><b>Yanıt:</b> Hasta EVET derse eğitim randevusu taşınır; gerçek randevu için HBYS teyidi beklenir; ARA derse geri arama görevi açılır; üç denemede ulaşılamazsa kayıt takibe düşer, slot boşa harcanmaz.</li>
      </ol></div>
  </div>;
}

function Channels({ data }: { data: Data }) {
  return <div className="panel pa-table-wrap"><table className="pa-table"><caption>Kanal kuralları</caption><thead><tr><th scope="col">Kanal</th><th scope="col">İlk karşılayan</th><th scope="col">İlk yanıt</th><th scope="col">Kimlik doğrulama</th><th scope="col">Paylaşılır</th><th scope="col">Asla paylaşılmaz</th></tr></thead>
    <tbody>{data.catalog.channels.map((c) => <tr key={c.code}><th scope="row">{c.label}</th><td>{c.intakeUnit}</td><td>{c.firstResponseMinutes < 60 ? `${c.firstResponseMinutes} dk` : `${c.firstResponseMinutes / 60} saat`}</td><td>{c.identity}</td><td>{c.allowed}</td><td>{c.never}</td></tr>)}</tbody></table>
    <h2 className="pa-h pa-sub">Talep türleri</h2>
    <ul className="pa-chips">{data.catalog.requestTypes.map((t) => <li key={t.code}><b>{t.label}</b> → {t.unit}{t.automatedReply ? " · otomatik alındı mesajı" : " · görevli yanıtlar"}</li>)}</ul>
  </div>;
}

function AbsenceBoard({ data, busy, canReport, canRespond, canReview, run, doc, fac }: { data: Data; busy: boolean; canReport: boolean; canRespond: boolean; canReview: boolean; run: (b: unknown, done: string) => Promise<void>; doc: (c: string | null) => string; fac: (c: string | null) => string }) {
  const [physician, setPhysician] = useState(data.physicians[0]?.code ?? "");
  const firstDay = useMemo(() => { const a = data.appointments.find((x) => x.physicianCode === physician); return a ? new Date(Number(new Date(a.startsAt)) + 3 * 3600000).toISOString().slice(0, 10) : ""; }, [data, physician]);
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("sick");
  const [selected, setSelected] = useState<string | null>(data.absences[0]?.reference ?? null);
  const [review, setReview] = useState<Record<number, { physicianCode: string; startsAt: string }>>({});
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const absence = data.absences.find((a) => a.reference === selected) ?? data.absences[0];
  const changes = data.changes.filter((c) => c.absenceReference === absence?.reference);
  const apptOf = (ref: string) => data.appointments.find((a) => a.reference === ref);
  const count = (s: string) => changes.filter((c) => c.status === s).length;
  function submit(e: FormEvent) { e.preventDefault(); void run({ action: "absence.report", physicianCode: physician, day: day || firstDay, reason }, "Yokluk kaydedildi. Plan onay kutusuna gönderildi; onaydan önce hastalara mesaj gitmez."); }
  return <div className="pa-grid">
    <div className="pa-left">
      {canReport && <form className="panel pa-form" onSubmit={submit} aria-label="Hekim yokluğu bildir">
        <h2 className="pa-h">Hekim yokluğu bildir</h2>
        <label>Hekim<select value={physician} onChange={(e) => setPhysician(e.target.value)}>{data.physicians.map((p) => <option key={p.code} value={p.code}>{p.displayLabel} · {p.unitCode} · {fac(p.facilityCode)}</option>)}</select></label>
        <label>Gün<b className="field-star" aria-hidden="true"> *</b><input type="date" value={day || firstDay} onChange={(e) => setDay(e.target.value)} required /></label>
        <label>Neden (hastaya gösterilmez)<select value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(data.catalog.absenceReasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button type="submit" disabled={busy || !physician}>Etkilenen randevuları planla</button>
      </form>}
      <div className="panel"><h2 className="pa-h">Yokluk kayıtları</h2>{data.absences.length ? <ul className="pa-abs">{data.absences.map((a) => <li key={a.reference}><button type="button" aria-pressed={absence?.reference === a.reference} onClick={() => setSelected(a.reference)}><b>{doc(a.physicianCode)}</b><span>{a.day} · {a.affectedCount} randevu</span><em className={`pa-st ${a.status}`}>{ABS_STATUS[a.status] ?? a.status}</em></button></li>)}</ul> : <p className="pa-muted">Henüz yokluk bildirilmedi.</p>}</div>
    </div>
    <div className="panel pa-right">
      {absence ? <>
        <div className="pa-head"><div><h2 className="pa-h">{doc(absence.physicianCode)} · {absence.day}</h2><p className="pa-muted">{data.catalog.absenceReasons[absence.reason]} · bildiren {maskEmail(absence.reportedBy)}{absence.decidedBy ? ` · karar ${maskEmail(absence.decidedBy)}` : ""}</p></div><em className={`pa-st ${absence.status}`}>{ABS_STATUS[absence.status] ?? absence.status}</em></div>
        {absence.status === "planned" && <p className="pa-note">Plan <b>İnsan Onayları</b> ekranında <code>ONAY-{absence.reference}</code> olarak bekliyor. Yokluğu bildiren kişi onaylayamaz.</p>}
        <div className="pa-counters"><span>Yanıt bekleyen <b>{count("offered")}</b></span><span>Kabul <b>{count("accepted")}</b></span><span>Hekim kararı <b>{count("review")}</b></span><span>Geri arama <b>{count("declined")}</b></span><span>Ulaşılamadı <b>{count("unreachable")}</b></span></div>
        <div className="pa-table-wrap"><table className="pa-table"><caption className="sr-only">Etkilenen randevular ve öneriler</caption><thead><tr><th scope="col">Hasta (takma ad)</th><th scope="col">Eski randevu</th><th scope="col">Öneri</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
          <tbody>{changes.map((c) => { const a = apptOf(c.appointmentReference); const r = review[c.id] ?? { physicianCode: "", startsAt: "" }; return <tr key={c.id}>
            <th scope="row">{a?.patientAlias ?? c.appointmentReference}{a?.clinicalPriority && <em className="pa-flag">Klinik öncelik</em>}<small>{a?.contactMasked ?? "iletişim izni yok"}</small></th>
            <td>{when(a?.startsAt)}<small>{doc(a?.physicianCode ?? null)}</small></td>
            <td><b>{data.catalog.options[c.option] ?? c.option}</b>{c.proposedStartsAt && <small>{when(c.proposedStartsAt)} · {doc(c.proposedPhysicianCode)} · {fac(c.proposedFacilityCode)}</small>}<small className="pa-muted">{c.reason}</small></td>
            <td><span className={`pa-st ${c.status}`}>{CHANGE_STATUS[c.status] ?? c.status}</span>{c.attempts > 0 && <small>{c.attempts} deneme</small>}</td>
            <td className="pa-actions">
              {c.status === "offered" && canRespond && absence.status !== "planned" && <>
                {c.proposedStartsAt && <button type="button" disabled={busy} onClick={() => void run({ action: "response.record", changeId: c.id, response: "accepted" }, "Hasta kabul etti; randevu taşındı ve onay mesajı kuyruğa girdi.")}>Kabul etti</button>}
                <button type="button" disabled={busy} onClick={() => void run({ action: "response.record", changeId: c.id, response: "declined" }, "Geri arama görevi açıldı.")}>Başka zaman</button>
                <button type="button" disabled={busy} onClick={() => void run({ action: "response.record", changeId: c.id, response: "unreachable" }, "Ulaşılamadı olarak işlendi.")}>Ulaşılamadı</button>
                {confirmCancel === c.id
                  ? <span className="inline-confirm" role="group" aria-label="Randevu iptali onayı"><span>Randevu iptal edilsin mi?</span><button type="button" className="danger" disabled={busy} onClick={() => { setConfirmCancel(null); void run({ action: "response.record", changeId: c.id, response: "cancelled" }, "Randevu iptal edildi."); }}>Evet, iptal et</button><button type="button" onClick={() => setConfirmCancel(null)}>Vazgeç</button></span>
                  : <button type="button" className="pa-danger" disabled={busy} onClick={() => setConfirmCancel(c.id)}>İptal istedi</button>}
              </>}
              {c.status === "review" && canReview && absence.status === "approved" && <div className="pa-review">
                <select aria-label="Hekim" value={r.physicianCode} onChange={(e) => setReview({ ...review, [c.id]: { ...r, physicianCode: e.target.value } })}><option value="">Hekim seçin</option>{data.physicians.filter((p) => p.unitCode === a?.unitCode && p.code !== absence.physicianCode).map((p) => <option key={p.code} value={p.code}>{p.displayLabel}</option>)}</select>
                <input aria-label="Zaman" type="datetime-local" value={r.startsAt} onChange={(e) => setReview({ ...review, [c.id]: { ...r, startsAt: e.target.value } })} />
                <button type="button" disabled={busy || !r.physicianCode || !r.startsAt} onClick={() => void run({ action: "review.decide", changeId: c.id, physicianCode: r.physicianCode, startsAt: new Date(r.startsAt).getTime() }, "Randevu değişikliği onaylandı; hastaya randevu teklifi gönderilecek.")}>Öneriyi gönder</button>
                <button type="button" disabled={busy} onClick={() => void run({ action: "review.decide", changeId: c.id, callback: true }, "Hasta öncelikli aranacak.")}>Öncelikli arasın</button>
              </div>}
            </td></tr>; })}</tbody></table></div>
      </> : <p className="pa-muted">Bir yokluk kaydı seçin veya soldan yeni yokluk bildirin.</p>}
    </div>
  </div>;
}

function Outbox({ data, busy, canDispatch, run }: { data: Data; busy: boolean; canDispatch: boolean; run: (b: unknown, done: string) => Promise<void> }) {
  const waiting = data.notifications.filter((n) => ["queued", "held"].includes(n.status)).length;
  return <div className="panel">
    <div className="pa-head"><div><h2 className="pa-h">Hasta bilgilendirme kuyruğu</h2><p className="pa-muted">Tanı ve neden içermez · 21:00–09:00 bekletilir · sağlayıcı yokken çağrı merkezine düşer.</p></div>
      {canDispatch && <button type="button" disabled={busy || !waiting} onClick={() => void run({ action: "notifications.dispatch" }, "Kuyruk işlendi.")}>Kuyruğu işle ({waiting})</button>}</div>
    <div className="pa-table-wrap"><table className="pa-table"><caption className="sr-only">Hasta bildirimleri</caption><thead><tr><th scope="col">Kayıt</th><th scope="col">Kanal</th><th scope="col">Metin</th><th scope="col">Durum</th></tr></thead>
      <tbody>{data.notifications.map((n) => <tr key={n.reference}><th scope="row">{n.appointmentReference ?? n.ticketReference}<small>{n.reference}</small></th><td>{CH[n.channel] ?? n.channel}</td><td className="pa-body">{n.body}</td><td><span className={`pa-st ${n.status}`}>{NOTE_STATUS[n.status] ?? n.status}</span>{n.provider === "simulation" && <small>eğitim simülasyonu</small>}{n.status === "held" && <small>{when(n.sendAfter)}</small>}{n.lastError && <small>{n.lastError}</small>}</td></tr>)}</tbody></table></div>
    {!data.notifications.length && <p className="pa-muted">Henüz bildirim yok. Bir yokluk planı onaylandığında burada görünür.</p>}
  </div>;
}
