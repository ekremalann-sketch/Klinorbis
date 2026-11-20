import { requireChatGPTUser } from "../chatgpt-auth";
import { privateMeta } from "../../lib/seo";
import Journeys from "./journeys";
export const dynamic = "force-dynamic";
export const metadata = privateMeta;
export default async function Page() { await requireChatGPTUser("/hasta-surecleri"); return <Journeys />; }
