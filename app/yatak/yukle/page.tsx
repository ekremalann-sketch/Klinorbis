import {requireChatGPTUser} from '../../chatgpt-auth';
import {privateMeta} from '../../../lib/seo';
import ImportForm from './import-form';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/yatak/yukle');return <ImportForm/>;}
