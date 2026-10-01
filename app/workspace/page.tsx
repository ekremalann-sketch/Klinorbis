import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { privateMeta } from "../../lib/seo";
export const dynamic = "force-dynamic";
export const metadata = privateMeta;
export default async function WorkspaceEntry() {
  const user = await requireChatGPTUser("/workspace");
  return <main className="workspace-entry"><Link href="/" className="workspace-brand">KLINORBIS</Link><span className="kicker">YETKİLİ ÇALIŞMA ALANI</span><h1>Talebi alın, sorumlu birime yönlendirin.</h1><p>Oturum: {user.displayName}. Bu alandaki işlemler kaydedilir; yalnız hesabınıza atanmış rol ve birimler kapsamında çalışabilirsiniz.</p><div className="workspace-entry-grid"><Link href="/inbox"><b>Gelen işler</b><span>Talebi açın; üstlenin, işleme alın veya başka birime aktarın.</span></Link><Link href="/requests"><b>Talepler ve yönlendirme</b><span>Talep oluşturun, hedef birimi seçin ve işlem geçmişini izleyin.</span></Link><Link href="/capacity"><b>Kapasite ve transfer</b><span>Birim kaynaklarını ve operasyonel transfer durumunu inceleyin.</span></Link><Link href="/staff"><b>Personel ve yetkiler</b><span>Yönetici, personelin birim ve rol atamalarını yönetir.</span></Link></div><aside><b>Nasıl yönlendirilir?</b><ol><li>Gelen işler veya Talepler ekranından açık bir talebi seçin.</li><li>Talep ayrıntısındaki “Başka birime aktar” alanında hedef birimi seçin.</li><li>“Aktar” düğmesine basın; sonuç mesajını ve işlem geçmişini kontrol edin.</li></ol><p>Gözetim rolleri yalnız izler. Sonuçlandırılmış talepler yeniden işlenmez. Gerçek hasta bilgisi girmeyin.</p></aside><Link href="/demo">Sentetik ürün demosuna dön</Link></main>;
}
