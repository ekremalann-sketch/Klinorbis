import { sql, type SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { getDb } from '../db';
import { automationStopped } from './automation-policy';
import { advanceSimulation, newSimulation, simulationMetrics, validateSimSettings, SIM_LABEL, type SimState } from './virtual-hospital';
import { SecurityError, type RequestActor } from './security';
type Db=ReturnType<typeof getDb>;
async function batchSQL(db:Db,queries:SQL[]){
 const dialect=new SQLiteSyncDialect();
 return db.$client.batch(queries.map(query=>{const built=dialect.sqlToQuery(query);return db.$client.prepare(built.sql).bind(...built.params);}));
}
// Dedicated tables: never insert simulated records into tickets, tasks, beds,
// approvals, integration_events or the live audit/report stream.
async function tables(db:Db){
 await db.run(sql`CREATE TABLE IF NOT EXISTS sim_hospital_state (id TEXT PRIMARY KEY CHECK(id='sim'), version INTEGER NOT NULL, payload TEXT NOT NULL)`);
 await db.run(sql`CREATE TABLE IF NOT EXISTS sim_hospital_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, sim INTEGER NOT NULL DEFAULT 1 CHECK(sim=1), action TEXT NOT NULL, actor TEXT NOT NULL, run_id TEXT NOT NULL, recorded_at TEXT NOT NULL)`);
}
export function requireSimulationManager(actor:RequestActor){if(actor.role!=='operations_manager')throw new SecurityError(403,'Sanal hastaneyi yalnız operasyon yöneticisi kullanabilir.','SIM_MANAGER_REQUIRED');}
async function row(db:Db){return db.get<{version:number;payload:string}>(sql`SELECT version,payload FROM sim_hospital_state WHERE id='sim'`);}
export async function getVirtualHospital(db:Db){
 await tables(db);const r=await row(db);const state=r?JSON.parse(r.payload) as SimState:null;
 const audit=await db.all<{action:string;actor:string;run_id:string;recorded_at:string}>(sql`SELECT action,actor,run_id,recorded_at FROM sim_hospital_audit ORDER BY id DESC LIMIT 40`);
 return {label:SIM_LABEL,state,metrics:state?simulationMetrics(state):null,audit,emergencyStopped:await automationStopped(db)};
}
export async function controlVirtualHospital(db:Db,actor:RequestActor,action:string,settings?:unknown,now=Date.now()){
 requireSimulationManager(actor);await tables(db);
 if(!['start','stop','clear'].includes(action))throw new SecurityError(400,'Simülasyon işlemi geçersiz.','SIM_ACTION_INVALID');
 const current=await row(db);const previous=current?JSON.parse(current.payload) as SimState:null;
 if(action==='stop'&&!previous)throw new SecurityError(409,'Durdurulacak simülasyon yok.','SIM_NOT_RUNNING');
 if(action==='start'&&await automationStopped(db))throw new SecurityError(409,'Acil durdurma etkin. Önce otomasyon kontrolünden durdurmayı kaldırın.','AUTOMATION_PAUSED');
 if(action==='start'&&previous?.status==='running')throw new SecurityError(409,'Simülasyon zaten çalışıyor.','SIM_ALREADY_RUNNING');
 if(action==='start'&&previous)throw new SecurityError(409,'Önce önceki simülasyonu temizleyin; raporunu indirebilirsiniz.','SIM_CLEAR_REQUIRED');
 let state=previous;
 if(action==='start')state=newSimulation(validateSimSettings(settings),now);
 if(action==='stop'&&state){state.status='stopped';state.lastWall=now;state.log.push({at:state.cursor,text:'Operasyon yöneticisi simülasyonu durdurdu.'});}
 // State mutation and audit append commit together; CAS prevents an older tick
 // from resurrecting a cleared or stopped run.
 const version=(current?.version??0)+1;
 const mutation=action==='clear'?sql`DELETE FROM sim_hospital_state WHERE id='sim' AND version=${current?.version??-1}`:current?
  sql`UPDATE sim_hospital_state SET payload=${JSON.stringify(state)},version=${version} WHERE id='sim' AND version=${current.version}`:
  sql`INSERT INTO sim_hospital_state(id,version,payload) VALUES('sim',${version},${JSON.stringify(state)})`;
 // Duplicate concurrent writes fail closed before an audit row is appended.
 const guard=sql`INSERT INTO sim_hospital_audit(action,actor,run_id,recorded_at) SELECT ${action},'Operasyon yöneticisi',${state?.id??'SIM-EMPTY'},${new Date(now).toISOString()} WHERE changes()=1`;
 await batchSQL(db,[mutation,guard]);
 return getVirtualHospital(db);
}
export async function tickVirtualHospital(db:Db,now=Date.now(),manualMinutes?:number){
 await tables(db);const r=await row(db);if(!r)return {advanced:false};
 const state=JSON.parse(r.payload) as SimState;if(state.status!=='running')return {advanced:false};
 if(await automationStopped(db)){
  state.status='stopped';state.lastWall=now;state.log.push({at:state.cursor,text:'Mevcut acil durdurma anahtarı simülasyonu durdurdu.'});
  await batchSQL(db,[sql`UPDATE sim_hospital_state SET payload=${JSON.stringify(state)},version=version+1 WHERE id='sim' AND version=${r.version} AND json_extract(payload,'$.id')=${state.id}`,sql`INSERT INTO sim_hospital_audit(action,actor,run_id,recorded_at) SELECT 'emergency-stop','Sistem',${state.id},${new Date(now).toISOString()} WHERE changes()=1`]);
  return {advanced:false,paused:true};
 }
 const due=manualMinutes??Math.floor(Math.max(0,now-state.lastWall)*state.settings.speed/60000);
 const minutes=Math.min(240,Math.max(0,Math.floor(due)));if(!minutes)return {advanced:false};
 const next=advanceSimulation(state,minutes);
 next.lastWall=manualMinutes===undefined?state.lastWall+minutes*60000/state.settings.speed:now;
 const result=await db.run(sql`UPDATE sim_hospital_state SET payload=${JSON.stringify(next)},version=version+1 WHERE id='sim' AND version=${r.version} AND json_extract(payload,'$.id')=${state.id} AND NOT EXISTS(SELECT 1 FROM integration_events WHERE event_id='automation:control' AND status='paused')`);
 return {advanced:result.meta.changes===1};
}
