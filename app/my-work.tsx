"use client";
// "İşlerim": personelin ana ekranı. Her iş kartı üç soruyu yanıtlar: ne yapmalıyım (tek ana düğme),
// iş nerede ve kimde (konum, birim, sahip), sonraki adım ne. İkincil işlemler "Diğer seçenekler" altında.
// Bütün kurallar sunucuda uygulanır (lib/my-work.ts); bu ekran yalnız geçerli eylemi gösterir.
import { useState } from "react";
import { api, dueText, FormDialog, Opt, Receipt, Req, StaleBanner, StateBox, useLive } from "./work-ui";

export type WorkTask = {
  reference: string; title: string; location: string | null; unitCode: string; unitName: string; priority: string; status: string;
  dueAt: string | null; overdue: boolean; minutesLeft: number | null; owner: { mine: boolean; label: string } | null;
  blockedReason: string | null; helpRequested: boolean; escalationLevel: number;
  action: "accept" | "start" | "complete" | "approve" | "inspect" | "open" | "wait" | "none"; actionLabel: string; why: string;
  flow: { reference: string; title: string; step: number; steps: number; approval: boolean } | null; nextStep: string | null; link: string;
  inspection: { cleanedBy: string; flow: string } | null;
};
type ReqType = { code: string; label: string; hint: string; fields: ("location" | "target" | "device")[]; clinicalNote: string | null; fault: boolean; unit: { code: string; name: string }; dispatcher: string | null };
type Data = {
  mine: WorkTask[]; available: WorkTask[]; teamCount: number;
  handoffs: { id: number; task: WorkTask | null; note: string | null }[];
  faults: { reference: string; category: string; status: string; createdAt: string }[];
  canReportFault: boolean; myUnits: { code: string; name: string }[];
  teammates: { email: string; unitCode: string; label: string }[];
  requestTypes: { group: string; types: ReqType[] }[];
  requests: { reference: string; label: string; unit: string; location: string | null; status: string; state: string }[];
};
const CATEGORIES: [string, string][] = [["cihaz", "Tıbbi cihaz"], ["oda", "Oda / mobilya / tesisat"], ["elektrik", "Elektrik / aydınlatma"], ["iklim", "Isıtma / soğutma"], ["asansor", "Asansör"], ["diger", "Diğer teknik sorun"]];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const go = (path: string) => window.dispatchEvent(new CustomEvent("klinorbis:go", { detail: path }));
const remembered = (k: string) => { try { return window.localStorage.getItem(k) ?? ""; } catch { return ""; } };
const remember = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* özel pencere */ } };

const AFTER: Record<string, string> = {
  accept: "İşi kabul ettiniz; artık sizin sorumluluğunuzda. Sonraki adım: işe başlayınca “Başla”ya basın.",
  start: "İşe başladınız. Bitince “Tamamla”ya basın.",
  complete: "İş tamamlandı. Akışın sonraki adımı ilgili birime iletildi.",
  approve: "Onay verildi; akış sonraki adıma geçti.",
};

export function MyWork() {
  const live = useLive<Data>("/api/my-work");
  const [busy, setBusy] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [dlg, setDlg] = useState<null | { kind: "block" | "handoff" | "inspect" | "fault" | "faultNo" | "request" | "requestNo"; task?: WorkTask; ref?: string }>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [fault, setFault] = useState({ category: "", location: "", deviceCode: "", note: "" });
  const [req, setReq] = useState({ type: "", location: "", targetLocation: "", deviceCode: "", note: "" });
  const [reqGroup, setReqGroup] = useState("");
  const [inspectPass, setInspectPass] = useState<boolean | null>(null);
  const d = live.data;

  async function act(task: WorkTask, action: string, extra: Record<string, unknown> = {}, message?: string) {
    if (busy) return;
    setBusy(`${task.reference}:${action}`); setError("");
    try {
      const r = await api<{ result?: { next?: string } }>("/api/my-work", { action, reference: task.reference, ...extra });
      setReceipt(r.result?.next ?? message ?? AFTER[action] ?? "İşlem kaydedildi.");
      await live.reload();
      window.dispatchEvent(new Event("klinorbis:refresh"));
    } catch (e) { setError(e instanceof Error ? e.message : "İşlem tamamlanamadı."); await live.reload(); }
    finally { setBusy(""); }
  }
  function primary(task: WorkTask) {
    if (task.action === "open") return go(task.link);
    if (task.action === "inspect") { setInspectPass(null); setText(""); return setDlg({ kind: "inspect", task }); }
    if (["accept", "start", "complete", "approve"].includes(task.action)) void act(task, task.action === "approve" ? "complete" : task.action, {}, AFTER[task.action]);
  }
  const close = () => { setDlg(null); setText(""); setEmail(""); };

  return (
    <section className="wk" aria-labelledby="wk-title">
      <div className="wk-head">
        <div>
          <h2 id="wk-title">İşlerim</h2>
          <p>Önce size atanan işler, sonra biriminizde alınabilecek işler. Her kartta yalnız şu an geçerli işlem etkindir.</p>
        </div>
        {!!d?.requestTypes.length && <button type="button" className="wk-secondary wk-big" onClick={() => { setReq({ type: "", location: remembered("kb.lastLocation"), targetLocation: "", deviceCode: "", note: "" }); setReqGroup(d.requestTypes[0]?.group ?? ""); setDlg({ kind: "request" }); }}>Talep aç <small className="wk-btn-sub">arıza, temizlik, taşıma…</small></button>}
      </div>
      <StaleBanner live={live} />
      <Receipt text={receipt} onClose={() => setReceipt("")} />
      {error && <div className="wk-alert" role="alert"><b>İşlem yapılmadı.</b> {error}</div>}
      <StateBox live={live}>
        {d && <>
          {d.handoffs.length > 0 && <div className="wk-group">
            <h3>Size önerilen devirler <span className="wk-count">{d.handoffs.length}</span></h3>
            {d.handoffs.map((h) => <article key={h.id} className="wk-card">
              <header><b>{h.task?.title ?? "İş"}</b><span>{h.task?.location ?? h.task?.unitName}</span></header>
              <p className="wk-meta">Şu an sorumlu: {h.task?.owner?.label ?? "—"}. Kabul edene kadar sorumluluk onda kalır.{h.note ? ` Not: ${h.note}` : ""}</p>
              <div className="wk-actions">
                <button type="button" className="wk-primary" disabled={!!busy} onClick={() => void api("/api/my-work", { action: "handoff.decide", id: h.id, accept: true }).then(async () => { setReceipt("Devri kabul ettiniz; iş artık sizde."); await live.reload(); }, (e) => setError(e.message))}>Devri kabul et</button>
                <button type="button" className="wk-secondary" disabled={!!busy} onClick={() => void api("/api/my-work", { action: "handoff.decide", id: h.id, accept: false }).then(async () => { setReceipt("Devri reddettiniz; iş önceki sahibinde kaldı."); await live.reload(); }, (e) => setError(e.message))}>Reddet</button>
              </div>
            </article>)}
          </div>}
          {d.faults.some((f) => f.status === "awaiting_confirmation") && <div className="wk-group">
            <h3>Bildirdiğiniz arızalar · onayınız bekleniyor</h3>
            {d.faults.filter((f) => f.status === "awaiting_confirmation").map((f) => <article key={f.reference} className="wk-card">
              <header><b>{CAT_LABEL[f.category] ?? "Arıza"}</b><span>{f.reference}</span></header>
              <p className="wk-meta">Teknik ekip işi kapattı. Sorun giderildi mi?</p>
              <div className="wk-actions">
                <button type="button" className="wk-primary" onClick={() => void api("/api/my-work", { action: "fault.confirm", reference: f.reference, resolved: true }).then(async () => { setReceipt("Teşekkürler; arıza kaydı kapandı."); await live.reload(); }, (e) => setError(e.message))}>Giderildi</button>
                <button type="button" className="wk-secondary" onClick={() => { setText(""); setDlg({ kind: "faultNo", ref: f.reference }); }}>Sorun sürüyor</button>
              </div>
            </article>)}
          </div>}
          <div className="wk-group">
            <h3>Size atanan işler <span className="wk-count">{d.mine.length}</span></h3>
            {d.mine.length === 0 ? <p className="wk-empty-line">Üzerinizde açık iş yok.{d.available.length ? " Aşağıdan alınabilecek bir işi kabul edebilirsiniz." : ""}</p>
              : d.mine.map((t) => <TaskCard key={t.reference} task={t} busy={busy} onPrimary={() => primary(t)}
                secondary={<>
                  {!t.helpRequested && t.owner?.mine && <button type="button" onClick={() => void act(t, "help", {}, "Yardım isteğiniz birim sorumlusuna iletildi. İş sizde kalmaya devam ediyor.")}>Yardım iste</button>}
                  {t.owner?.mine && !t.blockedReason && <button type="button" onClick={() => { setText(""); setDlg({ kind: "block", task: t }); }}>Engel bildir</button>}
                  {t.blockedReason && <button type="button" onClick={() => void act(t, "unblock", {}, "Engel kaldırıldı.")}>Engel kalktı</button>}
                  {t.owner?.mine && ["accepted", "in_progress"].includes(t.status) && <button type="button" onClick={() => { setEmail(""); setText(""); setDlg({ kind: "handoff", task: t }); }}>Devir öner</button>}
                  {t.link && <button type="button" onClick={() => go(t.link)}>Kaydı aç</button>}
                </>} />)}
          </div>
          {d.requests.length > 0 && <div className="wk-group">
            <h3>Açtığım talepler <span className="wk-count">{d.requests.length}</span></h3>
            {d.requests.map((r) => <article key={r.reference} className="wk-card wk-card-compact">
              <header><b>{r.label}</b><span className="wk-tag">{r.unit}</span></header>
              <p className="wk-meta">{r.location ? `${r.location} · ` : ""}{r.state}</p>
              {r.status === "done" && <div className="wk-actions">
                <button type="button" className="wk-primary" disabled={!!busy} onClick={() => void api("/api/my-work", { action: "request.confirm", reference: r.reference, ok: true }).then(async () => { setReceipt("Teşekkürler; talep kapandı."); await live.reload(); }, (e) => setError(e.message))}>Tamam, sorun çözüldü</button>
                <button type="button" className="wk-secondary" onClick={() => { setText(""); setDlg({ kind: "requestNo", ref: r.reference }); }}>Sorun sürüyor</button>
              </div>}
            </article>)}
          </div>}
          <div className="wk-group">
            <h3>Alınabilecek işler <span className="wk-count">{d.available.length}</span></h3>
            {d.available.length === 0 ? <p className="wk-empty-line">Biriminizde sahipsiz iş yok.</p>
              : d.available.map((t) => <TaskCard key={t.reference} task={t} busy={busy} onPrimary={() => primary(t)} secondary={t.link ? <button type="button" onClick={() => go(t.link)}>Kaydı aç</button> : null} />)}
            {d.teamCount > 0 && <p className="wk-note">Biriminizde başkalarının üstlendiği {d.teamCount} iş daha var; başkasının kabul ettiği iş buradan alınamaz.</p>}
          </div>
          {d.faults.some((f) => f.status === "open") && <div className="wk-group">
            <h3>Açık arıza bildirimleriniz</h3>
            <ul className="wk-list">{d.faults.filter((f) => f.status === "open").map((f) => <li key={f.reference}><b>{CAT_LABEL[f.category] ?? "Arıza"}</b> · {f.reference} · teknik ekipte</li>)}</ul>
          </div>}
        </>}
      </StateBox>

      <FormDialog open={dlg?.kind === "block"} title="Engel bildir" description={<>İşi neyin durdurduğunu kısaca yazın. Birim sorumlusuna bildirim gider; iş sizde kalır.</>}
        submitLabel="Engeli bildir" submitDisabled={text.trim().length < 5} onClose={close}
        onSubmit={async () => { await api("/api/my-work", { action: "block", reference: dlg!.task!.reference, reason: text }); close(); setReceipt("Engel kaydedildi ve birim sorumlusuna bildirildi."); await live.reload(); }}>
        <label className="wk-field"><span>Engel nedeni <Req /></span><textarea rows={3} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="ör. Oda kilitli, anahtar bekleniyor" aria-describedby="wk-pii" /></label>
        <small id="wk-pii" className="wk-hint">En az 5 karakter. Hasta adı veya kimlik bilgisi yazmayın; telefon ve TCKN otomatik maskelenir.</small>
      </FormDialog>

      <FormDialog open={dlg?.kind === "handoff"} title="Devir öner" description={<>Önerdiğiniz kişi kabul edene kadar iş <b>sizde kalır</b>.</>}
        submitLabel="Devri öner" submitDisabled={!email} onClose={close}
        onSubmit={async () => { await api("/api/my-work", { action: "handoff", reference: dlg!.task!.reference, email, note: text }); close(); setReceipt("Devir önerisi gönderildi. Kabul edilene kadar iş sizde."); await live.reload(); }}>
        <label className="wk-field"><span>Kime <Req /></span>
          <select value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Kişi seçin</option>
            {(d?.teammates ?? []).filter((m) => m.unitCode === dlg?.task?.unitCode).map((m) => <option key={m.email} value={m.email}>{m.label}</option>)}
          </select>
        </label>
        <label className="wk-field"><span>Not <Opt /></span><input maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="ör. Malzeme hazır, oda 2. katta" /></label>
      </FormDialog>

      <FormDialog open={dlg?.kind === "inspect"} title="Temizlik kontrolü" danger={inspectPass === false}
        description={<>{dlg?.task?.location ? <b>{dlg.task.location}</b> : null} Temizleyen: {dlg?.task?.inspection?.cleanedBy ?? "—"}. Kontrolden geçerse akış teknik kontrole ilerler; geçmezse yeniden temizlik açılır.</>}
        submitLabel={inspectPass === false ? "Geçmedi — yeniden temizlik aç" : "Kontrolden geçti"} submitDisabled={inspectPass === null || (inspectPass === false && text.trim().length < 5)} onClose={close}
        onSubmit={async () => { const r = await api<{ result?: { next?: string } }>("/api/my-work", { action: "inspect", reference: dlg!.task!.reference, pass: inspectPass, reason: text }); close(); setReceipt(r.result?.next ?? "Kontrol kaydedildi."); await live.reload(); }}>
        <fieldset className="wk-choice"><legend>Sonuç <Req /></legend>
          <label><input type="radio" name="ins" checked={inspectPass === true} onChange={() => setInspectPass(true)} /> Geçti</label>
          <label><input type="radio" name="ins" checked={inspectPass === false} onChange={() => setInspectPass(false)} /> Geçmedi</label>
        </fieldset>
        {inspectPass === false && <label className="wk-field"><span>Geçmeme nedeni <Req /></span><textarea rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="ör. Banyo dezenfekte edilmemiş" /></label>}
      </FormDialog>

      <FormDialog open={dlg?.kind === "fault"} title="Arıza bildir"
        description={<>Yalnız arıza türünü seçmeniz yeterli. Talep doğru teknik birime kendiliğinden gider.{d?.myUnits[0] ? <> Bildiren birim: <b>{d.myUnits[0].name}</b> (otomatik).</> : null}</>}
        submitLabel="Arızayı bildir" submitDisabled={!fault.category} onClose={close}
        onSubmit={async () => {
          const r = await api<{ result: { reference: string; routedTo: string; firstStep: string } }>("/api/my-work", { action: "fault.report", ...fault });
          if (fault.location) remember("kb.lastLocation", fault.location);
          close(); setReceipt(`Arıza kaydı açıldı (${r.result.reference}). ${r.result.routedTo} birimine gitti; ilk adım: ${r.result.firstStep}. İş kapanınca size “giderildi mi?” diye sorulacak.`); await live.reload();
        }}>
        <fieldset className="wk-choice wk-choice-grid"><legend>Arıza türü <Req /></legend>
          {CATEGORIES.map(([k, v]) => <label key={k}><input type="radio" name="cat" checked={fault.category === k} onChange={() => setFault({ ...fault, category: k })} /> {v}</label>)}
        </fieldset>
        <label className="wk-field"><span>Oda / konum <Opt /></span><input maxLength={24} value={fault.location} onChange={(e) => setFault({ ...fault, location: e.target.value })} placeholder="ör. 312-B" /></label>
        {fault.category === "cihaz" && <label className="wk-field"><span>Cihaz kodu <Opt /></span><input maxLength={24} value={fault.deviceCode} onChange={(e) => setFault({ ...fault, deviceCode: e.target.value })} placeholder="ör. BMD-0457 (etiketin üstünde)" /></label>}
        <label className="wk-field"><span>Kısa açıklama <Opt /></span><input maxLength={300} value={fault.note} onChange={(e) => setFault({ ...fault, note: e.target.value })} placeholder="ör. Alarm veriyor, ekran kapanıyor" /></label>
        <small className="wk-hint">Hasta bilgisi yazmayın. Hastanın güvenliği risk altındaysa önce birim prosedürünü uygulayın.</small>
      </FormDialog>

      <FormDialog open={dlg?.kind === "faultNo"} title="Sorun sürüyor" description="Arıza aynı teknik birime yeniden açılır ve önceki kayıtla ilişkilendirilir." submitLabel="Yeniden aç" onClose={close}
        onSubmit={async () => { await api("/api/my-work", { action: "fault.confirm", reference: dlg!.ref, resolved: false, note: text }); close(); setReceipt("Arıza yeniden açıldı ve teknik birime iletildi."); await live.reload(); }}>
        <label className="wk-field"><span>Ne sürüyor? <Opt /></span><input maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="ör. Işık yine yanıp sönüyor" /></label>
      </FormDialog>
      <FormDialog open={dlg?.kind === "request"} title="Talep aç"
        description={<>Ne gerektiğini seçin; talep doğru birime kendiliğinden gider ve işi o birimin sorumlusu dağıtır.{d?.myUnits[0] ? <> Talep eden birim: <b>{d.myUnits[0].name}</b> (otomatik).</> : null}</>}
        submitLabel="Talebi gönder" onClose={close}
        submitDisabled={(() => { const t = d?.requestTypes.flatMap((g) => g.types).find((x) => x.code === req.type); return !t || (t.fields.includes("target") && (!req.location.trim() || !req.targetLocation.trim())); })()}
        onSubmit={async () => {
          const r = await api<{ result: { next: string } }>("/api/my-work", { action: "request", type: req.type, location: req.location, targetLocation: req.targetLocation, deviceCode: req.deviceCode, note: req.note });
          if (req.location) remember("kb.lastLocation", req.location);
          close(); setReceipt(r.result.next); await live.reload();
        }}>
        <div className="wk-tabs" role="tablist" aria-label="Talep grubu">
          {(d?.requestTypes ?? []).map((g) => <button key={g.group} type="button" role="tab" aria-selected={reqGroup === g.group} className={reqGroup === g.group ? "on" : ""} onClick={() => { setReqGroup(g.group); setReq({ ...req, type: "" }); }}>{g.group}</button>)}
        </div>
        <fieldset className="wk-choice"><legend>Ne gerekiyor? <Req /></legend>
          {(d?.requestTypes.find((g) => g.group === reqGroup)?.types ?? []).map((t) => <label key={t.code}><input type="radio" name="req" checked={req.type === t.code} onChange={() => setReq({ ...req, type: t.code })} />
            <span><b>{t.label}</b><small className="wk-sub">{t.hint} · <em>{t.unit.name}</em></small></span></label>)}
        </fieldset>
        {(() => { const t = d?.requestTypes.flatMap((g) => g.types).find((x) => x.code === req.type); if (!t) return null; return <>
          <p className="wk-route" role="status">→ <b>{t.unit.name}</b> birimine gider. {t.dispatcher ? <>İşi birim sorumlusu <b>{t.dispatcher}</b> dağıtır.</> : <>Birim sorumlusu tanımlı değil; birim ekibi görür.</>}</p>
          {t.clinicalNote && <p className="wk-hint">{t.clinicalNote}</p>}
          {t.fields.includes("location") && <label className="wk-field"><span>{t.fields.includes("target") ? "Nereden" : "Oda / konum"} {t.fields.includes("target") ? <Req /> : <Opt />}</span><input maxLength={24} value={req.location} onChange={(e) => setReq({ ...req, location: e.target.value })} placeholder="ör. 312-B" /></label>}
          {t.fields.includes("target") && <label className="wk-field"><span>Nereye <Req /></span><input maxLength={24} value={req.targetLocation} onChange={(e) => setReq({ ...req, targetLocation: e.target.value })} placeholder="ör. Radyoloji BT" /></label>}
          {t.fields.includes("device") && <label className="wk-field"><span>Cihaz / demirbaş kodu <Opt /></span><input maxLength={24} value={req.deviceCode} onChange={(e) => setReq({ ...req, deviceCode: e.target.value })} placeholder="etiketin üstündeki kod" /></label>}
          <label className="wk-field"><span>Kısa not <Opt /></span><input maxLength={300} value={req.note} onChange={(e) => setReq({ ...req, note: e.target.value })} placeholder="ör. Alarm veriyor" /></label>
          <small className="wk-hint">Hasta adı, kimlik veya şifre yazmayın. Hasta güvenliği risk altındaysa önce birim prosedürünü uygulayın.</small>
        </>; })()}
      </FormDialog>

      <FormDialog open={dlg?.kind === "requestNo"} title="Sorun sürüyor" description="Talep aynı birime yeniden açılır ve öncekine bağlanır." submitLabel="Yeniden aç" onClose={close}
        onSubmit={async () => { const r = await api<{ result: { next: string } }>("/api/my-work", { action: "request.confirm", reference: dlg!.ref, ok: false, note: text }); close(); setReceipt(r.result.next); await live.reload(); }}>
        <label className="wk-field"><span>Ne sürüyor? <Opt /></span><input maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="ör. Yazıcı yine çalışmıyor" /></label>
      </FormDialog>
    </section>
  );
}

export function TaskCard({ task: t, busy, onPrimary, secondary, extra }: { task: WorkTask; busy: string; onPrimary: () => void; secondary?: React.ReactNode; extra?: React.ReactNode }) {
  const due = dueText(t.minutesLeft, t.overdue);
  const enabled = ["accept", "start", "complete", "approve", "inspect", "open"].includes(t.action);
  const working = busy.startsWith(`${t.reference}:`);
  return (
    <article className={`wk-card${t.overdue ? " wk-late" : ""}`} aria-label={t.title}>
      <header>
        <b>{t.title}</b>
        <span className={`wk-prio wk-prio-${t.priority === "Acil" ? "high" : t.priority === "Yüksek" ? "mid" : "low"}`}>{t.priority}</span>
      </header>
      <dl className="wk-facts">
        <div><dt>Kayıt</dt><dd><a href={t.link} onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent("klinorbis:go", {detail:t.link})); }}>{t.reference} · İşi aç</a></dd></div>
        <div><dt>Nerede</dt><dd>{t.location ?? t.unitName}</dd></div>
        <div><dt>Kimde</dt><dd>{t.owner ? t.owner.label : "Sahipsiz"}</dd></div>
        {due && <div><dt>Hedef</dt><dd className={t.overdue ? "wk-overdue" : ""}>{t.overdue ? "⚠ " : ""}{due}</dd></div>}
        {t.flow && <div><dt>Akış</dt><dd>{t.flow.title} · {t.flow.step}/{t.flow.steps}</dd></div>}
      </dl>
      {t.blockedReason && <p className="wk-flag">Engel: {t.blockedReason}</p>}
      {t.helpRequested && <p className="wk-flag wk-flag-info">Yardım istendi</p>}
      {t.nextStep && <p className="wk-next"><span>Sonraki adım:</span> {t.nextStep}</p>}
      {extra}
      <div className="wk-actions">
        {enabled ? <button type="button" className="wk-primary wk-big" disabled={!!busy} aria-busy={working} onClick={onPrimary}>{working ? "Kaydediliyor…" : t.actionLabel}</button>
          : t.why ? <p className="wk-why">{t.why}</p> : null}
        {secondary && <details className="wk-more"><summary>Diğer seçenekler</summary><div>{secondary}</div></details>}
      </div>
    </article>
  );
}
