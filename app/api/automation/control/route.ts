import { tickVirtualHospital } from "../../../../lib/virtual-hospital-store";
import { getDb } from "../../../../db";
import { integrationEvents } from "../../../../db/schema";
import { auditStatements } from "../../../../lib/audit";
import { automationStopped, demoEnabled } from "../../../../lib/automation-policy";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../../lib/security";
async function authorized(request: Request) {
 const actor = await requireActor(request);
 if (!["operations_manager", "security_officer"].includes(actor.role)) throw new SecurityError(403,"Otomasyon kontrolü için yetkiniz yok.","AUTOMATION_CONTROL_REQUIRED");
 return actor;
}
export async function GET(request: Request) {
 try { await authorized(request); return Response.json({paused:await automationStopped(getDb()), demoEnabled:demoEnabled()}); } catch(error){return securityResponse(error,request);}
}
export async function POST(request: Request) {
 try {
  assertJsonRequest(request,1024); assertBrowserMutation(request); const actor=await authorized(request);
  await enforceRateLimit(request,actor,"automation.control",10,60);
  const body=await request.json() as { paused?: unknown }; if(typeof body.paused!=="boolean") throw new SecurityError(400,"Durdurma seçimi geçersiz.","INVALID_INPUT");
  const db=getDb(); const status=body.paused?"paused":"active";
  const audit=await auditStatements(db,[{actor:actor.email,action:body.paused?"automation.pause":"automation.resume",resource:"automation:control",detail:"Sonraki otomasyon döngülerine uygulanır; devam eden işlem güvenli biçimde tamamlanır."}]);
  await db.batch([db.insert(integrationEvents).values({eventId:"automation:control",source:"manual-control",eventType:"automation.control",payloadHash:actor.email,status,receivedAt:new Date()}).onConflictDoUpdate({target:integrationEvents.eventId,set:{status,payloadHash:actor.email,receivedAt:new Date()}}),...audit]);
  if(body.paused)await tickVirtualHospital(db).catch(()=>undefined);
  return Response.json({paused:body.paused,demoEnabled:demoEnabled()});
 } catch(error){return securityResponse(error,request);}
}
