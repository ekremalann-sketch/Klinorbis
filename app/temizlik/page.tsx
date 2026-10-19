import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import Coordination from '../hbys/coordination';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/temizlik');return <Coordination initialTab="jobs" title="Temizlik kuyruğu" cleaningOnly={true}/>;}
