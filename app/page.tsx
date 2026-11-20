import Link from "next/link";
import { SiteFooter as Footer, SiteHeader as Header } from "./site-chrome";
import "./home-hastane.css";

// Ana sayfa: hastane yönetimine "hasta başvurudan çıkışa nasıl akıyor, birimler nasıl bağlanıyor,
// hasta sürecini nasıl görüyor" sorularını sırayla yanıtlar. Klinorbis klinik karar üretmez, tıbbi cihaz değildir.
const modules = [
  ["Hasta kabul ve provizyon", "Başvuru kanalı ne olursa olsun tek kayıt açılır. Provizyon alınamazsa hasta gerekçeyle vezneye aktarılır; yol kesilmez."],
  ["Poliklinik ve tetkik akışı", "Hekim tetkik, görüntüleme veya konsültasyon ister; hasta sırayla kan alma, laboratuvar, radyoloji birimlerine gider ve sonuç için polikliniğe döner."],
  ["Yatış, yatak ve taburculuk", "Yatış kararından yatak ayırma, servise taşıma, taburculuk hazırlığı, ilaç teslimi ve çıkışa kadar her adım sahibiyle izlenir."],
  ["Acil servis akışı", "Acil kayıt, acil süreç, konsültasyon ve yatış adımları; her birimin hedef karşılama süresi ve gecikme uyarısı."],
  ["Hastanın kendi takip ekranı", "Hasta fişteki kod ve PIN ile hangi birimde olduğunu, önünde kaç kişi olduğunu ve sıradaki adımı telefonundan görür."],
  ["Birim kuyrukları ve onay", "Her birim kendi sırasını görür: Başla, Tamamla, Reddet / başka birime aktar. Onaylanan iş anında sonraki birime düşer."],
  ["Hastane akış panosu", "Tüm birimlerdeki bekleyen, işlemdeki ve süresi aşılan hasta sayısı tek ekranda; darboğaz ilk bakışta görünür."],
  ["Birimler arası talep", "Teknik arıza, biyomedikal cihaz, temizlik, hasta taşıma, bilgi işlem talebi doğru birimin kuyruğuna gider."],
  ["Denetim izi ve KVKK", "Kim, ne zaman, hangi adımı attı; zincirlenmiş denetim kaydı. Ad, kimlik no, telefon serbest metinde otomatik maskelenir."],
];
const journey = [
  ["Başvuru", "Hasta kabul veya acil kayıt süreci açar; hastaya takip kodu ve PIN verilir."],
  ["Provizyon", "Sigorta onayı alınır; alınamazsa hasta gerekçeyle vezneye yönlendirilir."],
  ["Muayene", "Poliklinik hastayı alır. Hekim gerekirse tetkik, konsültasyon veya yatış ekler."],
  ["Tetkik", "Kan alma, laboratuvar, görüntüleme birimleri hastayı sırayla alır ve tamamlar."],
  ["Sonuç", "Hasta sonuç değerlendirmesi için aynı polikliniğe otomatik döner."],
  ["Çıkış", "Vezne ve danışma adımları biter; süreç kapanır, süreler raporlanır."],
];
const roles = [
  ["Hasta ve yakını", "Telefonundan sürecini görür: hangi birimde, sırada kaç kişi var, sıradaki adım ne."],
  ["Hasta kabul / acil sekreteri", "Başvuruyu açar, takip fişini yazdırır, hasta hangi birimdeyse oradan izler."],
  ["Hekim ve klinik birim", "Kendi sırasındaki hastayı alır, tetkik veya konsültasyon ekler, sonuçla tekrar görür."],
  ["Tanı ve destek birimleri", "Laboratuvar, radyoloji, eczane, vezne yalnız kendine düşen hastayı görür ve tamamlar."],
  ["Birim sorumlusu", "Biriminin yükünü, gecikmeleri ve ortalama işlem süresini izler."],
  ["Hastane yönetimi", "Tüm birimlerdeki akışı, darboğazı ve günlük tamamlanan süreçleri tek panoda görür."],
];
const compare = [
  ["Hastanın nerede olduğu", "Telefonla birimlere sorulur", "Tek ekranda, anlık"],
  ["Hastanın bilgilendirilmesi", "Danışmaya tekrar tekrar gelir", "Kendi telefonundan takip eder"],
  ["Birimden birime geçiş", "Kâğıt istem, sözlü yönlendirme", "Tamamla dendiği anda sonraki birime düşer"],
  ["Provizyon reddi", "Hasta poliklinikle vezne arasında kalır", "Gerekçeli aktarma, yol devam eder"],
  ["Tetkik sonrası dönüş", "Hasta hangi odaya döneceğini sorar", "Sonuç değerlendirmesi otomatik eklenir"],
  ["Bekleme süresi", "Ölçülmez", "Her birimde hedef süre ve gecikme uyarısı"],
  ["Kim ne yaptı", "Hatırlanana kadar", "Değiştirilemez denetim izi"],
];
const security = [
  "Her personel yalnız kendi biriminin işini yapar; yetki sunucuda denetlenir.",
  "Hasta ekranında ad, kimlik no, tanı veya personel bilgisi gösterilmez.",
  "Takip kodu ve PIN yalnız anahtarlı özet olarak saklanır; 5 hatalı denemede kod kilitlenir.",
  "Aynı adımı iki kişi aynı anda işleyemez; ikinci işlem reddedilir.",
  "Başka siteden gelen işlem istekleri ve aşırı deneme engellenir.",
  "Serbest metindeki telefon, T.C. kimlik no, kart ve IBAN otomatik maskelenir.",
];
const faq = [
  ["Klinorbis nedir?", "Hastanede hastanın başvurudan çıkışa kadar birimler arasındaki yolculuğunu yöneten ve personelin, yönetimin ve hastanın aynı süreci görmesini sağlayan hastane otomasyon yazılımıdır."],
  ["Klinik karar veriyor mu?", "Hayır. Tanı, tedavi veya öncelik kararı vermez. Hangi tetkikin, konsültasyonun veya yatışın gerektiğine hekim karar verir; Klinorbis işi doğru birime taşır ve süreyi ölçer."],
  ["HBYS ile birlikte nasıl çalışır?", "Klinorbis süreç ve birim koordinasyonunu yürütür; tıbbi kayıt, istem ve faturalama kurumun HBYS'sinde kalır. Kurumun HBYS'si ile entegrasyon, üreticinin belgelerine göre kurulumda yapılır."],
  ["Hasta sürecini nasıl görüyor?", "Hasta kabulde verilen fişte bir takip kodu, 6 haneli PIN ve QR kod bulunur. Hasta QR'ı okutup PIN'i girerek hangi birimde olduğunu ve sırasını görür."],
  ["Bir birim hastayı reddederse ne olur?", "Ret gerekçesi zorunludur ve hasta seçilen birime aktarılır. Örneğin provizyon alınamazsa hasta vezneye gider, ardından yolu kaldığı yerden devam eder."],
  ["Hangi cihazlardan kullanılır?", "Tarayıcıdan; bilgisayar, tablet ve telefonda çalışır. Kurulum gerekmez."],
  ["Kişisel veriler nasıl korunur?", "Hasta adı yerine HBYS protokol numarası kullanılır. Kişisel veri serbest metinde maskelenir; erişimler denetim izine yazılır. Ayrıntılar Gizlilik ve Aydınlatma sayfalarındadır."],
  ["Kurulum nasıl yapılır?", "Birimler ve personel rolleri tanımlanır, başvuru türleri kurumun işleyişine göre ayarlanır, ardından hasta kabulden başlanarak tüm birimler devreye alınır."],
];

function JourneyCard() {
  return <article className="kh-screen" aria-label="Hasta süreç ekranı görünümü">
    <header><b>Hasta süreçleri</b><span>Dahiliye · Poliklinik</span></header>
    <ul>
      <li><span>Hasta kabul</span><em className="ok">Tamamlandı</em></li>
      <li><span>Provizyon</span><em className="ok">Tamamlandı</em></li>
      <li><span>Dahiliye muayenesi</span><em className="ok">Tamamlandı</em></li>
      <li><span>Kan alma</span><em className="warn">Sırada · 3 kişi</em><button type="button" tabIndex={-1}>Hastayı al</button></li>
      <li><span>Laboratuvar</span><em className="info">Sırası gelecek</em></li>
      <li><span>Sonuç değerlendirme</span><em className="info">Sırası gelecek</em></li>
    </ul>
    <footer><span>Bekleyen 14</span><span>Süre aşımı 1</span><span>Ortalama 18 dk</span></footer>
  </article>;
}

export default function Home() {
  return <main className="marketing-shell kh">
    <Header />
    <section className="kh-hero" aria-labelledby="kh-title">
      <div>
        <span className="kh-kicker">HASTANE OTOMASYON SİSTEMİ</span>
        <h1 id="kh-title">Hasta başvurudan çıkışa, her birim tek akışta.</h1>
        <p>Hasta kabul, provizyon, poliklinik, tetkik, yatış, vezne ve çıkış birbirine bağlı çalışır. Bir birim işi onayladığı anda hasta sıradaki birime geçer; hasta da sürecini kendi telefonundan izler.</p>
        <div className="kh-actions"><Link href="/kurumsal-basvuru" className="kh-btn">Kurumsal görüşme talep edin →</Link><Link href="/takip" className="kh-ghost">Başvurumu takip et</Link></div>
        <ul className="kh-notes"><li>Klinik karar üretmez</li><li>Hasta kendi sürecini görür</li><li>Kurulum gerektirmez</li></ul>
      </div>
      <JourneyCard />
    </section>

    <section className="kh-band" aria-label="Kısaca"><p><b>Kısaca:</b> Klinorbis; hastanın hastanedeki yolculuğunu birim birim yönetir, her adımın sahibini ve süresini gösterir, onaylanan işi sonraki birime otomatik aktarır, reddedilen işi gerekçesiyle doğru birime yönlendirir. Tanı veya tedavi kararı vermez; tıbbi kayıt kurumun HBYS&apos;sinde kalır.</p></section>

    <section className="kh-sec" aria-labelledby="kh-problem">
      <span className="kh-kicker">Tanıdık geldi mi?</span>
      <h2 id="kh-problem">Hasta birimden birime gidiyor, kimse nerede olduğunu bilmiyor.</h2>
      <div className="kh-grid3">
        <div className="kh-card"><h3>Danışma önünde kuyruk</h3><p>Hasta ve yakını sırasını, sonucunu ve nereye gideceğini sormak için tekrar tekrar danışmaya gelir.</p></div>
        <div className="kh-card"><h3>Kâğıt istem, sözlü yönlendirme</h3><p>Tetkikten dönen hasta hangi odaya gideceğini bilmez; provizyon reddinde poliklinik ile vezne arasında kalır.</p></div>
        <div className="kh-card"><h3>Darboğaz görünmüyor</h3><p>Hangi birimde kaç hasta beklediği, kimin ne kadar sürede karşılandığı ölçülmez.</p></div>
      </div>
    </section>

    <section className="kh-sec" id="platform" aria-labelledby="kh-features">
      <span className="kh-kicker">Modüller</span>
      <h2 id="kh-features">Hastanenin bütün birimleri aynı süreçte</h2>
      <div className="kh-grid3">{modules.map(([t, d]) => <div className="kh-card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="kh-sec kh-alt" id="akis" aria-labelledby="kh-flow">
      <span className="kh-kicker">Nasıl çalışır</span>
      <h2 id="kh-flow">Bir poliklinik hastasının baştan sona yolculuğu</h2>
      <ol className="kh-flow kh-flow6">{journey.map(([t, d], i) => <li key={t}><span className="kh-num">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
      <p className="kh-muted">Her adımda birimin üç seçeneği vardır: <b>Tamamla</b> (hasta sonraki birime geçer), <b>Reddet / aktar</b> (gerekçeyle başka birime gider), <b>Ekle</b> (hekim tetkik, konsültasyon veya yatış ekler). Yatışlı, acil, günübirlik işlem, tetkik ve check-up süreçleri de aynı şekilde işler.</p>
    </section>

    <section className="kh-sec" aria-labelledby="kh-roles">
      <span className="kh-kicker">Kim ne görür</span>
      <h2 id="kh-roles">Hastadan yönetime, herkes aynı süreci görür</h2>
      <div className="kh-grid3">{roles.map(([t, d]) => <div className="kh-card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div>
    </section>

    <section className="kh-sec kh-alt" aria-labelledby="kh-compare">
      <span className="kh-kicker">Karşılaştırma</span>
      <h2 id="kh-compare">Bugünkü işleyiş ile Klinorbis arasındaki fark</h2>
      <div className="kh-table-wrap"><table className="kh-table"><thead><tr><th>Konu</th><th>Bugün</th><th>Klinorbis ile</th></tr></thead><tbody>{compare.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>✓ {c}</td></tr>)}</tbody></table></div>
    </section>

    <section className="kh-sec" id="guven" aria-labelledby="kh-sec-title">
      <span className="kh-kicker">Güvenlik ve KVKK</span>
      <h2 id="kh-sec-title">Hasta verisi en az düzeyde, her erişim kayıtlı</h2>
      <ul className="kh-limits">{security.map((s) => <li key={s}>{s}</li>)}</ul>
      <p className="kh-muted">Klinorbis tanı, tedavi veya sevk kararı üretmez; tıbbi cihaz değildir. Reçete, istem ve mali kayıt kurumun HBYS&apos;sinde tutulur.</p>
    </section>

    <section className="kh-sec kh-alt" id="kurulum" aria-labelledby="kh-setup">
      <span className="kh-kicker">Kurulum</span>
      <h2 id="kh-setup">Hastanenizde 4 adımda devreye alma</h2>
      <ol className="kh-flow kh-flow4">
        <li><span className="kh-num">1</span><h3>Birimler</h3><p>Hastanenizdeki birimler ve hedef karşılama süreleri tanımlanır.</p></li>
        <li><span className="kh-num">2</span><h3>Personel ve roller</h3><p>Her personel birimine ve rolüne göre eklenir; yalnız kendi işini görür.</p></li>
        <li><span className="kh-num">3</span><h3>Başvuru türleri</h3><p>Poliklinik, yatış, acil, günübirlik, tetkik ve check-up yolları kurumunuza göre ayarlanır.</p></li>
        <li><span className="kh-num">4</span><h3>Devreye alma</h3><p>Hasta kabulden başlanarak birimler sırayla açılır; süreler haftalık raporlanır.</p></li>
      </ol>
      <div className="kh-actions"><Link href="/kurumsal-basvuru" className="kh-btn">Kurumsal görüşme talep edin</Link><Link href="/kullanim-amaci" className="kh-ghost">Kullanım amacı ve sınırlar</Link></div>
    </section>

    <section className="kh-sec" id="sss" aria-labelledby="kh-faq">
      <span className="kh-kicker">Sık sorulan sorular</span>
      <h2 id="kh-faq">Merak edilenler</h2>
      <div className="kh-faq">{faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <section className="kh-cta" aria-labelledby="kh-cta"><h2 id="kh-cta">Hastanenizdeki hasta akışını birlikte planlayalım.</h2><p>Birimlerinizi, başvuru türlerinizi ve hedef sürelerinizi yazın; size özel kurulum planını hazırlayalım.</p><Link href="/kurumsal-basvuru" className="kh-btn kh-btn-light">Kurumsal görüşme talep edin →</Link></section>
    <Footer />
  </main>;
}
