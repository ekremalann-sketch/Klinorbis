import { SecurityError, type RequestActor } from './security';
import { sha256 } from './security';
import { automationStopped } from './automation-policy';
import { getDb } from '../db';
export const TRANSPORT_HOLD_MS = 30 * 60_000;
// Yatak ayrılı kalan transport durumları. 'offered': hedef birimin kararı bekleniyor.
// 'declined': hedef birim gerekçeyle reddetti; ayırma kalktı, talep yeni hedefle tekrar teklif edilir veya iptal edilir.
const HOLD_STATUSES = ['offered','queued','accepted'];
// Hedef birim kararı: operasyon yöneticisi veya hedef yatağın birim yöneticisi isterse kabul kendiliğinden kaydedilir.
const targetAuthority = (actor: RequestActor, targetUnit: string) => admin(actor) || (actor.role === 'unit_manager' && actor.unitCodes.includes(targetUnit));
function decision(tenant: string, job: string, round: number, kind: string, target: string, actor: RequestActor, reason: string | null, at: number) {
 return q('INSERT INTO simops_transfer_decisions(tenant,job,round,decision,target,actor,reason,at) VALUES(?,?,?,?,?,?,?,?)', tenant, job, round, kind, target, actor.email, reason, at);
}
export const COORD_LABEL='SİMÜLASYON · Kurgusal hastane · Rakamlar varsayımlara dayanır, gerçek pilot sonucu değildir.';
export type Bed={tenant:string;id:string;campus:string;building:string;floor:string;unit:string;room:string;physical:string;hbys:string;cleaning:string;technical:number;staffed:number;review:number;source_version:number;observed_at:number|null;version:number;state_since?:number|null};
export type Job={tenant:string;id:string;kind:string;bed:string;target:string|null;unit:string;status:string;owner:string|null;authority:string;patient:string|null;reason:string;version:number;created_at:number;updated_at:number};
type Message={tenant:string;id:string;bed:string;kind:string;source_version:number;observed_at:number;authority:string;hash:string;status:string;code:string|null;task:string|null;attempts:number;received_at:number};
type Incoming={id:string;bed:string;kind:'discharge.recorded'|'departure.confirmed'|'occupancy.confirmed'|'cancel'|'correction';sourceVersion:number;observedAt:number;authority:string;synthetic:true};
const db=()=>{const d=(globalThis as typeof globalThis&{__KLINORBIS_DB?:D1Database}).__KLINORBIS_DB;if(!d)throw new SecurityError(503,'Veritabanı kullanılamıyor.','DATABASE_UNAVAILABLE');return d;};
const q=(sql:string,...args:unknown[])=>db().prepare(sql).bind(...args);
async function rows<T>(sql:string,...args:unknown[]){return (await q(sql,...args).all<T>()).results;}
function fail(code:string,msg:string,status=409):never{throw new SecurityError(status,msg,code);}
const admin=(actor:RequestActor)=>actor.role==='operations_manager';
export async function coordScope(actor:RequestActor,tenant:string){
 if(!['SIM-KURUM-A','SIM-KURUM-B'].includes(tenant))fail('TENANT_INVALID','Kurum bulunamadı.',404);
 if(!await q('SELECT 1 AS ok FROM simops_members WHERE tenant=? AND email=?',tenant,actor.email).first())fail('TENANT_DENIED','Bu sentetik kurum için yetkiniz yok.',403);
}
async function writable(){if(await automationStopped(getDb()))fail('AUTOMATION_PAUSED','Acil durdurma etkin.');}
function log(tenant:string,actor:RequestActor,action:string,resource:string){return q('INSERT INTO simops_log(tenant,actor,action,resource,at) VALUES(?,?,?,?,?)',tenant,actor.email,action,resource,Date.now());}
// A failed version assertion aborts the same D1 transaction, including every later side effect.
function guard(sql:string,args:unknown[]){const id=crypto.randomUUID();return [q('INSERT INTO simops_guard(id,ok) SELECT ?,CASE WHEN EXISTS ('+sql+') THEN 1 ELSE 0 END',id,...args),q('DELETE FROM simops_guard WHERE id=?',id)];}
async function batch(statements:D1PreparedStatement[]){try{return await db().batch(statements);}catch(e){const text=String(e)+' '+String((e as {cause?:unknown}).cause??'');if(/constraint|UNIQUE|CHECK/i.test(text))fail('CONFLICT','Kayıt değişti veya aynı yatak/iş başka işlemde. Yenileyip tekrar deneyin.');throw e;}}
// K6: hazır yatak zamanla kendiliğinden düşmez. Hazırlık yalnız yeni bir olayla (dolu, iptal, düzeltme, engel) bozulur.
export function bedReady(b:Bed,now=Date.now()){return b.physical==='departed'&&b.hbys==='vacant'&&b.cleaning==='ready'&&!!b.technical&&!!b.staffed&&!b.review&&!!b.observed_at&&b.observed_at<=now+60000;}
export async function initCoord(actor:RequestActor){
 if(!admin(actor))fail('MANAGER_REQUIRED','Kurulumu operasyon yöneticisi yapar.',403);await writable();
 const tenant='SIM-KURUM-A',statements=[q('INSERT OR IGNORE INTO simops_members(tenant,email) VALUES(?,?)',tenant,actor.email)];
 for(let i=1;i<=8;i++)statements.push(q('INSERT OR IGNORE INTO simops_beds(tenant,id,campus,building,floor,unit,room) VALUES(?,?,?,?,?,?,?)',tenant,`YTK-SIM-${String(i).padStart(3,'0')}`,i<=4?'Örnek Kampüs A':'Örnek Kampüs B','Örnek Bina 1','Kat 1','YTK',`ODA-SIM-${i}`));
 for(const unit of ['CTM','ULS','YTK'])statements.push(q('INSERT OR IGNORE INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES(?,?,?,?,?,1)',tenant,actor.email,unit,Date.now(),Date.now()+8*3600000));
 statements.push(log(tenant,actor,'simulation.init','hospital'));await batch(statements);return {tenant};
}
export async function coordView(actor:RequestActor,tenant:string){
 const membership=await q('SELECT 1 AS ok FROM simops_members WHERE tenant=? AND email=?',tenant,actor.email).first();
 if(!membership){if(tenant==='SIM-KURUM-A'&&admin(actor))return {initialized:false,label:COORD_LABEL,realConnection:'Kapalı',beds:[],jobs:[],messages:[],audit:[],canManage:true};await coordScope(actor,tenant);}
 await coordScope(actor,tenant);
 const beds=await rows<Bed>('SELECT * FROM simops_beds WHERE tenant=? ORDER BY id',tenant);
 const unitCodes = actor.unitCodes;
 const scope = admin(actor) ? '' : ' AND unit IN (' + (unitCodes.map(() => '?').join(',') || 'NULL') + ')';
 const bindings = admin(actor) ? [tenant] : [tenant, ...unitCodes];
 const open = await rows<Job>("SELECT * FROM simops_jobs WHERE tenant=?" + scope + " AND status NOT IN ('done','cancelled') ORDER BY created_at DESC, id", ...bindings);
 const closed = await rows<Job>("SELECT * FROM simops_jobs WHERE tenant=?" + scope + " AND status IN ('done','cancelled') ORDER BY created_at DESC, id LIMIT 200", ...bindings);
 // Hedef birim, kendisine teklif edilen transferi görür (taşıma birimi üyesi olmasa da).
 const offers = admin(actor) || !unitCodes.length ? [] : await rows<Job>("SELECT j.* FROM simops_jobs j JOIN simops_beds b ON b.tenant=j.tenant AND b.id=j.target WHERE j.tenant=? AND j.kind='transport' AND j.status='offered' AND b.unit IN (" + unitCodes.map(() => '?').join(',') + ")", tenant, ...unitCodes);
 for (const offer of offers) if (!open.some(job => job.id === offer.id)) open.push(offer);
 const visibleTransfers = open.filter(job => job.kind === 'transport').map(job => job.id);
 const transferDecisions = visibleTransfers.length ? await rows<{job:string;round:number;decision:string;target:string;reason:string|null;at:number}>("SELECT job,round,decision,target,reason,at FROM simops_transfer_decisions WHERE tenant=? AND job IN (" + visibleTransfers.map(() => '?').join(',') + ") ORDER BY job,round,at", tenant, ...visibleTransfers) : [];
 const now = Date.now();
 const jobs = [...open, ...closed].map(job =>
  job.kind==='transport' && HOLD_STATUSES.includes(job.status) && job.created_at<=now-TRANSPORT_HOLD_MS
   ? {...job,status:'expired',reason:'Yatak ayırma süresi doldu'}
   : job
 );
 const messages=admin(actor)?await rows<Message>('SELECT * FROM simops_messages WHERE tenant=? ORDER BY received_at DESC LIMIT 100',tenant):[];
 const reservations=await rows<{bed:string;job:string}>("SELECT r.bed,r.job FROM simops_reservations r JOIN simops_jobs j ON j.tenant=r.tenant AND j.id=r.job WHERE r.tenant=? AND (j.status='active' OR (j.status IN ('offered','queued','accepted') AND j.created_at>?))",tenant,Date.now()-TRANSPORT_HOLD_MS);
 const last=messages.filter(m=>m.status==='processed').reduce((a,m)=>Math.max(a,m.observed_at),0);
 return {initialized:true,label:COORD_LABEL,realConnection:'Kapalı',source:'Sentetik HBYS simülatörü; gerçek üretici bağlantısı yok',canManage:admin(actor),beds:beds.filter(b=>admin(actor)||actor.unitCodes.includes(b.unit)).map(b=>({...b,ready:bedReady(b)&&!reservations.some(r=>r.bed===b.id),stale:!b.observed_at,reserved:reservations.some(r=>r.bed===b.id)})),reservations,jobs,transferDecisions,duty:admin(actor)?await rows('SELECT email,unit,starts_at,ends_at,available FROM simops_duty WHERE tenant=?',tenant):[],messages,lastSuccessfulData:last||null,receivedCount:messages.length,quarantine:messages.filter(m=>m.status==='quarantine').length,review:messages.filter(m=>m.status==='review').length,audit:admin(actor)?await rows('SELECT action,resource,at FROM simops_log WHERE tenant=? ORDER BY id DESC LIMIT 100',tenant):[],serverNow:Date.now()};
}
export function validateIncoming(raw:unknown):Incoming{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('INVALID_EVENT','Olay nesne olmalıdır.',422);
 const b=raw as Record<string,unknown>,allowed=['id','bed','kind','sourceVersion','observedAt','authority','synthetic'];
 if(Object.keys(b).some(k=>!allowed.includes(k)))fail('FIELD_NOT_ALLOWED','İzin verilmeyen alan: ham HBYS veya kişisel veri kabul edilmez.',422);
 if(b.synthetic!==true)fail('REAL_DATA_DISABLED','Gerçek verili HBYS bağlantısı kapalı.',403);
 if(typeof b.id!=='string'||!/^SIM-EVT-[A-Z0-9-]{1,60}$/.test(b.id)||typeof b.bed!=='string'||!/^YTK-SIM-\d{3}$/.test(b.bed)||typeof b.authority!=='string'||!/^YTKL-SIM-[A-Z0-9-]{1,40}$/.test(b.authority))fail('SYNTHETIC_REQUIRED','Yalnız kurgusal olay, yatak ve yetki kodu kabul edilir.',422);
 if(!['discharge.recorded','departure.confirmed','occupancy.confirmed','cancel','correction'].includes(String(b.kind)))fail('UNKNOWN_EVENT','Olay eşlemesi bulunamadı.',422);
 if(!Number.isSafeInteger(b.sourceVersion)||Number(b.sourceVersion)<1||!Number.isSafeInteger(b.observedAt)||Number(b.observedAt)>Date.now()+60000||Number(b.observedAt)<Date.now()-30*86400000)fail('INVALID_SOURCE_TIME','Kaynak sürümü veya zamanı geçersiz.',422);
 return b as Incoming;
}
async function processMessage(actor:RequestActor,tenant:string,m:Message,retry=false){
 const b=await q('SELECT * FROM simops_beds WHERE tenant=? AND id=?',tenant,m.bed).first<Bed>();
 if(!b){await q("UPDATE simops_messages SET status='quarantine',code='BED_MAPPING_MISSING',attempts=attempts+? WHERE tenant=? AND id=?",retry?1:0,tenant,m.id).run();return {status:'quarantine',code:'BED_MAPPING_MISSING',id:m.id};}
 const g=guard('SELECT 1 FROM simops_messages WHERE tenant=? AND id=? AND status=? AND attempts=?',[tenant,m.id,m.status,m.attempts]);
 let status='processed',code='OK',task:string|null=null;const statements:D1PreparedStatement[]=[...g,...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?',[tenant,b.id,b.version])];
 if(m.source_version<=b.source_version){status='stale';code='OUT_OF_ORDER';}
 else if(m.observed_at<(b.observed_at??0)){status='review';code='SOURCE_TIME_REGRESSION';statements.push(q('UPDATE simops_beds SET review=1,version=version+1 WHERE tenant=? AND id=?',tenant,b.id));}
 else{
  const cancelled=m.kind==='cancel'||m.kind==='correction';
  if(cancelled){status='review';code='SOURCE_REVIEW_REQUIRED';task=`SIM-REV-${crypto.randomUUID().slice(0,8)}`;
   statements.push(q("UPDATE simops_beds SET review=1,source_version=?,observed_at=?,version=version+1 WHERE tenant=? AND id=?",m.source_version,m.observed_at,tenant,b.id));
   statements.push(q("INSERT INTO simops_jobs(tenant,id,kind,bed,unit,authority,reason,created_at,updated_at) VALUES(?,?,'review',?,'YTK',?,'SOURCE_CORRECTION',?,?)",tenant,task,b.id,m.authority,Date.now(),Date.now()));
  }else{
   const departure=m.kind==='departure.confirmed',occupied=m.kind==='occupancy.confirmed';
   statements.push(q('UPDATE simops_beds SET hbys=?,physical=?,cleaning=?,review=?,source_version=?,observed_at=?,version=version+1 WHERE tenant=? AND id=?',occupied?'occupied':departure?'vacant':b.hbys,departure?'departed':occupied?'occupied':b.physical,departure?'queued':occupied?'dirty':b.cleaning,b.review,m.source_version,m.observed_at,tenant,b.id));
   if(departure){const open=await q("SELECT id FROM simops_jobs WHERE tenant=? AND bed=? AND kind='cleaning' AND status NOT IN('done','cancelled')",tenant,b.id).first<{id:string}>();task=open?.id??`SIM-CLN-${crypto.randomUUID().slice(0,8)}`;
    if(!open)statements.push(q("INSERT INTO simops_jobs(tenant,id,kind,bed,unit,authority,created_at,updated_at) VALUES(?,?,'cleaning',?,'CTM',?,?,?)",tenant,task,b.id,m.authority,Date.now(),Date.now()));
   }
  }
 }
 statements.push(q('UPDATE simops_messages SET status=?,code=?,task=?,attempts=attempts+? WHERE tenant=? AND id=?',status,code,task,retry?1:0,tenant,m.id),log(tenant,actor,retry?'event.retry':'event.processed',m.id));await batch(statements);return {status,code,task,id:m.id};
}
export async function ingestCoord(actor:RequestActor,tenant:string,raw:unknown){await coordScope(actor,tenant);if(!admin(actor))fail('MANAGER_REQUIRED','Sentetik olayları operasyon yöneticisi başlatır.',403);await writable();const b=validateIncoming(raw),hash=await sha256(JSON.stringify([b.id,b.bed,b.kind,b.sourceVersion,b.observedAt,b.authority,b.synthetic]));
 const old=await q('SELECT * FROM simops_messages WHERE tenant=? AND id=?',tenant,b.id).first<Message>();
 if(old){if(old.hash!==hash)fail('EVENT_ID_REUSED','Aynı olay kimliği farklı içerikle kullanılamaz.');return {id:old.id,status:old.status,task:old.task,duplicate:true};}
 try{await q("INSERT INTO simops_messages(tenant,id,bed,kind,source_version,observed_at,authority,hash,status,received_at,code) VALUES(?,?,?,?,?,?,?,?,'quarantine',?,'PENDING')",tenant,b.id,b.bed,b.kind,b.sourceVersion,b.observedAt,b.authority,hash,Date.now()).run();}catch{fail('CONFLICT','Aynı olay işleniyor; yeniden deneyin.');}
 const m=await q('SELECT * FROM simops_messages WHERE tenant=? AND id=?',tenant,b.id).first<Message>();return processMessage(actor,tenant,m!);
}
/** K6: yatak panosundaki "Hasta ayrıldı" düğmesi. Birim personeli kendi biriminin dolu yatağında kullanır.
 * Aynı olay hattından (kurgusal "fiziksel ayrılış doğrulandı") geçer: yatak boşalır ve temizlik işi kendiliğinden açılır. */
export async function markDeparted(actor:RequestActor,tenant:string,bedId:string,version:number){await coordScope(actor,tenant);await writable();
 const b=await q('SELECT * FROM simops_beds WHERE tenant=? AND id=?',tenant,bedId).first<Bed>();if(!b)fail('NOT_FOUND','Yatak bulunamadı.',404);
 if(!admin(actor)&&!(['unit_manager','clinician','call_agent'].includes(actor.role)&&actor.unitCodes.includes(b!.unit)))fail('UNIT_REQUIRED','Bu yatağın birimindeki personel kullanabilir.',403);
 if(b!.version!==version)fail('CONFLICT','Yatak değişti; ekranı yenileyin.');
 if(b!.physical!=='occupied'&&b!.hbys!=='occupied')fail('NOT_OCCUPIED','Yatak dolu görünmüyor.',409);
 const id=`SIM-EVT-AYR-${crypto.randomUUID().slice(0,12).toUpperCase()}`,now=Date.now();
 const hash=await sha256(JSON.stringify([id,b!.id,'departure.confirmed',b!.source_version+1,now,'YTKL-SIM-PERSONEL',true]));
 await q("INSERT INTO simops_messages(tenant,id,bed,kind,source_version,observed_at,authority,hash,status,received_at,code) VALUES(?,?,?,'departure.confirmed',?,?,'YTKL-SIM-PERSONEL',?,'quarantine',?,'PENDING')",tenant,id,b!.id,b!.source_version+1,now,hash,now).run();
 const m=await q('SELECT * FROM simops_messages WHERE tenant=? AND id=?',tenant,id).first<Message>();
 const r=await processMessage(actor,tenant,m!);await log(tenant,actor,'bed.departed',b!.id).run();return r;
}
export async function retryCoord(actor:RequestActor,tenant:string,id:string){await coordScope(actor,tenant);if(!admin(actor))fail('MANAGER_REQUIRED','Yeniden deneme yetkisi yok.',403);await writable();const m=await q('SELECT * FROM simops_messages WHERE tenant=? AND id=?',tenant,id).first<Message>();if(!m||m.status!=='quarantine')fail('RETRY_UNAVAILABLE','Yalnız karantinadaki olay yeniden denenebilir.');if(m.attempts>=5)fail('RETRY_LIMIT','En fazla beş deneme; eşleme teknik yönetici tarafından incelenmeli.');return processMessage(actor,tenant,m,true);}
export async function transitionCoord(actor:RequestActor,tenant:string,id:string,version:number,action:string,confirmation?:unknown){await coordScope(actor,tenant);await writable();const j=await q('SELECT * FROM simops_jobs WHERE tenant=? AND id=?',tenant,id).first<Job>();if(!j)fail('NOT_FOUND','Görev bulunamadı.',404);if(!admin(actor)&&!actor.unitCodes.includes(j.unit))fail('UNIT_DENIED','Bu birimin görevi değil.',403);if(['privacy_officer','security_officer'].includes(actor.role))fail('WRITER_REQUIRED','Operasyon yazma yetkisi yok.',403);
 if(j.version!==version)fail('CONFLICT','Görev başka işlemle değişti.');if(j.owner&&j.owner!==actor.email&&!['inspect','cancel','handoff.accept'].includes(action))fail('OWNER_REQUIRED','Görev başka personelde.');
 const steps:Record<string,Record<string,string>>={cleaning:{accept:'accepted',start:'active',complete:'check',inspect:'done',rework:'active'},transport:{accept:'accepted',start:'active',deliver:'done'}};
 const prior:Record<string,string[]>={accept:['queued'],start:['accepted'],complete:['active'],inspect:['check'],rework:['check'],deliver:['active']};const next=steps[j.kind]?.[action];if(!next||!prior[action]?.includes(j.status))fail('INVALID_TRANSITION','Bu adım sırası geçersiz.');
 const beforeTransport = j.kind==='transport' && (action==='accept'||action==='start');
 if(beforeTransport && j.created_at<=Date.now()-TRANSPORT_HOLD_MS)fail('RESERVATION_EXPIRED','Yatak ayırma süresi doldu. Yeni transfer talebi açın.');
 if(action==='inspect'&&(!['operations_manager','unit_manager'].includes(actor.role)||j.owner===actor.email))fail('INDEPENDENT_INSPECTION','Temizliği yapan kişiden farklı yetkili kontrol etmelidir.',403);
 if(action==='deliver'){
  const c=confirmation as Record<string,unknown>|undefined;
  if(!c||Object.keys(c).some(k=>!['target','twoIdentifiersVerified','receiverConfirmed','receiver'].includes(k))||c.target!==j.target||c.twoIdentifiersVerified!==true||c.receiverConfirmed!==true||typeof c.receiver!=='string'||!/^PRS-SIM-[A-Z0-9-]{1,30}$/.test(c.receiver)||c.receiver===j.owner)fail('DELIVERY_CONFIRMATION','Doğru hedef, iki kimlik unsurunun kurum prosedürüyle doğrulanması ve alıcı teslim onayı gerekli.',422);
 }
 const duty=await dutyGuard(tenant,actor.email,j.unit);
 const now=Date.now(),st=[...duty,...guard(
  'SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=?' + (beforeTransport ? ' AND created_at>?' : ''),
  beforeTransport ? [tenant,id,version,now-TRANSPORT_HOLD_MS] : [tenant,id,version]),q('UPDATE simops_jobs SET status=?,owner=coalesce(owner,?),reason=?,version=version+1,updated_at=? WHERE tenant=? AND id=?',next,actor.email,next==='done'?'DONE':next==='check'?'WAIT_INSPECTION':'IN_PROGRESS',now,tenant,id)];
 if(j.kind==='cleaning')st.push(q('UPDATE simops_beds SET cleaning=?,version=version+1 WHERE tenant=? AND id=?',next==='done'?'ready':next==='check'?'check':next==='active'?'active':'queued',tenant,j.bed));
 if(j.kind==='transport'&&action==='deliver'){
  st.push(q('UPDATE simops_jobs SET delivery_evidence=? WHERE tenant=? AND id=?',JSON.stringify(confirmation),tenant,id));
  // K6: transferden sonra boşalan yatak için temizlik işi de açılır (yoksa zincir kopar).
  const openClean=await q("SELECT id FROM simops_jobs WHERE tenant=? AND bed=? AND kind='cleaning' AND status NOT IN('done','cancelled')",tenant,j.bed).first<{id:string}>();
  if(!openClean)st.push(q("INSERT INTO simops_jobs(tenant,id,kind,bed,unit,authority,created_at,updated_at) VALUES(?,?,'cleaning',?,'CTM',?,?,?)",tenant,`SIM-CLN-${crypto.randomUUID().slice(0,8)}`,j.bed,j.authority,now,now));
  st.push(q("UPDATE simops_beds SET physical='occupied',hbys='unknown',review=1,cleaning='dirty',version=version+1 WHERE tenant=? AND id=?",tenant,j.target),q("UPDATE simops_beds SET physical='departed',hbys='unknown',cleaning='queued',review=1,version=version+1 WHERE tenant=? AND id=?",tenant,j.bed),q('DELETE FROM simops_reservations WHERE tenant=? AND job=?',tenant,id));
 }
 st.push(log(tenant,actor,`job.${action}`,id));await batch(st);return {id,status:next};
}
export async function reserveTransport(actor:RequestActor,tenant:string,raw:Record<string,unknown>){await coordScope(actor,tenant);if(!['operations_manager','unit_manager','clinician'].includes(actor.role))fail('AUTHORITY_REQUIRED','Transfer isteğini yetkili personel kaydeder.',403);await writable();
 if(typeof raw.patient!=='string'||!/^HST-SIM-\d{3}$/.test(raw.patient)||typeof raw.authority!=='string'||!/^YTKL-SIM-[A-Z0-9-]{1,40}$/.test(raw.authority)||!Number.isSafeInteger(raw.decidedAt)||Number(raw.decidedAt)>Date.now()||Date.now()-Number(raw.decidedAt)>86400000)fail('AUTHORITY_REQUIRED','Kurgusal hasta, yetkili karar kodu ve son 24 saatteki karar zamanı gerekli.',422);
 const beds=await rows<Bed>('SELECT * FROM simops_beds WHERE tenant=? AND id IN(?,?)',tenant,raw.bed,raw.target),source=beds.find(b=>b.id===raw.bed),target=beds.find(b=>b.id===raw.target);
 if(!source||!target||source.id===target.id||source.physical!=='occupied'||source.review||!bedReady(target))fail('BED_UNAVAILABLE','Kaynak dolu ve hedefsiz inceleme yok; hedef doğrulanmış hazır yatak olmalı.');if(!admin(actor)&&!actor.unitCodes.includes(source.unit))fail('UNIT_DENIED','Kaynak birim yetkiniz yok.',403);
 const auto=targetAuthority(actor,target.unit);
 const id=`SIM-TRN-${crypto.randomUUID().slice(0,8)}`,now=Date.now();await batch([...expireTransportReservations(actor,tenant,now),...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?',[tenant,target.id,target.version]),...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?',[tenant,source.id,source.version]),q('INSERT INTO simops_reservations(tenant,bed,patient,job) VALUES(?,?,?,?)',tenant,target.id,raw.patient,id),q("INSERT INTO simops_jobs(tenant,id,kind,bed,target,unit,authority,patient,decision_at,status,reason,created_at,updated_at) VALUES(?,?,'transport',?,?,'ULS',?,?,?,?,?,?,?)",tenant,id,source.id,target.id,raw.authority,raw.patient,raw.decidedAt,auto?'queued':'offered',auto?'WAIT_ACCEPT':'WAIT_TARGET',now,now),decision(tenant,id,1,'offered',target.id,actor,null,now),...(auto?[decision(tenant,id,1,'accepted',target.id,actor,null,now)]:[]),log(tenant,actor,'transport.request',id)]);return {id,status:auto?'queued':'offered'};
}
function expireTransportReservations(actor: RequestActor, tenant: string, now: number) {
 const expired = "tenant=? AND kind='transport' AND status IN ('offered','queued','accepted') AND created_at<=?";
 const cutoff = now - TRANSPORT_HOLD_MS;
 return [
  q("INSERT INTO simops_log(tenant,actor,action,resource,at) SELECT tenant,?,'transport.expire',id,? FROM simops_jobs WHERE " + expired, actor.email, now, tenant, cutoff),
  q("DELETE FROM simops_reservations WHERE tenant=? AND job IN (SELECT id FROM simops_jobs WHERE " + expired + ")", tenant, tenant, cutoff),
  q("UPDATE simops_jobs SET status='cancelled',reason='RESERVATION_EXPIRED',version=version+1,updated_at=? WHERE " + expired, now, tenant, cutoff),
 ];
}
export async function decideTransfer(actor: RequestActor, tenant: string, id: string, version: number, choice: unknown, reason: unknown) {
 await coordScope(actor, tenant);await writable();
 const j = await q("SELECT * FROM simops_jobs WHERE tenant=? AND id=? AND kind='transport'", tenant, id).first<Job>();
 if (!j || !j.target) fail('NOT_FOUND', 'Transfer bulunamadı.', 404);
 const target = await q('SELECT unit FROM simops_beds WHERE tenant=? AND id=?', tenant, j.target).first<{unit:string}>();
 if (!target || !targetAuthority(actor, target.unit)) fail('TARGET_AUTHORITY_REQUIRED', 'Transferi hedef birimin yöneticisi veya operasyon yöneticisi kabul eder.', 403);
 if (j.version !== version) fail('CONFLICT', 'Transfer başka işlemle değişti.');
 if (j.status !== 'offered') fail('INVALID_TRANSITION', 'Bu transfer hedef birim kararı beklemiyor.');
 const now = Date.now();
 if (j.created_at <= now - TRANSPORT_HOLD_MS) fail('RESERVATION_EXPIRED', 'Yatak ayırma süresi doldu. Yeni transfer talebi açın.');
 if (choice !== 'accept' && choice !== 'reject') fail('INVALID_DECISION', 'Karar kabul veya ret olmalı.', 422);
 const note = typeof reason === 'string' ? reason.trim() : '';
 if (choice === 'reject' && (!note || note.length > 250)) fail('REASON_REQUIRED', 'Ret için en fazla 250 karakterlik gerekçe girin.', 422);
 const round = (await q('SELECT MAX(round) AS r FROM simops_transfer_decisions WHERE tenant=? AND job=?', tenant, id).first<{r:number|null}>())?.r ?? 1;
 const stillOffered = guard("SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=? AND status='offered' AND created_at>?", [tenant, id, version, now - TRANSPORT_HOLD_MS]);
 if (choice === 'accept') {
  await batch([...stillOffered,
   q("UPDATE simops_jobs SET status='queued',reason='WAIT_ACCEPT',version=version+1,updated_at=? WHERE tenant=? AND id=?", now, tenant, id),
   decision(tenant, id, round, 'accepted', j.target, actor, null, now), log(tenant, actor, 'transport.target.accept', id)]);
  return {id, status:'queued'};
 }
 await batch([...stillOffered,
  q("UPDATE simops_jobs SET status='declined',reason='TARGET_REJECTED',version=version+1,updated_at=? WHERE tenant=? AND id=?", now, tenant, id),
  q('DELETE FROM simops_reservations WHERE tenant=? AND job=?', tenant, id),
  decision(tenant, id, round, 'rejected', j.target, actor, note, now), log(tenant, actor, 'transport.target.reject', id)]);
 return {id, status:'declined'};
}
export async function reofferTransfer(actor: RequestActor, tenant: string, id: string, version: number, newTarget: unknown) {
 await coordScope(actor, tenant);
 if (!['operations_manager','unit_manager','clinician'].includes(actor.role)) fail('AUTHORITY_REQUIRED', 'Transferi yetkili personel yeniden teklif eder.', 403);
 await writable();
 const j = await q("SELECT * FROM simops_jobs WHERE tenant=? AND id=? AND kind='transport'", tenant, id).first<Job>();
 if (!j) fail('NOT_FOUND', 'Transfer bulunamadı.', 404);
 const beds = await rows<Bed>('SELECT * FROM simops_beds WHERE tenant=? AND id IN(?,?)', tenant, j.bed, newTarget);
 const source = beds.find(b => b.id === j.bed), target = beds.find(b => b.id === newTarget);
 if (!source || (!admin(actor) && !actor.unitCodes.includes(source.unit))) fail('UNIT_DENIED', 'Kaynak birim yetkiniz yok.', 403);
 if (j.version !== version) fail('CONFLICT', 'Transfer başka işlemle değişti.');
 if (j.status !== 'declined') fail('INVALID_TRANSITION', 'Yalnız hedef birimin reddettiği transfer yeniden teklif edilir.');
 if (!target || target.id === source.id || target.id === j.target || !bedReady(target)) fail('BED_UNAVAILABLE', 'Yeni hedef, reddedilen yataktan farklı ve doğrulanmış hazır olmalı.');
 const now = Date.now(), auto = targetAuthority(actor, target.unit);
 const round = ((await q('SELECT MAX(round) AS r FROM simops_transfer_decisions WHERE tenant=? AND job=?', tenant, id).first<{r:number|null}>())?.r ?? 1) + 1;
 await batch([...expireTransportReservations(actor, tenant, now),
  ...guard("SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=? AND status='declined'", [tenant, id, version]),
  ...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?', [tenant, target.id, target.version]),
  q('INSERT INTO simops_reservations(tenant,bed,patient,job) VALUES(?,?,?,?)', tenant, target.id, j.patient, id),
  q('UPDATE simops_jobs SET target=?,status=?,reason=?,created_at=?,version=version+1,updated_at=? WHERE tenant=? AND id=?', target.id, auto ? 'queued' : 'offered', auto ? 'WAIT_ACCEPT' : 'WAIT_TARGET', now, now, tenant, id),
  decision(tenant, id, round, 'offered', target.id, actor, null, now), ...(auto ? [decision(tenant, id, round, 'accepted', target.id, actor, null, now)] : []),
  log(tenant, actor, 'transport.reoffer', id)]);
 return {id, status: auto ? 'queued' : 'offered'};
}
export async function cancelTransport(actor: RequestActor, tenant: string, id: string, version: number, reason: unknown) {
 await coordScope(actor, tenant);
 if (!admin(actor)) fail('MANAGER_REQUIRED', 'Rezervasyonu operasyon yöneticisi iptal eder.', 403);
 await writable();
 if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 250) {
  fail('REASON_REQUIRED', 'En fazla 250 karakterlik iptal nedeni girin.', 422);
 }
 await batch([
  ...guard("SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=? AND kind='transport' AND status IN ('offered','queued','accepted','declined')", [tenant, id, version]),
  q("UPDATE simops_jobs SET status='cancelled',reason=?,version=version+1,updated_at=? WHERE tenant=? AND id=?", reason.trim(), Date.now(), tenant, id),
  q('DELETE FROM simops_reservations WHERE tenant=? AND job=?', tenant, id),
  log(tenant, actor, 'transport.cancel', id),
 ]);
 return {id, status:'cancelled'};
}
// Synthetic duty uses the existing active staff/unit directory; it never grants real staff permissions.
export async function setCoordDuty(actor:RequestActor,tenant:string,body:Record<string,unknown>){await coordScope(actor,tenant);if(!admin(actor))fail('MANAGER_REQUIRED','Vardiyayı operasyon yöneticisi planlar.',403);await writable();
 const email=typeof body.email==='string'?body.email.toLowerCase().trim():'',unit=String(body.unit),start=Number(body.startsAt),end=Number(body.endsAt),now=Date.now();
 const target=await q("SELECT s.email FROM staff_accounts s WHERE s.email=? AND s.active=1 AND s.system_role IN ('operations_manager','unit_manager','clinician','call_agent') AND (s.system_role='operations_manager' OR EXISTS(SELECT 1 FROM unit_memberships u WHERE u.email=s.email AND u.unit_code=? AND u.active=1))",email,unit).first();
 if(!target||!['CTM','ULS','YTK'].includes(unit)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>16*3600000||end<now||end>now+7*86400000)fail('INVALID_DUTY','Etkin birim üyesi ve en fazla 16 saatlik geçerli vardiya gerekli.',422);
 await batch([q('INSERT OR IGNORE INTO simops_members(tenant,email) VALUES(?,?)',tenant,email),q('INSERT INTO simops_duty(tenant,email,unit,starts_at,ends_at,available) VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,email,unit) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,available=excluded.available',tenant,email,unit,start,end,body.available===true?1:0),log(tenant,actor,'duty.planned',unit)]);return {unit};
}
async function dutyGuard(tenant:string,email:string,unit:string){const now=Date.now();const sql="SELECT 1 FROM simops_duty d JOIN staff_accounts s ON s.email=d.email WHERE d.tenant=? AND d.email=? AND d.unit=? AND d.available=1 AND d.starts_at<=? AND d.ends_at>? AND s.active=1 AND s.system_role IN ('operations_manager','unit_manager','clinician','call_agent') AND (s.system_role='operations_manager' OR EXISTS (SELECT 1 FROM unit_memberships m WHERE m.email=d.email AND m.unit_code=d.unit AND m.active=1))";const args=[tenant,email,unit,now,now];if(!await q(sql,...args).first())fail('OFF_DUTY','Etkin birim üyeliği, uygunluk ve bu saatte geçerli vardiya gerekli.',403);return guard(sql,args);}
export async function coordHandoff(actor:RequestActor,tenant:string,id:string,version:number,to:string,accept=false){await coordScope(actor,tenant);await writable();const j=await q('SELECT * FROM simops_jobs WHERE tenant=? AND id=?',tenant,id).first<Job&{handoff_to:string|null}>();if(!j||['done','cancelled'].includes(j.status)||j.version!==version)fail('CONFLICT','Açık görev veya sürüm değişti.');
 if(j.kind==='transport'&&HOLD_STATUSES.includes(j.status)&&j.created_at<=Date.now()-TRANSPORT_HOLD_MS)fail('RESERVATION_EXPIRED','Süresi dolmuş taşıma devredilemez.');
 if(accept){if(j.handoff_to!==actor.email)fail('HANDOFF_RECIPIENT','Yalnız belirtilen devralan onaylayabilir.',403);const d=await dutyGuard(tenant,actor.email,j.unit);await batch([...d,...guard('SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=?',[tenant,id,version]),q('UPDATE simops_jobs SET owner=?,handoff_to=NULL,version=version+1,updated_at=? WHERE tenant=? AND id=?',actor.email,Date.now(),tenant,id),log(tenant,actor,'handoff.accept',id)]);
 }else{if(j.owner!==actor.email||to===actor.email||j.handoff_to)fail('HANDOFF_OWNER','Devri görev sahibi başlatır; bekleyen devri tekrar başlatamaz.',403);await coordScope({...actor,email:to},tenant);await dutyGuard(tenant,to,j.unit);await batch([...guard('SELECT 1 FROM simops_jobs WHERE tenant=? AND id=? AND version=?',[tenant,id,version]),q('UPDATE simops_jobs SET handoff_to=?,version=version+1,updated_at=? WHERE tenant=? AND id=?',to,Date.now(),tenant,id),log(tenant,actor,'handoff.request',id)]);}
 return {id};}
export async function reconcileCoord(actor:RequestActor,tenant:string,id:string,version:number,body:Record<string,unknown>){await coordScope(actor,tenant);if(!admin(actor))fail('MANAGER_REQUIRED','Mutabakatı operasyon yöneticisi doğrular.',403);await writable();const b=await q('SELECT * FROM simops_beds WHERE tenant=? AND id=?',tenant,id).first<Bed>();if(!b||b.version!==version)fail('CONFLICT','Yatak sürümü değişti.');
 if(body.sourceChecked!==true||body.physicalChecked!==true||body.sourceVersion!==b.source_version||b.hbys==='unknown'||!b.observed_at||Date.now()-b.observed_at>900000||(b.hbys==='vacant'&&b.physical!=='departed')||(b.hbys==='occupied'&&b.physical!=='occupied'))fail('RECONCILIATION_REQUIRED','Güncel kaynak sürümü ve fiziksel durum birlikte doğrulanmalı; bilinmeyen veya çelişkili kayıt kapatılamaz.',422);
 await batch([...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?',[tenant,id,version]),q('UPDATE simops_beds SET review=0,version=version+1 WHERE tenant=? AND id=?',tenant,id),q("UPDATE simops_jobs SET status='done',reason='SOURCE_RECONCILED',version=version+1,updated_at=? WHERE tenant=? AND bed=? AND kind='review' AND status='queued'",Date.now(),tenant,id),log(tenant,actor,'bed.reconciled',id)]);return {id};}
export async function controlCoordBed(actor:RequestActor,tenant:string,id:string,version:number,technical:boolean,staffed:boolean){await coordScope(actor,tenant);if(!admin(actor))fail('MANAGER_REQUIRED','Kapasite engelini yetkili yönetici değiştirir.',403);await writable();await batch([...guard('SELECT 1 FROM simops_beds WHERE tenant=? AND id=? AND version=?',[tenant,id,version]),q('UPDATE simops_beds SET technical=?,staffed=?,version=version+1 WHERE tenant=? AND id=?',technical?1:0,staffed?1:0,tenant,id),log(tenant,actor,'bed.operational-block',id)]);return {id};}
