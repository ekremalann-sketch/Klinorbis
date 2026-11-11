import Link from "next/link";
import { SiteFooter as Footer, SiteHeader as Header } from "./site-chrome";
import "./home-hastane.css";

// Ana sayfa: hastane operasyon yöneticisine "ne işe yarar, nasıl çalışır, pilot nasıl başlar" sorularını sırayla yanıtlar.
// Klinorbis klinik karar üretmez ve tıbbi cihaz değildir; demo yalnız kurgusal veriyle çalışır.
const features = [
  ["Yatak durumu", "Her yatak için tek durum: hazır, dolu, temizlik bekliyor, rezerve, engelli. Resmî taburcu ile fiziksel ayrılış ayrı izlenir."],
  ["Temizlik kuyruğu", "Fiziksel ayrılış tek temizlik görevi açar. Görevi üstlenen kişi sahip olur; kontrolü başka bir yetkili yapar."],
  ["Hasta taşıma", "Taşıma görevlisi işi kabul eder, başlatır ve teslimi iki kimlik unsuru ile alıcı onayıyla kaydeder."],
  ["Transfer kararı", "Hedef birim transferi kabul eder veya gerekçeyle reddeder. Ret yatağı serbest bırakır; talep başka yatağa aynı dosyada teklif edilir."],
  ["Yatak ayırma süresi", "Ayrılan yatak 30 dakika içinde kullanılmazsa kendiliğinden serbest kalır; yetkili gerekçeyle iptal edebilir."],
  ["Vardiya devri", "Görev, devralan kişi kabul edene kadar mevcut sahibinde kalır. Sahipsiz iş kalmaz."],
  ["Birim kuyrukları", "Her birim yalnız kendi işlerini görür. Açık görevler kapanmış kayıtların arasında kaybolmaz."],
  ["İşlem geçmişi", "Kim, ne zaman, hangi adımı attı; her işlem kayıtlıdır ve geriye dönük izlenir."],
  ["Kaynak sistem uyumu", "HBYS'den gelen olaylar sıra ve tekrar kontrolünden geçer; çelişki varsa kayıt incelemeye düşer, sessizce uygulanmaz."],
];
const flow = [
  ["Talep", "Yetkili personel transfer veya yatak talebini açar."],
  ["Yatak", "Hazır yatak ayrılır, hedef birim kabul eder."],
  ["Temizlik", "Boşalan yatak temizlenir ve bağımsız kontrol edilir."],
  ["Taşıma", "Görevli hastayı taşır, teslimi alıcıyla doğrular."],
  ["Devir", "Vardiya sonunda açık işler kabul edilerek devredilir."],
];
const roles = [
  ["Operasyon yöneticisi", "Tüm yatakları, gecikmeleri ve birimler arası transferleri tek ekranda görür."],
  ["Birim sorumlusu", "Kendi biriminin kuyruğunu yönetir, gelen transferi kabul veya reddeder."],
  ["Temizlik ekibi", "Telefonundan sıradaki odayı görür, işi üstlenir ve tamamlar."],
  ["Taşıma görevlisi", "Kendisine düşen taşımayı kabul eder ve teslimi kaydeder."],
];
const compare = [
  ["Hangi yatağın hazır olduğu", "Telefonla sorulur", "Tek ekranda, anlık"],
  ["Temizlik sırası", "Beyaz tahta veya sözlü", "Sıralı kuyruk, görev sahibi belli"],
  ["Temizliğin kontrolü", "Çoğu zaman yapılmaz", "Yapan kişiden farklı yetkili onaylar"],
  ["Transfer kabulü", "Telefonda, kayıtsız", "Kabul veya gerekçeli ret, kayıtlı"],
  ["Ayrılan ama kullanılmayan yatak", "Saatlerce boş bekler", "30 dakikada serbest kalır"],
  ["Vardiya değişimi", "Not kâğıdı", "Kabul edilmeden devredilmez"],
  ["Geçmiş", "Hatırlanana kadar", "Her adım tarihli kayıt"],
];
const checklist = [
  "Yatak durumunu HBYS'den bağımsız, fiziksel olarak doğruluyor mu?",
  "Temizliği yapan kişi kendi işini onaylayabiliyor mu? (Onaylayamamalı.)",
  "Ayrılan yatak kullanılmazsa kendiliğinden serbest kalıyor mu?",
  "Transfer reddi gerekçeli ve kayıtlı mı?",
  "Vardiya değişiminde sahipsiz iş kalıyor mu?",
  "Her birim yalnız kendi verisini mi görüyor?",
  "Sistem klinik karar veya tedavi önerisi üretiyor mu? (Üretmemeli.)",
  "Pilot, gerçek hasta verisi olmadan başlatılabiliyor mu?",
];
const faq = [
  ["Klinorbis nedir?", "Hastanelerde yatak, temizlik, hasta taşıma, transfer ve vardiya devrini tek ekranda koordine eden bir operasyon yazılımıdır."],
  ["Klinik karar veriyor mu?", "Hayır. Tanı, tedavi, triyaj veya sevk kararı üretmez. Hangi hastanın nereye gideceğine yetkili sağlık personeli karar verir; Klinorbis yalnız işin kimde olduğunu ve nerede kaldığını gösterir."],
  ["Tıbbi cihaz mı?", "Hayır. Hastanın tanı veya tedavisine yönelik bir işlev içermez; operasyon koordinasyon yazılımıdır."],
  ["HBYS'nin yerine mi geçiyor?", "Hayır. HBYS kayıt sistemi olarak kalır. Klinorbis onun yanında, operasyon ekiplerinin günlük koordinasyonu için çalışır."],
  ["Gerçek hasta verisi gerekiyor mu?", "Demo ve ilk pilot tamamen kurgusal kayıtlarla çalışır. Gerçek bağlantı ancak kurumun onayı ve veri işleme sözleşmesiyle açılır."],
  ["HBYS bağlantısı hazır mı?", "Bugün gerçek HBYS bağlantısı kapalıdır. Bağlantı, kurumun kullandığı HBYS üreticisinin belgelerine göre pilotta birlikte kurulur."],
  ["Hangi cihazlardan kullanılır?", "Tarayıcıdan; bilgisayar, tablet ve telefonda çalışır. Kurulum gerekmez."],
  ["Personel yetkisi nasıl yönetilir?", "Her kişi rolüne ve birimine göre yalnız kendi işlerini görür. Yetkiler kurumun personel dizinine göre tanımlanır."],
  ["Pilot ne kadar sürer?", "Önerilen süre 8–12 haftadır: bir birimde başlanır, ölçüm yapılır, sonuç birlikte değerlendirilir."],
  ["Ücret ne kadar?", "Pilot ücretsizdir. Sonraki kullanım kurumun büyüklüğüne göre yazılı teklifle belirlenir."],
];

function ScreenCard() {
  return <article className="kh-screen" aria-label="Yatak ekranı örneği (kurgusal)">
    <header><b>Yatak ve temizlik</b><span>Kurgusal örnek</span></header>
    <ul>
      <li><span>YTK-101</span><em className="ok">Hazır</em></li>
      <li><span>YTK-102</span><em className="info">Rezerve · 24 dk</em></li>
      <li><span>YTK-103</span><em className="warn">Temizlik bekliyor</em><button type="button" tabIndex={-1}>Temizliğe başla</button></li>
      <li><span>YTK-104</span><em className="warn">Kontrol bekliyor</em></li>
      <li><span>YTK-105</span><em className="info">Dolu</em></li>
    </ul>
    <footer><span>Hazır 1</span><span>Temizlikte 2</span><span>Ortalama dönüş 52 dk</span></footer>
  </article>;
}

export default function Home() {
  return <main className="marketing-shell kh">
    <Header />
    <section className="kh-hero" aria-labelledby="kh-title">
      <div>
        <span className="kh-kicker">HASTANE OPERASYON KONTROL KULESİ</span>
        <h1 id="kh-title">Boşalan yatağı daha hızlı hazır hale getirin.</h1>
        <p>Yatak, temizlik, hasta taşıma ve transferi tek ekranda koordine edin. Her işin kimde olduğunu ve nerede kaldığını herkes aynı anda görür.</p>
        <div className="kh-actions"><Link href="/demo" className="kh-btn">Kurgusal demoyu aç →</Link><a href="#pilot" className="kh-ghost">Pilot nasıl başlar?</a></div>
        <ul className="kh-notes"><li>Klinik karar üretmez</li><li>Gerçek hasta verisi olmadan demo</li><li>Kurulum gerektirmez</li></ul>
      </div>
      <ScreenCard />
    </section>

    <section className="kh-band" aria-label="Kısaca"><p><b>Kısaca:</b> Klinorbis; yatak durumu, temizlik kuyruğu, hasta taşıma, transfer kabul/ret, yatak ayırma süresi ve vardiya devrini tek sistemde toplar. Tanı veya tedavi kararı vermez, tıbbi cihaz değildir; yalnız operasyon ekiplerinin koordinasyonunu sağlar.</p></section>

    <section className="kh-sec" aria-labelledby="kh-problem">
      <span className="kh-kicker">Tanıdık geldi mi?</span>
      <h2 id="kh-problem">Acilde hasta bekliyor, serviste yatak boş ama hazır değil.</h2>
      <div className="kh-grid3">
        <div className="kh-card"><h3>Yatak bilgisi telefonda</h3><p>Hangi yatağın gerçekten hazır olduğunu öğrenmek için birimler tek tek aranıyor.</p></div>
        <div className="kh-card"><h3>Temizlik sırası belirsiz</h3><p>Boşalan oda temizlik ekibine geç haber veriliyor; kontrol yapılıp yapılmadığı bilinmiyor.</p></div>
        <div className="kh-card"><h3>Vardiyada iş kayboluyor</h3><p>Yarım kalan taşıma veya transfer, vardiya değişiminde sahipsiz kalıyor.</p></div>
      </div>
    </section>

    <section className="kh-sec" id="platform" aria-labelledby="kh-features">
      <span className="kh-kicker">Özellikler</span>
      <h2 id="kh-features">Bir yatağın boşalmasından yeni hastanın yerleşmesine kadar</h2>
      <div className="kh-grid3">{features.map(([t, d]) => <div className="kh-card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="kh-sec kh-alt" id="akis" aria-labelledby="kh-flow">
      <span className="kh-kicker">Nasıl çalışır</span>
      <h2 id="kh-flow">Bir transferin baştan sona yolculuğu</h2>
      <ol className="kh-flow">{flow.map(([t, d], i) => <li key={t}><span className="kh-num">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
    </section>

    <section className="kh-sec" aria-labelledby="kh-roles">
      <span className="kh-kicker">Kim ne görür</span>
      <h2 id="kh-roles">Herkes yalnız kendi işini görür</h2>
      <div className="kh-grid4">{roles.map(([t, d]) => <div className="kh-card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="kh-sec kh-alt" aria-labelledby="kh-compare">
      <span className="kh-kicker">Karşılaştırma</span>
      <h2 id="kh-compare">Telefon ve beyaz tahta ile Klinorbis arasındaki fark</h2>
      <div className="kh-table-wrap"><table className="kh-table"><thead><tr><th>Konu</th><th>Bugün</th><th>Klinorbis ile</th></tr></thead><tbody>{compare.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>✓ {c}</td></tr>)}</tbody></table></div>
    </section>

    <section className="kh-sec" aria-labelledby="kh-who">
      <span className="kh-kicker">Kimler için</span>
      <h2 id="kh-who">Yatak dönüşü önemli olan her hastane</h2>
      <ul className="kh-chips"><li>Özel hastaneler</li><li>Şehir hastaneleri</li><li>Devlet hastaneleri</li><li>Üniversite hastaneleri</li><li>Tesis yönetim firmaları</li><li>Hasta taşıma ekipleri</li></ul>
      <p className="kh-muted">Pilot için 1 birim ve 10–30 personel yeterlidir.</p>
    </section>

    <section className="kh-sec kh-alt" aria-labelledby="kh-check">
      <span className="kh-kicker">Seçmeden önce</span>
      <h2 id="kh-check">Bir operasyon yazılımında sormanız gereken 8 soru</h2>
      <ol className="kh-qlist">{checklist.map(q => <li key={q}>{q}</li>)}</ol>
    </section>

    <section className="kh-sec" id="pilot" aria-labelledby="kh-pilot">
      <span className="kh-kicker">Pilot</span>
      <h2 id="kh-pilot">Ücretsiz pilot: 4 adımda başlayın</h2>
      <ol className="kh-flow kh-flow4">
        <li><span className="kh-num">1</span><h3>Demoyu inceleyin</h3><p>Kurgusal hastanede yatak, temizlik ve taşıma akışını deneyin.</p></li>
        <li><span className="kh-num">2</span><h3>Birim seçin</h3><p>Pilot için bir servis veya kat belirleyin; hedef ölçütleri birlikte yazalım.</p></li>
        <li><span className="kh-num">3</span><h3>Ekibi ekleyin</h3><p>Sorumlu, temizlik ve taşıma personeli rolleriyle tanımlanır.</p></li>
        <li><span className="kh-num">4</span><h3>Ölçün</h3><p>Yatak dönüş süresi ve gecikmeler haftalık raporlanır, sonuç birlikte değerlendirilir.</p></li>
      </ol>
      <div className="kh-actions"><Link href="/demo" className="kh-btn">Kurgusal demoyu aç</Link><Link href="/hakkimizda" className="kh-ghost">Pilot için iletişim</Link></div>
    </section>

    <section className="kh-sec kh-alt" id="guven" aria-labelledby="kh-limits">
      <span className="kh-kicker">Sınırlar</span>
      <h2 id="kh-limits">Klinorbis ne yapmaz?</h2>
      <ul className="kh-limits">
        <li>Tanı, tedavi, triyaj veya sevk kararı üretmez; tıbbi cihaz değildir.</li>
        <li>HBYS'nin yerine geçmez, reçete veya mali kayıt yazmaz.</li>
        <li>Gerçek HBYS bağlantısı bugün kapalıdır; bağlıymış gibi gösterilmez.</li>
        <li>Demo yalnız kurgusal kayıtlarla çalışır.</li>
      </ul>
    </section>

    <section className="kh-sec" id="sss" aria-labelledby="kh-faq">
      <span className="kh-kicker">Sık sorulan sorular</span>
      <h2 id="kh-faq">Merak edilenler</h2>
      <div className="kh-faq">{faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <section className="kh-cta" aria-labelledby="kh-cta"><h2 id="kh-cta">Kurgusal hastanede 5 dakikada deneyin.</h2><p>Kayıt yok, gerçek veri yok.</p><Link href="/demo" className="kh-btn kh-btn-light">Demoyu aç →</Link></section>
    <Footer />
  </main>;
}
