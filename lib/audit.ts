import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { auditLogs } from "../db/schema";

function canonical(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export async function appendAudit(db:ReturnType<typeof import("../db").getDb>,entry:{actor?:string;action:string;resource:string;result?:string;detail?:string}){
 const [last]=await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
 const previousHash=last?.currentHash||"GENESIS";
 const body={actor:entry.actor||"system",action:entry.action,resource:entry.resource,result:entry.result||"success",detail:entry.detail||null,previousHash};
 const currentHash=createHash("sha256").update(canonical(body)).digest("hex");
 await db.insert(auditLogs).values({...body,previousHash,currentHash});
}
