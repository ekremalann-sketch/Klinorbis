import { requireChatGPTUser } from "../chatgpt-auth";
import Dashboard from "../dashboard";
import { privateMeta } from "../../lib/seo";
export const metadata=privateMeta;
export const dynamic="force-dynamic";
export default async function Page(){await requireChatGPTUser("/merkez");return <Dashboard initialView="dashboard"/>;}
