import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { sha256,type RequestActor } from "./security";
const ready=new WeakMap<object,Promise<unknown>>();
export async function recordRead(actor:RequestActor,resource:string) {
 const db=getDb();
 const binding=(globalThis as typeof globalThis & {__KLINORBIS_DB?:object}).__KLINORBIS_DB!;
 if(!ready.has(binding))ready.set(binding,db.run(sql`CREATE TABLE IF NOT EXISTS read_audits (audit_key TEXT PRIMARY KEY, actor TEXT NOT NULL, role TEXT NOT NULL, unit_scope TEXT NOT NULL, resource TEXT NOT NULL, hour TEXT NOT NULL)`).catch(error=>{ready.delete(binding);throw error;}));
 await ready.get(binding);
 const hour=new Date().toISOString().slice(0,13),scope=actor.unitCodes.slice().sort().join(",");
 const key=await sha256(JSON.stringify([actor.email,actor.role,scope,resource,hour]));
 await db.run(sql`INSERT OR IGNORE INTO read_audits(audit_key,actor,role,unit_scope,resource,hour) VALUES(${key},${actor.email},${actor.role},${scope},${resource},${hour})`);
}
