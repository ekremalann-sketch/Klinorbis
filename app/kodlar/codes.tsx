'use client';
// KG2: renkli kodlar ekranı. Renk seç → yeri yaz → tek ana düğme "Kodu çağır".
// Açık kodlarda ekip üyesi yalnız sıradaki adımı görür: Gördüm → Vardım → Kapat. Süreler kayda geçer.
// Mavi kod yalnız ekip çağırma ve süre kaydıdır; ekran tıbbi yönlendirme yapmaz.
import Link from 'next/link';
import {useState} from 'react';
import {api, ApiError, useLive, StaleBanner} from '../work-ui';

type Code={reference:string;color:string;label:string;location:string;drill:boolean;calledAt:number;ackSeconds:number|null;arriveSeconds:number|null;closedAt:number|null;closeNote:string|null;next:'ack'|'arrive'|'close'|null};
type Data={open:Code[];history:Code[];colors:{code:string;label:string;meaning:string;teams:string[]}[];canDrill:boolean};
const RGB:Record<string,string>={mavi:'rgb(29 78 216)',beyaz:'rgb(120 130 140)',pembe:'rgb(219 39 119)',kirmizi:'rgb(200 30 30)',turuncu:'rgb(234 88 12)'};
const NEXT={ack:'Gördüm, geliyorum',arrive:'Vardım',close:'Kapat'} as const;
const sn=(s:number|null)=>s===null?'—':s<120?`${s} sn`:`${Math.round(s/60)} dk`;
const time=(t:number)=>new Date(t).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});

export default function Codes(){
 const live=useLive<Data>('/api/codes',10_000);
 const [color,setColor]=useState(''),[loc,setLoc]=useState(''),[drill,setDrill]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const data=live.data;
 const send=async(body:unknown,ok:(r:{result:{duplicate?:boolean;notified?:number}})=>string)=>{setBusy(true);setMsg('');try{const r=await api<{result:{duplicate?:boolean;notified?:number}}>('/api/codes',body);setMsg(ok(r));await live.reload();}catch(e){setMsg((e as ApiError).message);}finally{setBusy(false);}};
 return <main className="kd"><style>{`.kd{padding:16px;max-width:900px;margin:0 auto;font-family:system-ui;color:rgb(18 48 71)}.kd h1{font-size:1.4rem;margin:8px 0}.kd .colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}.kd .colors button{min-height:64px;border-radius:12px;border:3px solid transparent;color:rgb(255 255 255);font-weight:700;text-align:left;padding:8px}.kd .colors button[aria-pressed=true]{border-color:rgb(18 48 71);outline:3px solid rgb(255 255 255);outline-offset:-6px}.kd .colors small{display:block;font-weight:400}.kd .main{min-height:52px;padding:0 24px;border:0;border-radius:12px;background:rgb(18 48 71);color:rgb(255 255 255);font-weight:700;font-size:1.05rem}.kd input{min-height:40px;width:100%;max-width:420px}.kd .open{border-left:8px solid;padding:8px 12px;margin:8px 0;background:rgb(247 249 251);border-radius:8px}.kd table{width:100%;border-collapse:collapse}.kd td,.kd th{padding:6px;border-bottom:1px solid rgb(220 228 235);text-align:left}`}</style>
  <p><Link href="/">← Ana sayfa</Link></p><h1>Renkli kodlar</h1>
  <p>Kodu çağırın; ilgili ekip ve operasyon yöneticisi anında bildirim alır. Çağrı, onay, varış ve kapanış saatleri kayda geçer. Mavi kod yalnız ekibi çağırır; tıbbi müdahaleye yön vermez.</p>
  {msg&&<p role="status">{msg}</p>}<StaleBanner live={live}/>
  {live.status==='loading'&&<p role="status">Yükleniyor…</p>}{(live.status==='error'||live.status==='denied')&&<p role="alert">{live.error}</p>}
  {data&&<>
   {data.open.length>0&&<section aria-label="Açık kodlar"><h2>Açık kodlar</h2>{data.open.map(c=><div key={c.reference} className="open" style={{borderColor:RGB[c.color]}}>
    <b>{c.drill?'TATBİKAT · ':''}{c.label}</b> · {c.location} · {time(c.calledAt)} · onay {sn(c.ackSeconds)} · varış {sn(c.arriveSeconds)}
    {c.next&&<p><button disabled={busy} onClick={()=>void send({action:'advance',reference:c.reference,step:c.next},()=>'Kaydedildi.')}>{NEXT[c.next]}</button></p>}
   </div>)}</section>}
   <form onSubmit={e=>{e.preventDefault();void send({action:'call',color,location:loc,drill},r=>r.result.duplicate?'Bu kod az önce aynı yerden çağrıldı; ekip yolda.':`Kod çağrıldı; ${r.result.notified??0} kişiye bildirim gitti.`).then(()=>{setColor('');});}}>
    <h2>Kod çağır</h2>
    <div className="colors" role="group" aria-label="Kod rengi">{data.colors.map(c=><button type="button" key={c.code} aria-pressed={color===c.code} style={{background:RGB[c.code]}} onClick={()=>setColor(c.code)}>{c.label}<small>{c.meaning}</small></button>)}</div>
    <label>Yer<br/><input required minLength={2} maxLength={80} placeholder="ör. 3. kat B blok koridor" value={loc} onChange={e=>setLoc(e.target.value)}/></label>
    <p><button className="main" type="submit" disabled={busy||!color}>Kodu çağır</button></p>
    {data.canDrill&&<details><summary>Diğer işlemler</summary><label><input type="checkbox" style={{width:'auto',minHeight:0}} checked={drill} onChange={e=>setDrill(e.target.checked)}/> Bu bir tatbikat</label></details>}
   </form>
   {data.history.length>0&&<details><summary>Geçmiş ve süreler</summary><table><thead><tr><th>Kod</th><th>Yer</th><th>Saat</th><th>Onay</th><th>Varış</th></tr></thead><tbody>
    {data.history.map(c=><tr key={c.reference}><td>{c.drill?'Tatbikat · ':''}{c.label}</td><td>{c.location}</td><td>{time(c.calledAt)}</td><td>{sn(c.ackSeconds)}</td><td>{sn(c.arriveSeconds)}</td></tr>)}
   </tbody></table></details>}
  </>}
 </main>;
}
