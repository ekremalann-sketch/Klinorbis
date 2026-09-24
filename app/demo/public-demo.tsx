"use client";

import { useState } from "react";
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
];

export default function PublicDemo(){
  const [view,setView]=useState<keyof typeof views>("overview");
  const current=views[view];
  return <main className="demo-shell">
    <aside className="demo-sidebar">
      <Link className="demo-brand" href="/"><span>K</span><b>KLINORBIS</b></Link>
      <small>OPERASYON KONTROL KULESİ</small>
      <nav>{Object.entries(views).map(([key,item])=><button key={key} className={view===key?"active":""} onClick={()=>setView(key as keyof typeof views)}>{item.label}</button>)}</nav>
      <div className="demo-trust"><i/> SENTETİK DEMO VERİSİ<small>Gerçek hasta verisi içermez</small></div>
      <Link className="demo-back" href="/">← Ürün sayfasına dön</Link>
    </aside>
    <section className="demo-main">
      <header className="demo-topbar"><div><span>Kontrol merkezi</span><h1>{current.title}</h1></div><div className="demo-status"><i/> Sistem görünümü aktif</div></header>
      <div className="demo-kpis">{current.cards.map(([label,value,note])=><article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
      <div className="demo-grid">
        <article className="demo-panel demo-wide"><header><div><small>CANLI İŞ AKIŞI</small><h2>Öncelikli operasyon kuyruğu</h2></div><button>Filtrele</button></header><div className="demo-table"><div className="demo-row demo-head"><span>Referans</span><span>Akış</span><span>Öncelik</span><span>Süre</span></div>{queue.map(([ref,flow,priority,time])=><div className="demo-row" key={ref}><b>{ref}</b><span>{flow}</span><em className={priority==="Kritik"?"critical":priority==="Yüksek"?"high":"normal"}>{priority}</em><time>{time}</time></div>)}</div></article>
        <article className="demo-panel"><small>KAPASİTE SİNYALİ</small><h2>Birim dolulukları</h2>{[["Acil servis",88],["Yoğun bakım",91],["Kardiyoloji",74],["Görüntüleme",63]].map(([n,v])=><div className="capacity" key={String(n)}><span>{n}<b>%{v}</b></span><div><i style={{width:`${v}%`}}/></div></div>)}</article>
        <article className="demo-panel"><small>İNSAN ONAYI</small><h2>Kontrollü otomasyon</h2><div className="approval"><span>Transfer planı</span><b>3 karar bekliyor</b><p>Kritik yönlendirmeler yetkili kullanıcı onayı olmadan uygulanmaz.</p><button>Karar kuyruğunu incele</button></div></article>
      </div>
      <footer className="demo-footer">KLINORBIS ürün demosu · Veriler yalnızca ürün davranışını göstermek için üretilmiştir.</footer>
    </section>
  </main>
}
