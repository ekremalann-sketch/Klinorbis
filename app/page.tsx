import Link from "next/link";
import { SiteFooter as Footer, SiteHeader as Header } from "./site-chrome";

// Ana sayfa (20 Kasım): Ekim sürümünün koyu "kontrol kulesi" kimliği geri geldi; anlatım yatak/temizlik yerine
// hastanenin klinik dışı operasyonlarının tamamını kapsar. Yalnız çalışan modüller anlatılır. Tek ana düğme.
// Klinorbis klinik karar üretmez, tıbbi cihaz değildir; gerçek HBYS bağlantısı yoktur (benzetim ve dosya yükleme).
const modules = [
  ["Yatak ve temizlik", "Boşalan yatak tek temizlik görevi açar; temizliği yapan değil başka bir yetkili kontrol eder, yatak sonra hazır olur."],
  ["Hasta taşıma ve transfer", "Taşıma görevlisi işi kabul eder ve teslimi alıcıyla kaydeder. Hedef birim transferi kabul eder ya da gerekçeyle reddeder."],
  ["Birimler arası talep", "Talep doğru birimin iş kutusuna düşer. Talep eden kişi durumu, sorumluyu ve sıradaki adımı görür."],
  ["Cihaz ve teknik bakım", "Her cihazın kodu, QR etiketi ve zimmeti var. Bakım ve kalibrasyon vadesi gelince teknik birime iş kendiliğinden açılır."],
  ["Renkli kodlar", "Tek ekrandan kod çağrısı; ilgili ekip anında bildirim alır. Çağrı, onay, varış ve kapanış süreleri kayda geçer."],
  ["Arıza bildirimi", "Her personel arızayı birkaç alanla bildirir; iş doğru teknik birime gider, bildiren kişi giderildiğini onaylar."],
];
const flow = [
  ["Talep açılır", "Personel talebi veya arızayı birkaç alanla kaydeder."],
  ["Doğru birime gider", "İş, sorumlu birimin kutusuna düşer; sahibi bellidir."],
  ["Kabul ve yürütme", "Uygun rol işi kabul eder; gecikirse sorumluya yükselir."],
  ["Kapanış görünür", "Talep eden kişi sonucu ve kimin kapattığını görür."],
];

export default function Home() {
  return <main className="marketing-shell">
    <Header />
    <section className="marketing-hero">
      <div className="hero-message">
        <span className="kicker">HASTANE OPERASYON MERKEZİ</span>
        <h1>Hastanenin klinik dışı işleri,<br/><em>tek merkezden ve sahibiyle.</em></h1>
        <p>Yatak, temizlik, hasta taşıma, cihaz bakımı, renkli kodlar ve birimler arası talepler aynı sistemde. Her işin kimde olduğu, sırada ne olduğu ve ne kadar sürdüğü görünür.</p>
        <div className="hero-buttons"><Link href="/giris" className="hero-primary">Çalışma alanına giriş <span>→</span></Link></div>
        <div className="hero-proof"><span><i/>Klinik karar üretmez</span><span><i/>Her adım kayıtlı</span><span><i/>Birim bazlı yetki</span></div>
      </div>
      <OperationsView />
    </section>
    <section className="executive-strip"><article><b>Tek operasyon görünümü</b><span>Dağınık telefon ve tahta yerine ortak durum</span></article><article><b>Sahipsiz iş kalmaz</b><span>Devir, kabul edilene kadar mevcut sahibinde</span></article><article><b>Operasyon desteği, klinik karar değil</b><span>Tanı veya tedavi kararı üretmez</span></article></section>
    <section className="marketing-section" id="platform"><div className="section-intro"><span className="kicker">ÇALIŞAN MODÜLLER</span><h2>Klinik dışı operasyonun günlük işi, aynı zincirde.</h2><p>Her modülde iş bir birime aittir, bir sahibi vardır ve her adımı kayıtlıdır.</p></div><div className="capability-grid">{modules.map(([title,text],i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="workflow-section" id="akis"><div><span className="kicker">İŞ NASIL İLERLER</span><h2>Talep kaybolmaz, karar sahipsiz kalmaz.</h2><p>Talep eden kişi, işin hangi birimde, kimde ve hangi adımda olduğunu kendi ekranından izler.</p></div><ol>{flow.map(([a,b],i)=><li key={a}><b>0{i+1}</b><span><strong>{a}</strong><small>{b}</small></span></li>)}</ol></section>
    <section className="trust-section" id="guven"><div className="trust-card"><span>ÜRÜN SINIRI</span><h2>Operasyonu yönetir; klinik karar vermez.</h2><p>Klinorbis tanı, triyaj, tedavi veya klinik uygunluk kararı üretmez ve tıbbi cihaz değildir. Bugün gerçek bir HBYS bağlantısı yoktur; yatak listesi dosyayla yüklenir. Ayrıntılar <Link href="/kullanim-amaci">kullanım amacı</Link> sayfasında.</p></div><div className="trust-list">{[["Birim bazlı yetki","Her birim yalnız kendi işini görür"],["İnsan onayı","Kritik adımda yetkili kişi karar verir"],["Değişmez kayıt","Kim, ne zaman, hangi adımı attı"],["Açık kapsam","Ne yapıp ne yapmadığı yazılı"]].map(([a,b])=><article key={a}><b>{a}</b><span>{b}</span></article>)}</div></section>
    <section className="pilot-section" id="pilot"><div><span className="kicker">KURUMSAL BAŞLANGIÇ</span><h2>Önce tek akışla başlayın, sonra genişletin.</h2><p>Bir kurum, bir operasyon akışı ve yazılı kabul ölçütleriyle başlanır. Veri sorumluluğu ve destek koşulları başlamadan önce yazılı hâle getirilir.</p></div><div className="pilot-steps"><span><b>01</b>Akış ve birimlerin seçimi</span><span><b>02</b>Personel ve yetki tanımı</span><span><b>03</b>Kontrollü kullanım</span><span><b>04</b>Ölçüm ve genişletme kararı</span></div></section>
    <Footer />
  </main>;
}

// Ürün ekranının sade bir görünümü. Sayılar kurgusaldır; canlı ölçüm değildir.
function OperationsView(){
  const rows: [string,string,string][] = [
    ["Yatak 3B-12","Temizlik kontrolü bekliyor","Kat sorumlusu"],
    ["Taşıma TAS-48","Yolda · 6 dk","Taşıma ekibi"],
    ["Cihaz BIO-0007","Kalibrasyon 5 gün içinde","Biyomedikal"],
    ["Talep TLP-221","Kabul edildi","Teknik hizmetler"],
  ];
  return <div className="command-preview" aria-label="Operasyon ekranı görünümü (kurgusal kayıtlar)">
    <div className="preview-head"><span>OPERASYON MERKEZİ</span><b>BUGÜN</b></div>
    <div className="preview-metrics"><article><small>Açık işler</small><strong>28</strong><em>4 gecikmede</em></article><article><small>Hazır yatak</small><strong>17</strong><em>3 temizlikte</em></article><article><small>Açık kod</small><strong>0</strong><em>Son 24 saat: 2</em></article></div>
    <div className="preview-body" style={{gridTemplateColumns:"1fr"}}><div className="preview-flow" style={{width:"100%"}}>{rows.map(([a,b,c])=><span key={a}><b>{a}</b> · {b} · {c}</span>)}</div></div>
    <div className="preview-foot"><span>Her satırın sahibi ve sıradaki adımı belli</span><span>Kurgusal kayıtlar</span></div>
  </div>;
}
