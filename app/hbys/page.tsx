import {requireChatGPTUser} from '../chatgpt-auth';
import {privateMeta} from '../../lib/seo';
import Coordination from './coordination';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/hbys');return <Coordination/>;}
