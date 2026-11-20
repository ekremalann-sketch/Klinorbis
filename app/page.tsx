import Link from "next/link";
import "./corporate-home.css";

const areas = [["Yatak ve temizlik","Yatak durumunu, temizlik sırasını ve kontrol sonucunu takip edin."],["Taşıma ve talepler","Görevin sahibi, teslim adımı ve vardiya devri aynı işte görünür."],["Cihaz ve bakım","Cihazı QR ile bulun. Bakım ve kalibrasyon vadelerini izleyin."],["Renkli kodlar","Çağrıyı yetkili ekibe iletin ve müdahale kaydını takip edin."]];

export default function Home() {
  return <main className="corporate-home">
    <header className="corporate-home__bar"><Link href="/">Klinorbis</Link><nav aria-label="Kurumsal bağlantılar"><Link href="/gizlilik">Gizlilik</Link><Link href="/hakkimizda">Hakkımızda</Link></nav></header>
    <section className="corporate-home__hero" aria-labelledby="home-title">
      <p className="corporate-home__label">Hastane operasyonları</p>
      <h1 id="home-title">Hastanenin klinik dışı işlerini tek merkezden yönetin.</h1>
      <p>Birimlere düşen talepleri, yatak hazırlığını, taşıma görevlerini, ekipman bakımını ve renkli kod bildirimlerini sorumlularıyla izleyin.</p>
      <Link className="corporate-home__action" href="/giris">Çalışma alanına giriş</Link>
    </section>
    <section aria-labelledby="home-areas" className="corporate-home__body">
      <h2 id="home-areas">Operasyon alanları</h2>
      <div className="corporate-home__grid">{areas.map(([name, detail]) => <article key={name}><h3>{name}</h3><p>{detail}</p></article>)}</div>
      <p className="corporate-home__note">Klinorbis klinik karar desteği değildir.</p>
    </section>
    <footer className="corporate-home__bar"><span>© Klinorbis</span><Link href="/gizlilik">Gizlilik</Link><Link href="/hakkimizda">Hakkımızda</Link></footer>
  </main>;
}
