'use client';
// KG1: varlık kaydı ekranı. Her cihaz/ekipmanın kodu, QR etiketi, yeri, durumu ve bakım/kalibrasyon vadesi.
// Tek ana düğme: "Arıza bildir" (seçili varlık için). Kayıt açma, durum değiştirme ve QR yazdırma "Diğer işlemler" altında.
// Yetki sunucuda denetlenir (lib/assets); bu ekran yalnız sunucunun izin verdiğini gösterir.
import Link from 'next/link';
import {useState} from 'react';
import {qrSvg} from '../yatak/qr/qr-labels';
import {api, ApiError, useLive, StaleBanner} from '../work-ui';

type Due={at:number|null;level:'kirmizi'|'sari'|'yesil'|'yok'};
type Asset={code:string;name:string;kind:'biyomedikal'|'teknik';category:string|null;brand:string|null;model:string|null;serial:string|null;owner_type:string;unit_code:string;unitName:string;location:string|null;status:string;version:number;maintenanceDue:Due;calibrationDue:Due};
type Data={assets:Asset[];canCreate:boolean;units:{code:string;name:string}[]};
const STATUS:Record<string,string>={aktif:'Kullanımda',arizali:'Arızalı',bakimda:'Bakımda',hurda:'Hurdaya ayrıldı'};
const LEVEL:Record<Due['level'],string>={kirmizi:'Gecikmiş',sari:'30 gün içinde',yesil:'Zamanında',yok:'Plan yok'};
const date=(t:number|null)=>t?new Date(t).toLocaleDateString('tr-TR'):'—';

function DueTag({label,due}:{label:string;due:Due}){return <span className={`due ${due.level}`}>{label}: {LEVEL[due.level]}{due.at?` (${date(due.at)})`:''}</span>;}

export default function Assets(){
 const [kod,setKod]=useState<string>(()=>{try{return new URLSearchParams(window.location.search).get('kod')?.toUpperCase()??'';}catch{return '';}});
 const [durum,setDurum]=useState('');
 const live=useLive<Data>(`/api/assets${durum?`?durum=${durum}`:''}`,30_000);
 const [msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState<Record<string,string>>({kind:'biyomedikal',ownerType:'hastane'});
 const data=live.data, sel=data?.assets.find(a=>a.code===kod)??null;
 const run=async(body:unknown,ok:string)=>{setBusy(true);setMsg('');try{await api('/api/assets',body);setMsg(ok);await live.reload();}catch(e){setMsg((e as ApiError).message);}finally{setBusy(false);}};
 const fault=async(a:Asset)=>{setBusy(true);setMsg('');try{const r=await api<{result:{reference:string;routedTo:string}}>('/api/my-work',{action:'fault.report',category:a.kind==='biyomedikal'?'cihaz':'diger',deviceCode:a.code,location:[a.unitName,a.location].filter(Boolean).join(' · '),note:`${a.code} ${a.name}`});setMsg(`Arıza kaydı açıldı: ${r.result.reference} → ${r.result.routedTo}`);}catch(e){setMsg((e as ApiError).message);}finally{setBusy(false);}};
 const origin=typeof window==='undefined'?'':window.location.origin;
 return <main className="vr"><style>{`.vr{padding:16px;max-width:1100px;margin:0 auto;font-family:system-ui;color:rgb(18 48 71)}.vr h1{font-size:1.4rem;margin:8px 0}.vr table{width:100%;border-collapse:collapse}.vr td,.vr th{padding:8px;border-bottom:1px solid rgb(220 228 235);text-align:left;vertical-align:top}.vr tr.on{background:rgb(236 245 252)}.vr .due{display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:999px;font-size:.85rem}.vr .kirmizi{background:rgb(253 228 228);color:rgb(150 20 20)}.vr .sari{background:rgb(255 243 205);color:rgb(120 80 0)}.vr .yesil{background:rgb(225 245 232);color:rgb(20 100 50)}.vr .yok{background:rgb(238 241 244);color:rgb(90 107 125)}.vr .main{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:rgb(17 99 160);color:rgb(255 255 255);font-weight:700}.vr .card{border:1px solid rgb(210 220 230);border-radius:12px;padding:12px;margin:12px 0;display:flex;gap:16px;flex-wrap:wrap}.vr .card svg{width:120px;height:120px}.vr details{margin:12px 0}.vr label{display:block;margin:6px 0}.vr input,.vr select{min-height:36px;margin-left:6px}.vr .qrs{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.vr .qrs div{border:1px dashed rgb(150 165 180);border-radius:8px;padding:8px;text-align:center}.vr .qrs svg{width:120px;height:120px}.vr .qrs{display:none}@media print{.vr .noprint{display:none}.vr .qrs{display:grid}}`}</style>
  <div className="noprint"><p><Link href="/">← Ana sayfa</Link></p><h1>Varlıklar</h1>
   <p>Hastanedeki cihaz ve ekipmanların kaydı. Etiketteki QR okutulunca bu ekran o varlıkla açılır; arıza tek dokunuşla doğru teknik birime gider. Örnek kayıtlar kurgusaldır.</p>
   {msg&&<p role="status">{msg}</p>}<StaleBanner live={live}/>
   {live.status==='loading'&&<p role="status">Yükleniyor…</p>}{(live.status==='error'||live.status==='denied')&&<p role="alert">{live.error}</p>}
   {sel&&<section className="card" aria-label="Seçili varlık"><span dangerouslySetInnerHTML={{__html:qrSvg(`${origin}/varliklar?kod=${encodeURIComponent(sel.code)}`)}}/>
    <div><h2>{sel.code} · {sel.name}</h2><p>{sel.unitName}{sel.location?` · ${sel.location}`:''} · {STATUS[sel.status]}</p>
     <p><DueTag label="Bakım" due={sel.maintenanceDue}/><DueTag label="Kalibrasyon" due={sel.calibrationDue}/></p>
     <button className="main" disabled={busy||sel.status==='hurda'} onClick={()=>void fault(sel)}>Arıza bildir</button>
     {data?.units.some(u=>u.code===sel.unit_code)&&sel.status!=='hurda'&&<details><summary>Diğer işlemler</summary>
      <p><button disabled={busy} onClick={()=>void run({action:'update',code:sel.code,version:sel.version,change:'maintained'},'Bakım kaydedildi.')}>Bakım yapıldı</button>{' '}
      <button disabled={busy} onClick={()=>void run({action:'update',code:sel.code,version:sel.version,change:'calibrated'},'Kalibrasyon kaydedildi.')}>Kalibrasyon yapıldı</button></p>
      <label>Durum<select value={sel.status} disabled={busy} onChange={e=>void run({action:'update',code:sel.code,version:sel.version,change:'status',status:e.target.value},'Durum güncellendi.')}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     </details>}
    </div></section>}
   {data&&<><label>Durum<select value={durum} onChange={e=>setDurum(e.target.value)}><option value="">Tümü</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    {data.assets.length===0?<p>Kayıtlı varlık yok.</p>:<table><thead><tr><th>Kod</th><th>Ad</th><th>Birim / yer</th><th>Durum</th><th>Vade</th></tr></thead><tbody>
     {data.assets.map(a=><tr key={a.code} className={a.code===kod?'on':''}><td><button type="button" onClick={()=>setKod(a.code)}>{a.code}</button></td><td>{a.name}{a.owner_type==='konsinye'?' (konsinye)':''}</td><td>{a.unitName}{a.location?` · ${a.location}`:''}</td><td>{STATUS[a.status]}</td><td><DueTag label="Bakım" due={a.maintenanceDue}/><DueTag label="Kalibrasyon" due={a.calibrationDue}/></td></tr>)}
    </tbody></table>}
    <details><summary>Diğer işlemler</summary>
     {data.canCreate&&<form onSubmit={e=>{e.preventDefault();void run({action:'create',...form},'Varlık kaydedildi.');}}>
      <h2>Yeni varlık</h2>
      <label>Tür<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="biyomedikal">Biyomedikal cihaz</option><option value="teknik">Teknik ekipman</option></select></label>
      <label>Ad<input required maxLength={80} value={form.name??''} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Sorumlu birim<select required value={form.unitCode??''} onChange={e=>setForm({...form,unitCode:e.target.value})}><option value="">Seçin</option>{data.units.map(u=><option key={u.code} value={u.code}>{u.name}</option>)}</select></label>
      <label>Yer<input maxLength={80} value={form.location??''} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label>Marka<input maxLength={60} value={form.brand??''} onChange={e=>setForm({...form,brand:e.target.value})}/></label>
      <label>Model<input maxLength={60} value={form.model??''} onChange={e=>setForm({...form,model:e.target.value})}/></label>
      <label>Seri no<input maxLength={60} value={form.serial??''} onChange={e=>setForm({...form,serial:e.target.value})}/></label>
      <label>Sahiplik<select value={form.ownerType} onChange={e=>setForm({...form,ownerType:e.target.value})}><option value="hastane">Hastane demirbaşı</option><option value="konsinye">Konsinye / kiralık</option></select></label>
      <label>Bakım aralığı (gün)<input type="number" min={1} max={3650} value={form.maintenanceIntervalDays??''} onChange={e=>setForm({...form,maintenanceIntervalDays:e.target.value})}/></label>
      <label>Kalibrasyon aralığı (gün)<input type="number" min={1} max={3650} value={form.calibrationIntervalDays??''} onChange={e=>setForm({...form,calibrationIntervalDays:e.target.value})}/></label>
      <button type="submit" disabled={busy}>Kaydet</button>
     </form>}
     <p><button type="button" onClick={()=>window.print()}>QR etiketlerini yazdır</button></p>
    </details></>}
  </div>
  {data&&<div className="qrs" aria-hidden="true">{data.assets.filter(a=>a.status!=='hurda').map(a=><div key={a.code}><span dangerouslySetInnerHTML={{__html:qrSvg(`${origin}/varliklar?kod=${encodeURIComponent(a.code)}`)}}/><b>{a.code}</b><br/><small>{a.name}</small></div>)}</div>}
 </main>;
}
