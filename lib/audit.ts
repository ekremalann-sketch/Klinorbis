import { createHmac } from "node:crypto";
import { desc,sql } from "drizzle-orm";
import { auditLogs } from "../db/schema";

function canonical(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export function auditHeadConflict(error:unknown){for(let i=0;i<6&&error;i++){if(String(error instanceof Error?error.message:error).includes("AUDIT_HEAD_CHANGED"))return true;error=typeof error==="object"&&error!==null&&"cause" in error?(error as {cause?:unknown}).cause:null;}return false;}
const guarded=new WeakMap<object,Promise<unknown>>();
async function guard(db:ReturnType<typeof import("../db").getDb>){
 const binding=(globalThis as typeof globalThis & {__KLINORBIS_DB?:object}).__KLINORBIS_DB!;
 if(!guarded.has(binding))guarded.set(binding,db.run(sql`CREATE TRIGGER IF NOT EXISTS audit_serial_head BEFORE INSERT ON audit_logs WHEN NEW.previous_hash != COALESCE((SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1),'GENESIS') BEGIN SELECT RAISE(ABORT,'AUDIT_HEAD_CHANGED'); END`).catch(e=>{guarded.delete(binding);throw e;}));
 await guarded.get(binding);
}
function keyedHash(body:unknown){
 const secret=(globalThis as typeof globalThis & {__KLINORBIS_SECURITY_ENV?:{auditHmacKey?:string}}).__KLINORBIS_SECURITY_ENV?.auditHmacKey;
 if(!secret||secret.length<32)throw new Error("Audit integrity key unavailable");
 return "hmac-v2:"+createHmac("sha256",secret).update(canonical(body)).digest("hex");
}
export async function appendAudit(db:ReturnType<typeof import("../db").getDb>,entry:{actor?:string;action:string;resource:string;result?:string;detail?:string}){
 await guard(db);
 for(let attempt=0;attempt<12;attempt++){
  const [last]=await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  const body={actor:entry.actor||"system",action:entry.action,resource:entry.resource,result:entry.result||"success",detail:entry.detail||null,previousHash:last?.currentHash||"GENESIS"};
  try{await db.insert(auditLogs).values({...body,currentHash:keyedHash(body)});return;}catch(e){if(!auditHeadConflict(e))throw e;}
 }
 throw new Error("Audit head contention; retry transaction");
}

type AuditEntry={actor?:string;action:string;resource:string;result?:string;detail?:string};
/** Denetim izini ana işlemle aynı batch içinde yazmak için hazır INSERT ifadeleri üretir (hash zinciri sırayla hesaplanır). */
export async function auditStatements(db:ReturnType<typeof import("../db").getDb>,entries:AuditEntry[]){
 await guard(db);
 const [last]=await db.select({currentHash:auditLogs.currentHash}).from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
 let previousHash=last?.currentHash||"GENESIS";
 return entries.map((entry)=>{
  const body={actor:entry.actor||"system",action:entry.action,resource:entry.resource,result:entry.result||"success",detail:entry.detail||null,previousHash};
  const currentHash=keyedHash(body);
  previousHash=currentHash;
  return db.insert(auditLogs).values({...body,currentHash});
 });
}
