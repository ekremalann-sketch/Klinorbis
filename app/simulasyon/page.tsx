import { requireChatGPTUser } from '../chatgpt-auth';
import { privateMeta } from '../../lib/seo';
import VirtualHospital from './virtual-hospital';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/simulasyon');return <VirtualHospital/>;}
