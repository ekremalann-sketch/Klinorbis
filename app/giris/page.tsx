import Link from "next/link";
import { chatGPTSignInPath } from "../chatgpt-auth-paths";
import { privateMeta } from "../../lib/seo";
import "./giris.css";

export const metadata = { ...privateMeta, title: "Giriş | KLINORBIS" };

// Giriş ekranı: hastane operasyonunu anlatan sakin bir karşılama ve tek giriş düğmesi.
// Kimlik doğrulama değişmedi; düğme mevcut ChatGPT oturum akışına gider.
export default function SignIn() {
  return <main className="kg">
    <section className="kg-side" aria-label="Klinorbis">
      <Link href="/" className="kg-brand"><span>K</span>KLINORBIS</Link>
      <h1>Yatak, temizlik ve taşıma<br/>tek ekranda.</h1>
      <p>Boşalan yatağı daha hızlı hazırlayın; her işin kimde olduğunu herkes aynı anda görsün.</p>
      <ul className="kg-flow" aria-label="Akış">
        <li><span aria-hidden="true">🛏️</span><b>Yatak</b><small>Hazır · dolu · rezerve</small></li>
        <li><span aria-hidden="true">🧽</span><b>Temizlik</b><small>Sıra ve kontrol</small></li>
        <li><span aria-hidden="true">🚑</span><b>Taşıma</b><small>Kabul ve teslim</small></li>
        <li><span aria-hidden="true">🔄</span><b>Devir</b><small>Sahipsiz iş yok</small></li>
      </ul>
      <p className="kg-note">Klinik karar üretmez, tıbbi cihaz değildir. Demo yalnız kurgusal kayıtlarla çalışır.</p>
    </section>
    <section className="kg-main" aria-labelledby="kg-title">
      <div className="kg-card">
        <span className="kg-kicker">Yetkili çalışma alanı</span>
        <h2 id="kg-title">Giriş yapın</h2>
        <p>Kurumunuzun size tanımladığı hesapla giriş yapın. Rolünüze göre kendi ekranınız açılır.</p>
        <a className="kg-btn" href={chatGPTSignInPath("/workspace")} target="_top">Hesabınızla giriş yapın →</a>
        <div className="kg-or"><span>ya da</span></div>
        <Link className="kg-ghost" href="/demo">Kurgusal hastaneyi deneyin</Link>
        <small>Hesabınıza rol atanmamışsa kurumunuzdaki operasyon yöneticisine başvurun.</small>
      </div>
    </section>
  </main>;
}
