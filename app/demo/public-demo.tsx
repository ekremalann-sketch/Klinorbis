"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const views = {
  overview: {
    label: "Komuta özeti",
    title: "Bugünün operasyon resmi",
    cards: [["Açık talep","24","−8% dünden"],["SLA riski","3","İnsan onayı gerekli"],["Aktif çağrı","7","2 ekip devrinde"],["Kapasite","%82","12 yatak uygun"]],
  },
  requests: {
    label: "Talep akışı",
    title: "Önceliklendirilmiş talepler",
    cards: [["Yeni","11","Son 30 dakika"],["İşlemde","9","Sorumlusu atanmış"],["Onay bekliyor","3","Yönetici kararı"],["Tamamlanan","41","Bugün"]],
  },
  capacity: {
    label: "Kapasite",
    title: "Birim ve kaynak görünümü",
    cards: [["Yoğun bakım","%91","Kritik eşik"],["Servis yatakları","%78","Normal"],["Ameliyathane","6/8","2 salon uygun"],["Transfer aracı","3/4","1 görevde"]],
  },
} as const;

const queue = [
  ["KLB-24018","Acil servis → Kardiyoloji","Yüksek","04:12"],
  ["KLB-24017","Yoğun bakım yatak talebi","Kritik","02:38"],
  ["KLB-24016","Görüntüleme randevu koordinasyonu","Normal","11:05"],
  ["KLB-24015","Nakil ekibi görevlendirmesi","Yüksek","07:44"],
  ["KLB-24014","Laboratuvar sonuç teslimi","Normal","13:22"],
  ["KLB-24013","Ameliyathane hazırlık kontrolü","Yüksek","06:10"],
  ["KLB-24012","Eczane ilaç tedarik bildirimi","Yüksek","09:31"],
  ["KLB-24011","Biyomedikal cihaz arıza bildirimi","Normal","18:47"],
  ["KLB-24010","Servis yatak tahsis isteği","Yüksek","12:03"],
  ["KLB-24009","Taburculuk koordinasyonu","Normal","21:14"],
  ["KLB-24008","Temizlik ve oda hazırlığı","Normal","16:29"],
  ["KLB-24007","Acil ekip destek çağrısı","Kritik","01:56"],
];

const scenarioEvents = [
  "Çağrı merkezi yeni bir nakil talebini kaydetti.",
  "Sistem uygun birimi önerdi; klinik karar için insan onayı bekleniyor.",
  "Birim yöneticisi yoğun bakım talebini inceleme kuyruğuna aldı.",
  "Görüntüleme randevusu için zaman hedefi yaklaşıyor.",
  "Nakil ekibine görev önerildi; görevli kabulü bekleniyor.",
  "Kardiyoloji yönlendirmesi insan onayıyla tamamlandı.",
  "Görev devri işlem geçmişine kaydedildi.",
  "SLA riski operasyon yöneticisinin ekranına taşındı.",
] as const;

export default function PublicDemo(){
  const [view,setView]=useState<keyof typeof views>("overview");
  const [priorityFilter,setPriorityFilter]=useState<"Tümü"|"Yüksek"|"Kritik">("Tümü");
  const [showApprovals,setShowApprovals]=useState(false);
  const [scenarioStep,setScenarioStep]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [selectedRef,setSelectedRef]=useState<string | null>(null);
  useEffect(()=>{
    if(!playing)return;
    const timer=window.setInterval(()=>setScenarioStep(step=>(step+1)%scenarioEvents.length),9000);
    return ()=>window.clearInterval(timer);
  },[playing]);
  const current=views[view];
  const visibleQueue=queue.filter((item)=>priorityFilter==="Tümü"||item[2]===priorityFilter);
  const nextFilter=priorityFilter==="Tümü"?"Yüksek":priorityFilter==="Yüksek"?"Kritik":"Tümü";
  return <main className="demo-shell">
    <aside className="demo-sidebar">
      <Link className="demo-brand" href="/"><span>K</span><b>KLINORBIS</b></Link>
      <small>OPERASYON KONTROL KULESİ</small>
      <nav aria-label="Demo bölümleri">{Object.entries(views).map(([key,item])=><button key={key} type="button" aria-current={view===key?"page":undefined} className={view===key?"active":""} onClick={()=>setView(key as keyof typeof views)}>{item.label}</button>)}</nav>
      <div className="demo-trust"><i/> SENTETİK DEMO VERİSİ<small>Gerçek hasta verisi içermez</small></div>
      <Link className="demo-back" href="/">← Ürün sayfasına dön</Link>
      <Link className="demo-back" href="/en/demo" hrefLang="en">English demo</Link>
    </aside>
    <section className="demo-main"><div className="workspace-demo-entry"><p>Bu demo örnekleri gösterir. Talep oluşturmak ve başka birime aktarmak için yetkili çalışma alanını açın.</p><Link href="/workspace">Talep yönetimini aç</Link></div>
      <header className="demo-topbar"><div><span>Kontrol merkezi · Örnek senaryo</span><h1>{current.title}</h1></div><div className="demo-status">Sentetik veriler</div></header>
      <article className="demo-panel" style={{marginBlock:"18px"}} aria-label="Sentetik operasyon senaryosu">
        <small>SENTETİK SENARYO · CANLI SİSTEM VERİSİ DEĞİL</small>
        <h2>Operasyon akışı</h2>
        <p aria-live="polite"><b>Adım {scenarioStep+1}/{scenarioEvents.length}:</b> {scenarioEvents[scenarioStep]}</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button type="button" onClick={()=>setPlaying(value=>!value)}>{playing?"Duraklat":"Devam et"}</button>
          <button type="button" onClick={()=>setScenarioStep(step=>(step+1)%scenarioEvents.length)}>Sonraki olay</button>
          <button type="button" onClick={()=>{setScenarioStep(0);setSelectedRef(null)}}>Başa dön</button>
        </div>
        <small>Olaylar 9 saniyede bir ilerler. Gerçek kayıt oluşturulmaz; insan onayı gereken adımlar otomatik tamamlanmaz.</small>
      </article>
      <div className="demo-kpis">{current.cards.map(([label,value,note])=><article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
      <div className="demo-grid">
        <article className="demo-panel demo-wide"><header><div><small>ÖRNEK İŞ AKIŞI</small><h2>Öncelikli operasyon kuyruğu</h2></div><button type="button" aria-label={`Öncelik filtresi: ${priorityFilter}. Sonraki: ${nextFilter}`} onClick={()=>setPriorityFilter(nextFilter)}>Öncelik: {priorityFilter}</button></header><div className="demo-table" aria-live="polite"><div className="demo-row demo-head"><span>Referans</span><span>Akış</span><span>Öncelik</span><span>Süre</span></div>{visibleQueue.map(([ref,flow,priority,time])=><div className="demo-row" key={ref}><button type="button" onClick={()=>setSelectedRef(ref)} aria-label={`${ref} örnek kaydını incele`}>{ref}</button><span>{flow}</span><em className={priority==="Kritik"?"critical":priority==="Yüksek"?"high":"normal"}>{priority}</em><time>{time}</time></div>)}</div>{selectedRef&&<p role="status"><b>{selectedRef}</b> örnek kaydı seçildi. Gerçek yönlendirme ve kayıt geçmişi için yetkili çalışma alanına geçin.</p>}</article>
        <article className="demo-panel"><small>KAPASİTE SİNYALİ</small><h2>Birim dolulukları</h2>{[["Acil servis",88],["Yoğun bakım",91],["Kardiyoloji",74],["Görüntüleme",63]].map(([n,v])=><div className="capacity" key={String(n)}><span>{n}<b>%{v}</b></span><div><i style={{width:`${v}%`}}/></div></div>)}</article>
        <article className="demo-panel"><small>İNSAN ONAYI</small><h2>Kontrollü otomasyon</h2><div className="approval"><span>Örnek transfer planı</span><b>3 karar bekliyor</b><p>Kritik yönlendirmeler yetkili kullanıcı onayı olmadan uygulanmaz.</p><button type="button" aria-expanded={showApprovals} aria-controls="demo-approvals" onClick={()=>setShowApprovals(!showApprovals)}>{showApprovals?"Karar kuyruğunu kapat":"Karar kuyruğunu incele"}</button><div id="demo-approvals" hidden={!showApprovals} className="demo-approvals" aria-live="polite"><p><b>KLB-24017</b> · Yoğun bakım yatak talebi · Klinik ekip onayı bekleniyor.</p><p><b>KLB-24018</b> · Acil servis transferi · Birim sorumlusu onayı bekleniyor.</p><p><b>KLB-24015</b> · Nakil koordinasyonu · Operasyon yöneticisi onayı bekleniyor.</p><small>Bu gösterim kayıt değiştirmez; gerçek onay yalnızca yetkili çalışma alanında verilir.</small></div></div></article>
      </div>
      <footer className="demo-footer">KLINORBIS ürün demosu · Veriler yalnızca ürün davranışını göstermek için üretilmiştir.</footer>
    </section>
  </main>
}
