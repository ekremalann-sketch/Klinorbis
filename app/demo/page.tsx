import PublicDemo from "./public-demo";
import { pageMeta } from "../../lib/seo";
export const metadata=pageMeta({title:"KLINORBIS Demo | Hastane Operasyon Kontrol Kulesi",description:"Kimliksiz ve sabit sentetik örnek verilerle çalışan Klinorbis operasyon demosu; gerçek hasta verisi içermez.",path:"/demo"});
export default function DemoPage(){return <PublicDemo/>}
