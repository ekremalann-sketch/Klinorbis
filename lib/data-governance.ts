type Statement={bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<unknown>};
export type PrivacyDatabase={prepare(sql:string):Statement;batch(statements:Statement[]):Promise<{results?:Record<string,unknown>[]}[]>};
export class GovernanceError extends Error {constructor(public status:number,message:string){super(message);}}
const kinds=["access","correction","erase","restrict","objection"];
const text=(v:unknown,min=1,max=160)=>{if(typeof v!=="string"||v.trim().length<min||v.trim().length>max)throw new GovernanceError(400,`Alan ${min}–${max} karakter olmalıdır.`);return v.trim();};
const schemaReady=new WeakMap<object,Promise<unknown>>();
export async function governanceSchema(db:PrivacyDatabase){if(!schemaReady.has(db))schemaReady.set(db,db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS privacy_requests(id TEXT PRIMARY KEY,scope TEXT NOT NULL,subject_ref TEXT NOT NULL,kind TEXT NOT NULL,received_at TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received',created_by TEXT NOT NULL,verified_by TEXT,verification_ref TEXT,decision TEXT,decision_reason TEXT,reviewed_by TEXT,response_ref TEXT,responded_at TEXT,version INTEGER NOT NULL DEFAULT 1)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS privacy_scope_due ON privacy_requests(scope,due_at)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS retention_policies(id TEXT PRIMARY KEY,scope TEXT NOT NULL,resource TEXT NOT NULL,days INTEGER NOT NULL,basis_ref TEXT NOT NULL,legal_hold INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,approved_by TEXT,status TEXT NOT NULL DEFAULT 'draft',version INTEGER NOT NULL DEFAULT 1,UNIQUE(scope,resource))`),
 db.prepare(`CREATE TABLE IF NOT EXISTS governance_events(id TEXT PRIMARY KEY,scope TEXT NOT NULL,resource TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
]).catch(e=>{schemaReady.delete(db);throw e;}));await schemaReady.get(db);}
function event(db:PrivacyDatabase,scope:string,actor:string,resource:string,action:string){return db.prepare("INSERT INTO governance_events(id,scope,resource,actor,action) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),scope,resource,actor,action);}
export async function governanceList(db:PrivacyDatabase,scope:string,offset=0){
 await governanceSchema(db);
 const [requests,policies,count]=await Promise.all([db.prepare("SELECT * FROM privacy_requests WHERE scope=? ORDER BY due_at,id LIMIT 50 OFFSET ?").bind(scope,offset).all(),db.prepare("SELECT * FROM retention_policies WHERE scope=? ORDER BY resource LIMIT 50").bind(scope).all(),db.prepare("SELECT COUNT(*) AS total FROM privacy_requests WHERE scope=?").bind(scope).first<{total:number}>()]);
 return {requests:requests.results,policies:policies.results,total:count?.total||0,offset,limit:50};
}
export async function governanceWrite(db:PrivacyDatabase,scope:string,actor:string,body:Record<string,unknown>,resources:string[]){
 await governanceSchema(db);const action=String(body.action||"");
 if(action==="request.create"){
  const subject=text(body.subjectRef,2,80);if(!/^[A-Za-z][A-Za-z0-9._:-]+$/.test(subject)||subject.includes('@'))throw new GovernanceError(400,"Ad, telefon veya kimlik numarası yerine sistem kayıt referansı kullanın.");
  const kind=String(body.kind);if(!kinds.includes(kind))throw new GovernanceError(400,"Başvuru türünü seçin.");
  const received=new Date(String(body.receivedAt||new Date().toISOString()));if(!Number.isFinite(received.getTime())||received.getTime()>Date.now()+60000)throw new GovernanceError(400,"Geçerli başvuru teslim tarihini girin.");
  const id=crypto.randomUUID(),due=new Date(received.getTime()+30*86400000).toISOString();
  await db.batch([db.prepare("INSERT INTO privacy_requests(id,scope,subject_ref,kind,received_at,due_at,created_by) VALUES(?,?,?,?,?,?,?)").bind(id,scope,subject,kind,received.toISOString(),due,actor),event(db,scope,actor,id,action)]);return {id};
 }
 if(action==="policy.save"){
  const resource=String(body.resource);if(!resources.includes(resource))throw new GovernanceError(400,"Desteklenen veri grubunu seçin.");
  const days=Number(body.days);if(!Number.isInteger(days)||days<1||days>36500)throw new GovernanceError(400,"Saklama süresi 1–36500 gün olmalıdır.");
  const basis=text(body.basisRef,5,200),id=crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO retention_policies(id,scope,resource,days,basis_ref,legal_hold,created_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,resource) DO UPDATE SET days=excluded.days,basis_ref=excluded.basis_ref,legal_hold=excluded.legal_hold,created_by=excluded.created_by,approved_by=NULL,status='draft',version=retention_policies.version+1`).bind(id,scope,resource,days,basis,body.legalHold===true?1:0,actor),event(db,scope,actor,resource,action)]);return {ok:true};
 }
 const id=text(body.id),version=Number(body.version);if(!Number.isInteger(version))throw new GovernanceError(400,"Kayıt sürümü gerekli.");
 if(action==="policy.approve"){
  const p=await db.prepare("SELECT * FROM retention_policies WHERE scope=? AND id=?").bind(scope,id).first<Record<string,unknown>>();if(!p)throw new GovernanceError(404,"Politika bulunamadı.");
  if(p.created_by===actor)throw new GovernanceError(403,"Kendi hazırladığınız saklama politikasını onaylayamazsınız.");
  const stmt=db.prepare("UPDATE retention_policies SET status='approved',approved_by=?,version=version+1 WHERE scope=? AND id=? AND version=? AND status='draft' RETURNING id").bind(actor,scope,id,version);const results=await db.batch([stmt,db.prepare("INSERT INTO governance_events(id,scope,resource,actor,action) SELECT ?,?,?,?,? WHERE changes()>0").bind(crypto.randomUUID(),scope,id,actor,action)]);if(!results[0]?.results?.length)throw new GovernanceError(409,"Politika değişti; yenileyin.");return {ok:true};
 }
 const r=await db.prepare("SELECT * FROM privacy_requests WHERE scope=? AND id=?").bind(scope,id).first<Record<string,unknown>>();if(!r)throw new GovernanceError(404,"Başvuru bulunamadı.");
 let stmt:Statement;
 if(action==="request.verify"){
  if(r.status!=="received")throw new GovernanceError(409,"Başvuru kimlik kontrolü aşamasında değil.");
  stmt=db.prepare("UPDATE privacy_requests SET verified_by=?,verification_ref=?,status='verified',version=version+1 WHERE scope=? AND id=? AND version=? AND status='received' RETURNING id").bind(actor,text(body.verificationRef,5,160),scope,id,version);
 }else if(action==="request.decide"){
  if(r.status!=="verified")throw new GovernanceError(409,"Önce kurum prosedürüyle kimliği doğrulayın.");
  if(r.created_by===actor||r.verified_by===actor)throw new GovernanceError(403,"Başvuruyu kaydeden veya kimliğini doğrulayan kişi nihai kararı veremez.");
  const decision=String(body.decision);if(!["accept","reject"].includes(decision))throw new GovernanceError(400,"Kabul veya ret seçin.");
  stmt=db.prepare("UPDATE privacy_requests SET reviewed_by=?,decision=?,decision_reason=?,status='reviewed',version=version+1 WHERE scope=? AND id=? AND version=? AND status='verified' RETURNING id").bind(actor,decision,text(body.reason,12,500),scope,id,version);
 }else if(action==="request.respond"){
  if(r.status!=="reviewed")throw new GovernanceError(409,"Önce yetkili kişi kararını kaydedin.");
  stmt=db.prepare("UPDATE privacy_requests SET response_ref=?,responded_at=CURRENT_TIMESTAMP,status='answered',version=version+1 WHERE scope=? AND id=? AND version=? AND status='reviewed' RETURNING id").bind(text(body.responseRef,5,160),scope,id,version);
 }else throw new GovernanceError(400,"Desteklenmeyen işlem.");
 const results=await db.batch([stmt,db.prepare("INSERT INTO governance_events(id,scope,resource,actor,action) SELECT ?,?,?,?,? WHERE changes()>0").bind(crypto.randomUUID(),scope,id,actor,action)]);if(!results[0]?.results?.length)throw new GovernanceError(409,"Başvuru değişti; yenileyip tekrar deneyin.");return {ok:true};
}
