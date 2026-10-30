"use client";
// "Birimim": birim sorumlusunun ana ekranı. Önce kontrol bekleyen temizlikler (ayrı kuyruk), sonra sahipsiz,
// geciken, engelli/yardım isteyen, onay bekleyen ve devam eden işler; altta ekip iş yükü ve vardiya durumu.
// Görevlendirme sunucuda denetlenir: vardiya dışındaki kişiye veya başkasının üstündeki işe sessiz atama yapılmaz.
import { useEffect, useState } from "react";
import { TaskCard, type WorkTask } from "./my-work";
import { api, ApiError, FormDialog, Receipt, Req, StaleBanner, StateBox, useLive } from "./work-ui";

type Person = { email: string; label: string; open: number; shift: "vardiyada" | "vardiya_disi" | "bilinmiyor" };
type Data = {
  units: { code: string; name: string }[]; selected: { code: string; name: string } | null; people: Person[];
  groups: { inspection: WorkTask[]; unassigned: WorkTask[]; overdue: WorkTask[]; blocked: WorkTask[]; awaitingApproval: WorkTask[]; inProgress: WorkTask[] } | null;
};
const SHIFT: Record<Person["shift"], string> = { vardiyada: "Vardiyada", vardiya_disi: "Vardiya dışı", bilinmiyor: "Vardiya kaydı yok" };
const SECTIONS: [keyof NonNullable<Data["groups"]>, string, string][] = [
  ["inspection", "Kontrol bekleyen temizlikler", "Temizliği yapan kişi kendi işini kontrol edemez. Kontrolden geçmeyen oda yeniden temizliğe döner."],
  ["unassigned", "Sahipsiz işler", "Kimse üstlenmedi. Birine görevlendirin veya ekip kendisi kabul etsin."],
  ["overdue", "Geciken işler", "Hedef süresi geçti."],
  ["blocked", "Engel / yardım isteği", "Görevli bir engel bildirdi veya yardım istedi."],
  ["awaitingApproval", "Onay bekleyen adımlar", "Akışı başlatan kişi kendi onayını veremez."],
  ["inProgress", "Devam eden işler", "Bir görevlinin üstünde."],
];

export function MyUnit() {
  const [unit, setUnit] = useState<string>(() => { try { return new URLSearchParams(window.location.search).get("birim") ?? ""; } catch { return ""; } });
  const [unitSearch, setUnitSearch] = useState("");
  useEffect(() => {
    const sync = () => setUnit(new URLSearchParams(window.location.search).get("birim") ?? "");
    window.addEventListener("popstate", sync);
    window.addEventListener("klinorbis:location", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("klinorbis:location", sync); };
  }, []);
  const live = useLive<Data>(`/api/my-unit${unit ? `?birim=${encodeURIComponent(unit)}` : ""}`);
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [assign, setAssign] = useState<WorkTask | null>(null);
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState<{ offShift?: string; reassign?: string }>({});
  const [confirmed, setConfirmed] = useState(false);
  const [inspect, setInspect] = useState<WorkTask | null>(null);
  const [pass, setPass] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const d = live.data;
  const g = d?.groups;
  const total = g ? g.inspection.length + g.unassigned.length + g.inProgress.length + g.awaitingApproval.length : 0;

  async function act(t: WorkTask, action: string, message: string) {
    if (busy) return;
    setBusy(`${t.reference}:${action}`); setError("");
    try { await api("/api/my-work", { action: action === "approve" ? "complete" : action, reference: t.reference }); setReceipt(message); await live.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "İşlem yapılmadı."); await live.reload(); }
    finally { setBusy(""); }
  }
  function primary(t: WorkTask) {
    if (t.action === "inspect") { setPass(null); setReason(""); setInspect(t); return; }
    if (t.action === "open") return window.dispatchEvent(new CustomEvent("klinorbis:go", { detail: t.link }));
    if (t.action === "accept") return void act(t, "accept", "İşi kendiniz üstlendiniz. Sonraki adım: Başla.");
    if (t.action === "start") return void act(t, "start", "İşe başladınız.");
    if (t.action === "complete" || t.action === "approve") return void act(t, t.action, "Adım tamamlandı; akış sonraki birime geçti.");
  }
  const openAssign = (t: WorkTask) => { setAssign(t); setTarget(""); setConfirm({}); setConfirmed(false); };

  return (
    <section className="wk" aria-labelledby="mu-title">
      <div className="wk-head">
        <div>
          <h2 id="mu-title">Birimim{d?.selected ? ` · ${d.selected.name}` : ""}</h2>
          <p>Birimin açık işleri: kim, nerede, ne kadar süredir. Görevlendirme açık sahiplikle yapılır; devir kabul edilene kadar eski sahip sorumludur.</p>
        </div>
        {d && d.units.length > 1 && <label className="wk-field wk-inline"><span>Birim</span>
          <input aria-label="Birim ara" value={unitSearch} onChange={e => setUnitSearch(e.target.value)} placeholder="Birim adıyla ara" />
          <select value={d.selected?.code ?? ""} onChange={(e) => { setUnit(e.target.value); window.history.replaceState(window.history.state, "", `/birimim?birim=${encodeURIComponent(e.target.value)}`); }}>
            {d.units.filter(u => u.code === d.selected?.code || u.name.toLocaleLowerCase("tr").includes(unitSearch.toLocaleLowerCase("tr"))).map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
          </select></label>}
      </div>
      <StaleBanner live={live} />
      <Receipt text={receipt} onClose={() => setReceipt("")} />
      {error && <div className="wk-alert" role="alert"><b>İşlem yapılmadı.</b> {error}</div>}
      <StateBox live={live} empty={!!d && !d.selected} emptyText="Sorumlu olduğunuz bir birim tanımlı değil. Operasyon yöneticisi Personel ve Yetki ekranından ekleyebilir.">
        {g && <>
          <nav className="wk-summary" aria-label="Özet">
            {SECTIONS.map(([k, label]) => <a key={k} href={`#mu-${k}`} className={g[k].length ? "" : "wk-zero"}><b>{g[k].length}</b><span>{label}</span></a>)}
          </nav>
          {total === 0 && g.overdue.length === 0 && g.blocked.length === 0 && <div className="wk-state wk-empty"><span>Birimde açık iş yok.</span></div>}
          {SECTIONS.map(([k, label, hint]) => g[k].length > 0 && <div key={k} className="wk-group" id={`mu-${k}`}>
            <h3>{label} <span className="wk-count">{g[k].length}</span></h3>
            <p className="wk-note">{hint}</p>
            {g[k].map((t) => <TaskCard key={`${k}-${t.reference}`} task={t} busy={busy} onPrimary={() => primary(t)}
              secondary={t.inspection ? null : <>
                {t.owner && <button type="button" onClick={() => openAssign(t)}>Yeniden görevlendir</button>}
                {t.blockedReason && <button type="button" onClick={() => void api("/api/my-work", { action: "unblock", reference: t.reference }).then(async () => { setReceipt("Engel kaldırıldı."); await live.reload(); }, (e) => setError(e.message))}>Engeli kaldır</button>}
                {t.link && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("klinorbis:go", { detail: t.link }))}>Kaydı aç</button>}
              </>}
              extra={!t.owner && !t.inspection ? <button type="button" className="wk-secondary wk-assign" onClick={() => openAssign(t)}>Görevlendir</button> : null} />)}
          </div>)}
          <div className="wk-group" id="mu-people">
            <h3>Ekip iş yükü</h3>
            {d!.people.length === 0 ? <p className="wk-empty-line">Birimde etkin personel yok.</p> :
              <ul className="wk-people">{d!.people.map((p) => <li key={p.email} className={p.shift === "vardiya_disi" ? "wk-off" : ""}>
                <b>{p.label}</b><span>{p.open} açık iş</span><span className="wk-shift">{p.shift === "vardiyada" ? "● " : p.shift === "vardiya_disi" ? "○ " : "– "}{SHIFT[p.shift]}</span>
              </li>)}</ul>}
          </div>
        </>}
      </StateBox>

      <FormDialog open={!!assign} title={assign?.owner ? "Yeniden görevlendir" : "Görevlendir"}
        description={<><b>{assign?.title}</b>{assign?.location ? ` · ${assign.location}` : ""}{assign?.owner ? <> · şu an <b>{assign.owner.label}</b> üzerinde</> : null}</>}
        submitLabel={confirm.offShift || confirm.reassign ? "Onaylıyorum, görevlendir" : "Görevlendir"} submitDisabled={!target || ((!!confirm.offShift || !!confirm.reassign) && !confirmed)}
        onClose={() => setAssign(null)}
        onSubmit={async () => {
          try {
            await api("/api/workload", { action: "assign", reference: assign!.reference, email: target, confirmOffShift: !!confirm.offShift && confirmed, confirmReassign: !!confirm.reassign && confirmed });
            const who = d?.people.find((p) => p.email === target)?.label ?? "Görevli";
            setAssign(null); setReceipt(`${who} görevlendirildi ve bildirim aldı. Sonraki adım: görevlinin “Kabul et” demesi.`); await live.reload();
          } catch (e) {
            if (e instanceof ApiError && (e.code === "OFF_SHIFT" || e.code === "REASSIGN_CONFIRM")) { setConfirm((c) => ({ ...c, [e.code === "OFF_SHIFT" ? "offShift" : "reassign"]: e.message })); setConfirmed(false); throw new Error("Devam etmek için aşağıdaki onayı işaretleyin."); }
            throw e;
          }
        }}>
        <fieldset className="wk-choice"><legend>Kime <Req /></legend>
          {!d?.people.length && <p role="status">Bu birimde etkin personel yok. Personel ve Yetki ekranından birime personel ekleyin; ardından bu listeyi yenileyin.</p>}
          {(d?.people ?? []).map((p) => <label key={p.email}><input type="radio" name="who" checked={target === p.email} onChange={() => { setTarget(p.email); setConfirm({}); setConfirmed(false); }} />
            <span>{p.label} <small>· {p.open} açık iş · {SHIFT[p.shift]}</small></span></label>)}
        </fieldset>
        {(confirm.offShift || confirm.reassign) && <label className="wk-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>{[confirm.offShift, confirm.reassign].filter(Boolean).join(" ")}</span></label>}
      </FormDialog>

      <FormDialog open={!!inspect} title="Temizlik kontrolü" danger={pass === false}
        description={<>{inspect?.location ? <b>{inspect.location} · </b> : null}Temizleyen: {inspect?.inspection?.cleanedBy ?? "—"}</>}
        submitLabel={pass === false ? "Geçmedi — yeniden temizlik aç" : "Kontrolden geçti"} submitDisabled={pass === null || (pass === false && reason.trim().length < 5)}
        onClose={() => setInspect(null)}
        onSubmit={async () => { const r = await api<{ result?: { next?: string } }>("/api/my-work", { action: "inspect", reference: inspect!.reference, pass, reason }); setInspect(null); setReceipt(r.result?.next ?? "Kontrol kaydedildi."); await live.reload(); }}>
        <fieldset className="wk-choice"><legend>Sonuç <Req /></legend>
          <label><input type="radio" name="mu-ins" checked={pass === true} onChange={() => setPass(true)} /> Geçti</label>
          <label><input type="radio" name="mu-ins" checked={pass === false} onChange={() => setPass(false)} /> Geçmedi</label>
        </fieldset>
        {pass === false && <label className="wk-field"><span>Geçmeme nedeni <Req /></span><textarea rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Banyo dezenfekte edilmemiş" /></label>}
      </FormDialog>
    </section>
  );
}
