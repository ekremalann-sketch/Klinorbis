import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import PhoneWork from './phone-work';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
// K4: telefonda tek düğmeli temizlik ekranı. Ayrıntılı kuyruk tablosu /hbys altında kalır.
export default async function Page(){await requireChatGPTUser('/temizlik');return <PhoneWork kind="cleaning" title="Temizlik işlerim"/>;}
