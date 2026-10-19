import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import Coordination from '../hbys/coordination';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/entegrasyon');return <Coordination key="entegrasyon" initialTab="bridge" title="Entegrasyon merkezi" cleaningOnly={false}/>;}
