"use client";
import Link from "next/link";
import SalesSandbox from "./sales-sandbox";
export default function PublicDemo(){return <main className="demo-shell demo-v2">
 <header className="demo-compact-header"><Link className="demo-brand" href="/"><span>K</span><b>KLINORBIS</b></Link><div><Link href="/en/demo" hrefLang="en" aria-label="English demo">EN</Link><details><summary>Menü</summary><nav aria-label="Demo bağlantıları"><Link href="/">Ürün sayfasına dön</Link><Link href="/workspace">Yetkili personel girişi</Link></nav></details></div></header>
 <section className="demo-main"><header className="demo-intro"><h1>Operasyon turunu deneyin</h1><p>Kurgusal verilerle talep oluşturun, aktarın ve tamamlayın. Gerçek hasta verisi kullanılmaz.</p><Link href="/workspace">Yetkili personel girişi →</Link></header><SalesSandbox/><footer className="demo-footer">KLINORBIS ürün demosu · Veriler yalnızca ürün davranışını göstermek için üretilmiştir.</footer></section>
 </main>}
