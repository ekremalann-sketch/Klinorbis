import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import Coordination from '../hbys/coordination';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/yatak');return <Coordination key="yatak" initialTab="beds" title="Yatak panosu" cleaningOnly={false}/>;}
