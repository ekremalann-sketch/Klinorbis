import Link from "next/link";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { privateMeta } from "../../lib/seo";
import { ROLE_MAP } from "../../lib/role-map";
import { requireActor, SecurityError } from "../../lib/security";
export const dynamic = "force-dynamic";
export const metadata = privateMeta;
export default async function WorkspaceEntry() {
  const user = await requireChatGPTUser("/workspace");
  // Rolü tanımlı kullanıcı ara sayfa görmeden kendi ana ekranına gider (çağrı görevlisi → Çağrılar,
  // klinik rol → Onaylar, yönetici → Merkez …). Rol atanmamışsa korumalı ekranlara bağlantı verilmez
  // (aksi hâlde kullanıcı 403 → giriş → /workspace döngüsüne girer).
  let home: string | null = null;
  let problem: "norole" | "unavailable" = "unavailable";
  try {
    const actor = await requireActor(new Request("https://klinorbis.local/workspace", { headers: await headers() }));
    home = ROLE_MAP[actor.role]?.homePath ?? "/merkez";
  } catch (error) {
    home = null;
    if (error instanceof SecurityError && error.status === 403) problem = "norole";
  }
  if (home) redirect(home);
  return <main className="workspace-entry"><Link href="/" className="workspace-brand">KLINORBIS</Link><span className="kicker">YETKİLİ ÇALIŞMA ALANI</span>
    {problem === "norole"
      ? <><h1>Hesabınıza rol atanmamış</h1><p>Oturum: {user.displayName}. Oturumunuz açık, ancak bu hesaba henüz KLINORBIS rolü veya birimi atanmadı. Tekrar giriş yapmak bu durumu değiştirmez.</p><aside><b>Ne yapmalıyım?</b><ol><li>Kurumunuzdaki operasyon yöneticisinden “Personel ve yetkiler” ekranında hesabınıza rol ve birim atamasını isteyin.</li><li>Atama yapıldıktan sonra bu sayfayı yenileyin; kendi ana ekranınıza yönlendirilirsiniz.</li><li>Yanlış hesapla girdiyseniz çıkış yapıp doğru hesapla tekrar giriş yapın.</li></ol></aside></>
      : <><h1>Çalışma alanı şu anda açılamadı</h1><p>Oturum: {user.displayName}. Yetki bilgisi sunucudan okunamadı. Birkaç saniye sonra sayfayı yenileyin; sorun sürerse sistem yöneticisine bildirin.</p></>}
    {/* Çıkış üst belge gezintisi olmalı; istemci yönlendiricisi kullanılmaz. */}
    <p><a href={chatGPTSignOutPath("/")} target="_top">Çıkış yap / hesap değiştir</a> · <Link href="/workspace">Sayfayı yenile</Link> · <Link href="/">Ana sayfa</Link></p>
  </main>;
}
