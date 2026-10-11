import {recordRead} from "../../../lib/read-audit";
import { oversightView } from "../../../lib/oversight-view";
import {and,eq,sql} from "drizzle-orm";
import {getDb} from "../../../db";
import {patientCoordination,tickets,approvals} from "../../../db/schema";
import {requireActor,requireUnitAccess,requireOperationalWriter,assertBrowserMutation,assertJsonRequest,securityResponse,SecurityError,enforceRateLimit} from "../../../lib/security";
import {redactPII} from "../../../lib/privacy";
import {coordinationTransition} from "../../../lib/patient-coordination";
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
async function handle(request:Request,write:boolean){try{
 if(write){assertBrowserMutation(request);assertJsonRequest(request);}const actor=await requireActor(request);if(write)requireOperationalWriter(actor);
 await enforceRateLimit(request,actor,"coordination",60,60);const body=write?await request.json() as Record<string,unknown>:{};
 const reference=String(write?body.reference:new URL(request.url).searchParams.get("reference")||"");const db=getDb();
 const [ticket]=await db.select().from(tickets).where(eq(tickets.reference,reference)).limit(1);if(!ticket)throw new SecurityError(404,"Talep bulunamadı.","NOT_FOUND");requireUnitAccess(actor,ticket.unitCode);
 const [existing]=await db.select().from(patientCoordination).where(eq(patientCoordination.ticketReference,reference)).limit(1);
 if(!write)await recordRead(actor,`coordination:${reference}`);
 if(!write)return Response.json({plan:oversightView(actor,existing||null),channelStatus:"manual",notice:"Telefon, SMS ve WhatsApp gönderimi bağlı değil. Bu alan personelin yaptığı iletişimi kaydeder."},{headers:{"cache-control":"no-store, private"}});
 if(ticket.status==="Çözüldü")throw new SecurityError(409,"Kapanmış talep değiştirilemez.","CLOSED");
 const [pending]=await db.select().from(approvals).where(and(eq(approvals.ticketReference,reference),eq(approvals.status,"pending"))).limit(1);if(pending)throw new SecurityError(409,"Önce talebin bekleyen insan onayını sonuçlandırın.","APPROVAL_PENDING");
 if(body.action==="open"){
 if(existing)throw new SecurityError(409,"Koordinasyon zaten açık.","EXISTS");
 const [plan]=await db.insert(patientCoordination).values({ticketReference:reference,requestedBy:actor.email,history:JSON.stringify([{at:new Date().toISOString(),actor:actor.email,action:"open",note:"Doktor uygunluğu ve hasta bilgilendirme takibi açıldı."}])}).onConflictDoNothing().returning();if(!plan)throw new SecurityError(409,"Koordinasyon başka işlemle açıldı.","EXISTS");return Response.json({plan});
 }
 if(!existing)throw new SecurityError(409,"Önce koordinasyon takibini açın.","MISSING");if(body.version!==existing.version)throw new SecurityError(409,"Plan değişti; yenileyin.","CHANGED");
 if(body.providerAlias!==undefined&&!/^[A-Za-zÇĞİÖŞÜçğıöşü0-9._-]{2,40}$/.test(String(body.providerAlias)))throw new SecurityError(400,"Doktor için kimlik bilgisi yerine kısa takma ad kullanın.","INVALID_ALIAS");
 const safe={...body,note:redactPII(String(body.note||"")).maskedText,alternative:redactPII(String(body.alternative||"")).maskedText};
 let next;try{next=coordinationTransition(existing,String(body.action),safe,actor);}catch(e){throw new SecurityError(400,e instanceof Error?e.message:"İşlem geçersiz.","INVALID_INPUT");}
 const [plan]=await db.update(patientCoordination).set({...next,version:existing.version+1,updatedAt:new Date()}).where(and(eq(patientCoordination.ticketReference,reference),eq(patientCoordination.version,existing.version),sql`EXISTS (SELECT 1 FROM tickets WHERE reference = ${reference} AND unit_code = ${ticket.unitCode} AND status != ${"Çözüldü"})`)).returning();if(!plan)throw new SecurityError(409,"Plan başka işlemle değişti; yenileyin.","CHANGED");return Response.json({plan});
 }catch(e){return securityResponse(e,request);}}
