import DataGovernance from "./client";
import "./governance.css";
export const dynamic="force-dynamic";
import {requireChatGPTUser} from "../chatgpt-auth";
export default async function Page(){await requireChatGPTUser("/data-governance");return <DataGovernance/>;}
