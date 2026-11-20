import { SiteFooter, SiteHeader } from "../site-chrome";
import { pageMeta } from "../../lib/seo";
import InquiryForm from "./inquiry-form";
import "../home-hastane.css";

export const metadata = pageMeta({ title: "Kurumsal görüşme | KLINORBIS Hastane Otomasyon Sistemi", description: "Hastaneniz için Klinorbis kurulum planı ve kurumsal görüşme talebi.", path: "/kurumsal-basvuru" });

export default function Page() {
  return <main className="marketing-shell kh">
    <SiteHeader />
    <section className="kh-sec" aria-labelledby="kb-title">
      <span className="kh-kicker">Kurumsal görüşme</span>
      <h1 id="kb-title">Hastaneniz için kurulum planı</h1>
      <p className="kh-muted">Kurumunuzu ve ihtiyacınızı kısaca yazın. Birimlerinize, başvuru türlerinize ve hedef sürelerinize göre devreye alma planını birlikte hazırlayalım. Bu formda hasta bilgisi paylaşmayın.</p>
      <InquiryForm />
    </section>
    <SiteFooter />
  </main>;
}
