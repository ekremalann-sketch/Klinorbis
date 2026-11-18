import Link from "next/link";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { pageMeta } from "../../lib/seo";

// Çözüm Mimarı K2: "Kullanım amacı ve sınırlar". Metin bilgilendirme amaçlıdır; yayın öncesi kurumun hukuk birimi onaylamalıdır.
export const metadata = pageMeta({ title: "Kullanım amacı ve sınırlar", description: "Klinorbis hastane operasyonlarını (yatak, temizlik, taşıma, birimler arası talep) koordine eder; tanı, tedavi veya hasta önceliklendirmesi yapmaz.", path: "/kullanim-amaci" });

export default function Page() {
  return <div className="marketing-shell page-shell"><SiteHeader /><main className="privacy-public-page">
    <span>Son güncelleme: 18 Kasım 2026</span>
    <h1>Kullanım amacı ve sınırlar</h1>
    <h2>Ne için kullanılır</h2>
    <p>Klinorbis, hastanenin operasyon işlerini koordine eden bir yazılımdır: yatak durumu ve temizlik, hasta taşıma işleri, birimler arası talepler, iş kuyrukları, süre takibi ve gecikme bildirimleri. Amacı, işin doğru birime gitmesini, kimde olduğunun görünmesini ve geciktiğinde sorumlusuna haber verilmesini sağlamaktır.</p>
    <h2>Ne için kullanılmaz</h2>
    <ul>
      <li>Tanı koymaz, tedavi veya ilaç önermez, hasta önceliklendirmesi ya da klinik risk puanı üretmez.</li>
      <li>Hekim, hemşire veya diğer sağlık profesyonelinin klinik kararının yerine geçmez; klinik kararlar hastane bilgi yönetim sisteminde (HBYS) ve yetkili sağlık profesyonelinde kalır.</li>
      <li>Tahlil, görüntüleme, kan ürünü veya ilaç istemi oluşturmaz.</li>
      <li>Bir HBYS’ye bağlı olduğu açıkça yazmıyorsa, ekrandaki veriler HBYS’den gelmez; bağlıymış gibi gösterilmez.</li>
    </ul>
    <h2>Tıbbi cihaz durumu</h2>
    <p>Klinorbis tıbbi cihaz olarak tasarlanmamış ve tıbbi cihaz olarak piyasaya sunulmamıştır. Yazılım; tanı, tedavi, izleme veya hastalık önleme amacıyla bilgi üretmez. Kurum yazılımı bu sınırların dışında kullanmamalıdır. Bu değerlendirme bilgilendirme amaçlıdır; kurumun hukuk ve kalite birimleri kendi kullanım şeklini ayrıca değerlendirmelidir.</p>
    <h2>Demo ve veriler</h2>
    <p>Demo ve eğitim ekranları yalnız kurgusal (sentetik) veri içerir. Gerçek hasta verisi demo ortamına girilmemelidir.</p>
    <h2>Süre hedefleri ve uyarılar</h2>
    <p>Ekrandaki süre hedefleri ve gecikme bildirimleri operasyon içindir (örneğin temizliğin ne kadar sürdüğü); hastanın klinik durumuna dair bir değerlendirme değildir. Hedef süreleri kurum belirler ve onaylar.</p>
    <nav aria-label="İlgili sayfalar"><Link href="/hakkimizda">Hakkımızda ve ilkeler</Link> · <Link href="/gizlilik">Gizlilik</Link> · <Link href="/aydinlatma">Aydınlatma</Link></nav>
  </main><SiteFooter /></div>;
}
