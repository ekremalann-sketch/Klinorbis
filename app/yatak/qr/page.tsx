import {requireChatGPTUser} from '../../chatgpt-auth';
import {privateMeta} from '../../../lib/seo';
import QrLabels from './qr-labels';
export const dynamic='force-dynamic';
export const metadata=privateMeta;
export default async function Page(){await requireChatGPTUser('/yatak/qr');return <QrLabels/>;}
