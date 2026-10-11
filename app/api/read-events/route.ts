import {and,eq} from "drizzle-orm";
import {getDb} from "../../../db";
import {tickets,callSessions} from "../../../db/schema";
import {recordRead} from "../../../lib/read-audit";
import {requireActor,requireUnitAccess,assertBrowserMutation,assertJsonRequest,SecurityError,securityResponse,enforceRateLimit} from "../../../lib/security";
export async function POST(request:Request){try{
 assertBrowserMutation(request);assertJsonRequest(request,1000);const actor=await requireActor(request);await enforceRateLimit(request,actor,"read-event",60,60);
 const body=await request.json() as {kind?:string;reference?:string};if(!body.reference||!['ticket','call'].includes(body.kind||''))throw new SecurityError(400,"Kayıt referansı gerekli.","INVALID_INPUT");
 const db=getDb();const rows=body.kind==='call'?await db.select({unit:callSessions.unitCode}).from(callSessions).where(eq(callSessions.reference,body.reference)).limit(1):await db.select({unit:tickets.unitCode}).from(tickets).where(eq(tickets.reference,body.reference)).limit(1);
 if(!rows[0]?.unit)throw new SecurityError(404,"Kayıt bulunamadı.","NOT_FOUND");requireUnitAccess(actor,rows[0].unit);await recordRead(actor,`${body.kind}:${body.reference}`);return Response.json({ok:true});
 }catch(e){return securityResponse(e,request);}}
