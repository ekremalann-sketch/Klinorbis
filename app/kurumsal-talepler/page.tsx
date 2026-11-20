import { requireChatGPTUser } from "../chatgpt-auth";
import { privateMeta } from "../../lib/seo";
import Inquiries from "./inquiries";
export const dynamic = "force-dynamic";
export const metadata = privateMeta;
export default async function Page() { await requireChatGPTUser("/kurumsal-talepler"); return <Inquiries />; }
