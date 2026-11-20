'use client';
// K4: telefonda tek düğmeli iş ekranı (temizlik ve taşıma). Büyük kart, tek ana düğme, QR ile yatak seçimi.
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {phoneJobs,phoneStep,PHONE_STATUS,type PhoneJob} from '../../lib/phone-jobs';

type Snap={initialized:boolean;me?:string;canInspect?:boolean;jobs:PhoneJob[]};
async function api(body?:unknown){const r=await fetch('/api/hospital-coordination',body?{method:'POST',headers:{'content-type':'application/json','x-klinorbis-request':'browser'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json() as Snap&{error?:string};if(!r.ok)throw Error(d.error??'İşlem tamamlanamadı.');return d;}

export default function PhoneWork({kind,title}:{kind:'cleaning'|'transport';title:string}){
 const [data,setData]=useState<Snap|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[bed,setBed]=useState<string|null>(null),[deliver,setDeliver]=useState<{ids:boolean;receiver:string}>({ids:false,receiver:''});
 const load=useCallback(()=>api().then(d=>{setBed(new URLSearchParams(window.location.search).get('yatak'));setData(d);setErr('');}).catch(e=>setErr(String(e.message))),[]);
 useEffect(()=>{void load();const t=setInterval(()=>void load(),20000);return()=>clearInterval(t);},[load]);
 async function act(job:PhoneJob,action:string){setBusy(true);setErr('');try{await api({action:'transition',id:job.id,version:job.version,transition:action,...(action==='deliver'?{confirmation:{target:job.target,twoIdentifiersVerified:deliver.ids,receiverConfirmed:true,receiver:deliver.receiver.trim().toUpperCase()}}:{})});await load();setDeliver({ids:false,receiver:''});}catch(e){setErr(e instanceof Error?e.message:'İşlem hatası');}finally{setBusy(false);}}
 const me=data?.me??'',list=data?phoneJobs(data.jobs,me,kind,bed,!!data.canInspect):[];
 return <main className="pw"><style>{`.pw{max-width:560px;margin:auto;padding:16px;font-family:system-ui;color:rgb(18 48 71)}.pw h1{font-size:1.4rem;margin:8px 0}.pw .note{font-size:.85rem;color:rgb(90 107 125)}.pw ul{list-style:none;padding:0;margin:12px 0;display:grid;gap:12px}.pwc{border:1px solid rgb(213 225 233);border-radius:16px;padding:16px;background:rgb(255 255 255);display:grid;gap:8px}.pwc.qr{border:2px solid rgb(17 132 91)}.pwc b{font-size:1.3rem}.pwc small{color:rgb(90 107 125)}.pwc .go{min-height:56px;font-size:1.15rem;font-weight:700;border:0;border-radius:12px;background:rgb(17 99 160);color:rgb(255 255 255)}.pwc .go:disabled{opacity:.5}.pwc label{display:flex;gap:8px;align-items:center;font-size:.95rem}.pwc input[type=text]{min-height:44px;padding:0 10px;border:1px solid rgb(190 205 216);border-radius:10px}.pw .bad{color:rgb(176 32 32)}`}</style>
  <p className="note">SİMÜLASYON · Kurgusal hastane. Hasta adı gösterilmez.</p>
  <h1>{title}</h1>
  {bed&&<p className="note">QR ile okutulan yatak: <b>{bed}</b> · <button type="button" onClick={()=>{setBed(null);history.replaceState(null,'',location.pathname);}}>Tümünü göster</button></p>}
  {err&&<p role="alert" className="bad">{err}</p>}
  {!data&&!err&&<p role="status">Yükleniyor…</p>}
  {data&&!data.initialized&&<p>Kurgusal hastane henüz kurulmadı. <Link href="/yatak">Yatak panosu</Link></p>}
  {data?.initialized&&(list.length?<ul>{list.map(j=>{const step=phoneStep(j,me,!!data.canInspect);return <li key={j.id} className={'pwc'+(bed&&j.bed===bed?' qr':'')}>
   <small>{PHONE_STATUS[j.status]??j.status}{j.owner===me?' · senin işin':''}</small>
   <b>{kind==='transport'?`${j.bed} → ${j.target??'—'}`:j.bed}</b>
   {step?.needsDelivery&&<><label><input type="checkbox" checked={deliver.ids} onChange={e=>setDeliver({...deliver,ids:e.target.checked})}/> Hastayı iki kimlik bilgisiyle doğruladım</label><label>Teslim alan kodu<input type="text" value={deliver.receiver} onChange={e=>setDeliver({...deliver,receiver:e.target.value})} placeholder="PRS-SIM-004"/></label></>}
   {step?<button type="button" className="go" disabled={busy||(!!step.needsDelivery&&(!deliver.ids||!deliver.receiver.trim()))} onClick={()=>void act(j,step.action)}>{step.label}</button>:<small>Bu iş başka personelde.</small>}
  </li>;})}</ul>:<p>{kind==='transport'?'Bekleyen taşıma yok.':'Bekleyen temizlik işi yok.'}</p>)}
 </main>;
}
