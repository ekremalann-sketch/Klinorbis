"use client";
import {useEffect,useState,type FormEvent} from "react";
import {COORDINATION_STATES,type Plan} from "../lib/patient-coordination";
function Star(){return <b className="field-star" aria-hidden="true"> *</b>;}

type RecordPlan=Plan&{version:number};
export function PatientCoordination({reference,role,closed}:{reference:string;role:string;closed:boolean}){
 const [plan,setPlan]=useState<RecordPlan|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const canEdit=!closed&&["operations_manager","unit_manager","clinician","call_agent"].includes(role);
 async function load(signal?:AbortSignal){try{const r=await fetch(`/api/coordination?reference=${encodeURIComponent(reference)}`,{cache:"no-store",signal});const d=await r.json() as {plan:RecordPlan|null;error?:string};if(!r.ok)throw Error(d.error);setPlan(d.plan);}catch(e){if(!signal?.aborted)setMessage(e instanceof Error?e.message:"Plan alınamadı.");}finally{if(!signal?.aborted)setLoading(false);}}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{const c=new AbortController();const t=window.setTimeout(()=>{setLoading(true);setPlan(null);setMessage("");void load(c.signal);},0);return()=>{window.clearTimeout(t);c.abort();};},[reference]);
 async function save(action:string,fields:Record<string,unknown>={}){setBusy(true);setMessage("");try{const r=await fetch("/api/coordination",{method:"POST",headers:{"content-type":"application/json","x-klinorbis-request":"browser"},body:JSON.stringify({reference,version:plan?.version,action,...fields})});const d=await r.json() as {plan:RecordPlan|null;error?:string};if(!r.ok)throw Error(d.error);setPlan(d.plan);setMessage("İşlem kaydedildi.");}catch(e){setMessage(e instanceof Error?e.message:"İşlem yapılamadı.");}finally{setBusy(false);}}
 function submit(e:FormEvent<HTMLFormElement>,action:string){e.preventDefault();void save(action,Object.fromEntries(new FormData(e.currentTarget)));}
 const STEPS=[["assessment","Uygunluk"],["approval_pending","Plan onayı"],["approved","Bilgilendirme"],["notified","Sonuç"],["completed","Tamamlandı"]] as const;
 const stepIndex=plan?STEPS.findIndex(([key])=>key===plan.state):-1;
 const notice=plan?(plan.notificationStatus==="recorded"?"İletişim kaydedildi":plan.notificationStatus==="failed"?"Ulaşılamadı · tekrar takip":"Bilgilendirme bekliyor"):"";
 let history:{at:string;action:string;note:string}[]=[];
 try{history=plan?JSON.parse(plan.history) as typeof history:[];}catch{history=[];}
 return <section className="coordination-panel compact" aria-label="Hasta koordinasyonu">
  <header className="coord-head">
   <h3>Hasta koordinasyonu</h3>
   {plan&&<span className={`coord-pill s-${plan.state}`}>{COORDINATION_STATES[plan.state]}</span>}
   <details className="coord-info"><summary aria-label="Bağlantı bilgisi">i</summary><p>Doktor takvimi ve telefon/SMS/WhatsApp gönderimi bağlı değil. Uygunluğu ve yapılan iletişimin sonucunu personel kaydeder.</p></details>
  </header>
  {loading?<p className="coord-muted" role="status">Yükleniyor…</p>:!plan?<div className="coord-empty"><span>Bu talep için koordinasyon takibi yok.</span>{canEdit&&<button className="primary" disabled={busy} onClick={()=>void save("open")}>Takibi aç</button>}</div>:<>
   <ol className="coord-steps" aria-label="Koordinasyon adımları">{STEPS.map(([key,label],i)=><li key={key} className={i<stepIndex?"done":i===stepIndex?"current":""} aria-current={i===stepIndex?"step":undefined}><i aria-hidden="true"/>{label}</li>)}</ol>
   <dl className="coord-facts">
    <div><dt>Kanal</dt><dd>{plan.contactChannel}</dd></div>
    <div><dt>İletişim</dt><dd>{notice}</dd></div>
    {plan.plannedAt&&<div><dt>Plan</dt><dd>{new Date(plan.plannedAt).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"})} · {plan.providerAlias}</dd></div>}
    {plan.availability==="unavailable"&&plan.alternative&&<div className="wide"><dt>Alternatif</dt><dd>{plan.alternative}</dd></div>}
   </dl>
   {canEdit&&["assessment","approval_pending"].includes(plan.state)&&<form className="coord-form" key={`${reference}:${plan.version}`} onSubmit={e=>submit(e,"plan")}>
    <label><span>Sorumlu (takma ad)<Star/></span><input name="providerAlias" defaultValue={plan.providerAlias} required maxLength={80} placeholder="DR-01"/></label>
    <label><span>Uygunluk<Star/></span><select name="availability" defaultValue={plan.availability} required><option value="unconfirmed">Teyit edilmedi</option><option value="available">Uygun</option><option value="unavailable">Uygun değil</option></select></label>
    <label><span>Planlanan zaman<Star/></span><input name="plannedAt" type="datetime-local" required defaultValue={plan.plannedAt?new Date(Date.parse(plan.plannedAt)+3*3600000).toISOString().slice(0,16):""}/></label>
    <label><span>İletişim kanalı</span><select name="contactChannel" defaultValue={plan.contactChannel}>{["Telefon","SMS","WhatsApp","Portal","E-posta"].map(c=><option key={c}>{c}</option>)}</select></label>
    <label className="wide"><span>Uygun değilse alternatif plan</span><textarea name="alternative" rows={2} maxLength={600} defaultValue={plan.alternative}/></label>
    <label className="wide"><span>Teyit ve gerekçe<Star/></span><textarea name="note" rows={2} required maxLength={1500}/></label>
    <div className="coord-actions wide"><button className="primary" disabled={busy}>Planı onaya gönder</button></div>
   </form>}
   {canEdit&&plan.state==="approval_pending"&&["operations_manager","unit_manager","clinician"].includes(role)&&<form className="coord-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save(String(f.get("decision")),{note:f.get("note")});}}>
    <label><span>Karar<Star/></span><select name="decision" required><option value="approve">Onayla</option><option value="reject">Gerekçeyle iade et</option></select></label>
    <label className="wide"><span>Gerekçe<Star/></span><textarea name="note" rows={2} required maxLength={1500}/></label>
    <p className="coord-muted wide">Planı hazırlayan kişi kendi planını onaylayamaz.</p>
    <div className="coord-actions wide"><button className="primary" disabled={busy}>Kararı kaydet</button></div>
   </form>}
   {canEdit&&["approved","notified"].includes(plan.state)&&<form className="coord-form" onSubmit={e=>submit(e,"notify")}>
    <label><span>İletişim sonucu<Star/></span><select name="outcome" required><option value="recorded">Bilgilendirildi</option><option value="failed">Ulaşılamadı</option></select></label>
    <label className="wide"><span>Zaman, görevli ve iletilen bilgi<Star/></span><textarea name="note" rows={2} required maxLength={1500} placeholder="Kimlik veya telefon yazmayın"/></label>
    <div className="coord-actions wide"><button className="primary" disabled={busy}>Sonucu kaydet</button></div>
   </form>}
   {canEdit&&plan.state!=="completed"&&<details className="coord-more"><summary>{plan.state==="notified"?"Tamamla veya yeniden planla":"Yeniden planla"}</summary><form className="coord-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save(String(f.get("action")),{note:f.get("note")});}}>
    <label><span>İşlem<Star/></span><select name="action" required><option value="replan">Yeniden planla</option>{plan.state==="notified"&&<option value="complete">Süreci tamamla</option>}</select></label>
    <label className="wide"><span>Gerekçe<Star/></span><textarea name="note" rows={2} required maxLength={1500}/></label>
    <div className="coord-actions wide"><button disabled={busy}>Kaydet</button></div>
   </form></details>}
   {history.length>0&&<details className="coord-more"><summary>Geçmiş ({history.length})</summary><ul className="coord-history">{history.map((h,i)=><li key={i}><time>{new Date(h.at).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"})}</time><span>{h.note}</span></li>)}</ul></details>}
  </>}
  {message&&<p className="coord-muted" role="status">{message}</p>}
 </section>;
}
