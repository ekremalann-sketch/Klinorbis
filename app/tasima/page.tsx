import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import PhoneWork from '../temizlik/phone-work';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
// K4: telefonda tek düğmeli taşıma ekranı: İşi al → Hastayı aldım → Teslim ettim.
export default async function Page(){await requireChatGPTUser('/tasima');return <PhoneWork kind="transport" title="Taşıma işlerim"/>;}
