'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SIM_SETTINGS, SIM_LABEL, SIM_STAFF, SIM_UNITS, simTime, type SimSettings, type SimState, type simulationMetrics } from '../../lib/virtual-hospital';
import './virtual-hospital.css';
type Snapshot={label:string;state:SimState|null;metrics:ReturnType<typeof simulationMetrics>|null;emergencyStopped:boolean;audit:{action:string;actor:string;recorded_at:string}[]};
const format=(n:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);
const clock=(n:number)=>new Date(simTime(n)).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export default function VirtualHospital(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[settings,setSettings]=useState<SimSettings>({...DEFAULT_SIM_SETTINGS});
 const [tab,setTab]=useState('Akış'),[selected,setSelected]=useState(''),[unit,setUnit]=useState('all');const pending=useRef(false),acting=useRef(false),revision=useRef(0);
 const request=useCallback(async(action?:string)=>{
  const foreground=!!action&&action!=='tick';
  if(foreground){if(acting.current)return;acting.current=true;revision.current++;setBusy(true);}
  else{if(pending.current||acting.current)return;pending.current=true;}
  const generation=revision.current;
  try{
   const response=await fetch('/api/virtual-hospital',{method:action?'POST':'GET',cache:'no-store',headers:action?{'content-type':'application/json','x-klinorbis-request':'browser'}:undefined,body:action?JSON.stringify({action,settings}):undefined,signal:AbortSignal.timeout(20000)});
   const data=await response.json() as Snapshot & {error?:string;message?:string};if(!response.ok)throw new Error(data.error||data.message||'Simülasyon isteği tamamlanamadı.');
   if(generation===revision.current){setSnapshot(data);setError('');}
  }catch(e){if(generation===revision.current)setError(e instanceof Error?e.message:'Bağlantı kurulamadı.');}finally{if(foreground){acting.current=false;setBusy(false);}else pending.current=false;}
 },[settings]);
 useEffect(()=>{void request();},[request]);
 const running=snapshot?.state?.status==='running';
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>{void request('tick');},4000);return()=>clearInterval(timer);},[running,request]);
 const state=snapshot?.state,displaySettings=state?.settings??settings,m=snapshot?.metrics,events=state?.events.filter(e=>unit==='all'||e.unit===unit)??[],event=state?.events.find(e=>e.id===selected);
 function number(key:keyof SimSettings,value:string){setSettings(s=>({...s,[key]:Number(value)}));}
 function report(){if(!snapshot?.state)return;
  const report={label:SIM_LABEL,generatedAt:new Date().toISOString(),settings:snapshot.state.settings,metrics:snapshot.metrics,events:snapshot.state.events,simulationAudit:snapshot.audit,method:'Yalnız tamamlanan kurgusal olaylar karşılaştırılır. Telefon ve işlem süreleri varsayımdır. Klinik kararlar kurgusal rollerce canlandırılır. Gerçek SMS/HBYS bağlantısı yoktur.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Klinorbis-SIMULASYON-raporu.json';a.click();URL.revokeObjectURL(url);
 }
 return <main className="sim-shell">
  <div className="sim-banner" role="note">{SIM_LABEL}</div>
  <header className="sim-header"><div><a href="/merkez">← Operasyon Merkezi</a> · <a href="/simulation">Maliyet ve zaman karşılaştırması</a><p className="sim-eyebrow">KLINORBIS / SANAL PİLOT</p><h1>Sanal Hastane Simülasyonu</h1><p>İki kampüs, kurgusal ekipler, gerçek kurallar. Telefon ve tıklama yükünü aynı olaylar üzerinden karşılaştırın.</p></div><span className={'sim-status '+(running?'sim-live':'')}>{snapshot?.emergencyStopped?'Acil durdurma etkin':running?'Kurgusal gün çalışıyor':state?.status==='completed'?'Senaryo tamamlandı':state?'Durduruldu':snapshot?'Başlamadı':'Yükleniyor…'}</span></header>
  {error&&<div className="sim-error" role="alert">{error} <button onClick={()=>void request()}>Yeniden dene</button></div>}
  <section className="sim-card"><div className="sim-section-head"><h2>Pilot kontrolü</h2><span>Yalnız operasyon yöneticisi · Canlı kayıtlardan ayrı</span></div>
   <div className="sim-settings">
    <label>Senaryo tohumu<input type="number" min="1" max="1000000" value={displaySettings.seed} disabled={!!state} onChange={e=>number('seed',e.target.value)}/></label>
    <label>Hız<select value={displaySettings.speed} disabled={!!state} onChange={e=>number('speed',e.target.value)}><option value="1">Gerçek zaman</option><option value="60">1 dakika = 1 saat</option><option value="360">1 dakika = 6 saat</option></select></label>
    <label>Senaryo süresi<select value={displaySettings.durationHours} disabled={!!state} onChange={e=>number('durationHours',e.target.value)}><option value="24">24 saat</option><option value="72">72 saat · 48 saat araması dahil</option></select></label>
    <label>Karşılaştırma<select value={String(displaySettings.integrated)} disabled={!!state} onChange={e=>setSettings(s=>({...s,integrated:e.target.value==='true'}))}><option value="false">Bugünkü bağlantısız işleyiş</option><option value="true">SMS + HBYS bağlı varsayımsal senaryo</option></select></label>
    <label>Bir telefon / dakika<input type="number" min="0.5" max="15" step="0.5" value={displaySettings.callMinutes} disabled={!!state} onChange={e=>number('callMinutes',e.target.value)}/></label>
    <label>Bir işlem / saniye<input type="number" min="1" max="120" value={displaySettings.actionSeconds} disabled={!!state} onChange={e=>number('actionSeconds',e.target.value)}/></label>
    <label>Süre hedefi çarpanı<input type="number" min="0.25" max="4" step="0.25" value={displaySettings.slaScale} disabled={!!state} onChange={e=>number('slaScale',e.target.value)}/></label>
   </div><div className="sim-actions"><button disabled={busy||!snapshot||!!state||snapshot?.emergencyStopped} onClick={()=>void request('start')}>Sanal pilotu başlat</button><button className="sim-secondary" disabled={busy||!running} onClick={()=>void request('advance')}>2 sanal saat ilerlet</button><button className="sim-danger" disabled={busy||!running} onClick={()=>void request('stop')}>Durdur</button><button className="sim-secondary" disabled={busy||!state} onClick={()=>void request('clear')}>Simülasyonu temizle</button><button className="sim-secondary" disabled={!state} onClick={report}>Etiketli raporu indir</button></div>
   <p className="sim-muted">Başlatınca 30 randevuyu etkileyen hekim yokluğu canlandırılır. Otomatik ilerleme sunucu zamanlayıcısına ve bu ekran açıkken yapılan turlara bağlıdır. Temizleme kurgusal kayıtları siler; başlatma/durdurma denetim izi korunur.</p>
  </section>
  {state&&m&&<>
   <div className="sim-clock"><b>Sanal saat: {clock(state.cursor)}</b><span>{format(state.cursor/60)} / {state.settings.durationHours} saat · {state.settings.integrated?'Entegrasyon VARSAYIMI':'Mevcut bağlantısız senaryo'} · Son sunucu ilerlemesi: {new Date(state.lastWall).toLocaleTimeString('tr-TR')}</span></div>
   <section className="sim-metrics" aria-label="Kurgusal kazanım karşılaştırması">
    <article><span>Tamamlanan / açık olay</span><strong>{m.completed} / {m.open}</strong><small>Açık işler kazanıma dahil edilmez</small></article>
    <article><span>Telefon: eski yöntem → simülasyon</span><strong>{m.baselineCalls} → {m.calls}</strong><small>Olay bazlı varsayımsal karşılaştırma</small></article>
    <article><span>İnsan işlemi: eski → simülasyon</span><strong>{m.baselineActions} → {m.actions}</strong><small>Onaylar ve geri aramalar dahil</small></article>
    <article><span>Varsayımsal süre farkı</span><strong>{format(m.savedMinutes)} dk</strong><small>{format(m.reduction)}% · Olumsuz sonuçlar da gösterilir</small></article>
   </section>
   <section className="sim-card"><h2>Aynı olaylar, iki işleyiş</h2><div className="sim-compare"><div><h3>Telefon / elle takip varsayımı</h3><p>{m.baselineCalls} telefon + {m.baselineActions} işlem</p><b>{format(m.baselineMinutes)} dakika</b></div><div><h3>Klinorbis kurgusal yürütmesi</h3><p>{m.calls} telefon + {m.actions} işlem · {m.automatic} otomatik adım</p><b>{format(m.modeledMinutes)} dakika</b></div></div><p className="sim-muted">{m.source} Model: telefon × {state.settings.callMinutes} dakika + işlem × {state.settings.actionSeconds} / 60. Süre farkı tasarruf garantisi değildir.</p></section>
   <nav className="sim-tabs" aria-label="Simülasyon bölümleri">{['Akış','Hastane ve ekip','Yataklar','Bildirimler','İşlem kaydı','Kapsam'].map(x=><button key={x} aria-pressed={tab===x} onClick={()=>setTab(x)}>{x}</button>)}</nav>
   {tab==='Akış'&&<section className="sim-card"><div className="sim-section-head"><h2>Kurgusal işler</h2><label>Birim<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="all">Tüm birimler</option>{SIM_UNITS.map(u=><option key={u.code} value={u.code}>{u.name}</option>)}</select></label></div><p>{state.handoffs} vardiya devri · {state.skippedChains} koşulsuz bağlı akış engellendi</p><div className="sim-table-wrap"><table><thead><tr><th>Olay / saat</th><th>Takma ad / varlık</th><th>Birim</th><th>Durum</th><th>İncele</th></tr></thead><tbody>{events.slice(-80).reverse().map(e=><tr key={e.id}><td>{e.title}<small>{e.id} · {clock(e.at)}</small></td><td>{e.patientAlias??'Hasta dışı iş'}<small>{e.campus} · {e.device??e.bed??'—'}</small></td><td>{SIM_UNITS.find(u=>u.code===e.unit)?.name??e.unit}</td><td>{e.status==='done'?'Tamamlandı':e.activeAt>state.cursor?'Zamanı bekleniyor':e.level?'Yükseltildi':'İşlemde'}</td><td><button className="sim-secondary" onClick={()=>setSelected(e.id)}>Akışı aç</button></td></tr>)}</tbody></table></div>
    {event&&<div className="sim-detail"><h3>{event.title} · {event.id}</h3><p>{event.playbook?'Mevcut Klinorbis akışı: '+event.playbook:'Birim görevi ve rol denetimi'} · Tümü kurgusal</p><ol>{event.steps.map((x,i)=><li key={i}><b>{x.done?'✓ ':i===event.step?'→ ':''}{x.task}</b><span>{x.unit} · {x.approval?'Kurgusal insan onayı':'Operasyon adımı'}{x.wait?` · ${x.wait/60} saat bekleme`:''}{x.actor?' · '+x.actor:''}</span></li>)}</ol>{event.proposal&&<><h4>30 randevu için mevcut planlayıcının önerileri</h4><p>{event.proposal.filter(x=>x.option==='clinical_review').length} hekim incelemesi · {event.proposal.filter(x=>x.startsAt).length} saat önerisi</p><ul>{event.proposal.map(p=><li key={p.appointmentReference}>{p.appointmentReference}: {p.reason}</li>)}</ul></>}</div>}
   </section>}
   {tab==='Hastane ve ekip'&&<section className="sim-card"><h2>{SIM_UNITS.length} birim · {SIM_STAFF.length} kurgusal personel · İki kampüs</h2><p>Vardiyalar: 08–16, 16–24 ve 24–08. Personel gerçek kullanıcı hesabı değildir.</p><div className="sim-unit-grid">{SIM_UNITS.map(u=><article key={u.code}><h3>{u.name}</h3>{SIM_STAFF.filter(p=>p.unit===u.code).map(p=><p key={p.id}>{p.label}<small>{p.shift}</small></p>)}</article>)}</div></section>}
   {tab==='Yataklar'&&<section className="sim-card"><h2>Kurgusal yataklar · {m.occupied}/{m.beds} dolu</h2><p>Taburcu ve yatış olayları doluluğu değiştirir. Canlı HBYS verisi kullanılmaz.</p><div className="sim-bed-grid">{state.beds.map(b=><div key={b.id} className={b.occupied?'sim-bed occupied':'sim-bed'}><b>{b.id}</b><small>{b.campus} · {b.unit}</small><span>{b.occupied?'Dolu':'Boş'}</span></div>)}</div></section>}
   {tab==='Bildirimler'&&<section className="sim-card"><h2>Kurgusal görev ve gecikme bildirimleri</h2><p>Bu kutu simülasyona özeldir. Gerçek personele SMS, e-posta veya telefon bildirimi gönderilmez.</p>{state.notifications.slice(-100).reverse().map(n=><p key={n.id}><b>{clock(n.at)} · {n.unit}</b> — {n.text}</p>)}</section>}
   {tab==='İşlem kaydı'&&<section className="sim-card"><h2>Simülasyon denetim izi</h2>{snapshot.audit.map((a,i)=><p key={i}>{new Date(a.recorded_at).toLocaleString('tr-TR')} · {a.action} · {a.actor}</p>)}<h3>Kurgusal süreç adımları</h3>{state.log.slice(-100).reverse().map((l,i)=><p key={i}>{clock(l.at)} · {l.text}</p>)}</section>}
  </>}
  {(!state||tab==='Kapsam')&&<section className="sim-card"><h2>Ne çalışıyor, ne varsayılıyor?</h2><ul className="sim-scope"><li><b>Simülasyonda çalışır:</b> saat bazlı olay üretimi, mevcut akış tanımları, birim yönlendirme ve 30 randevu için mevcut planlayıcı.</li><li><b>Simülasyonda canlandırılır:</b> kurgusal personel onayları, vardiya devri, iki eşikli süre aşımı, koşulsuz zincirin önlenmesi ve yatak hareketleri.</li><li><b>Entegrasyon gerektirir:</b> gerçek SMS/WhatsApp, HBYS randevu güncellemesi, canlı yatak akışı, hastane SSO bağlantısı. Buradaki bağlı senaryo yalnız varsayımdır.</li><li><b>Karar sınırı:</b> klinik sonuç, yoğun bakım ve güvenlik olayları kurgusal yetkili role bırakılır. Simülasyon gerçek acil çağrı veya klinik karar sistemi değildir.</li></ul></section>}
  <footer className="sim-banner">{SIM_LABEL}</footer>
 </main>;
}
