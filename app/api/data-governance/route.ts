import {requireActor,assertBrowserMutation,assertJsonRequest,SecurityError,securityResponse,enforceRateLimit} from "../../../lib/security";
import {recordRead} from "../../../lib/read-audit";
import {governanceList,governanceWrite,GovernanceError,type PrivacyDatabase} from "../../../lib/data-governance";
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
async function handle(request:Request,write:boolean){try{
 if(write){assertBrowserMutation(request);assertJsonRequest(request,6000);}
 const actor=await requireActor(request);if(!["operations_manager","privacy_officer"].includes(actor.role))throw new SecurityError(403,"Veri yönetimi için kurum yöneticisi veya KVKK yetkilisi gerekli.","ROLE_REQUIRED");
 await enforceRateLimit(request,actor,"data-governance",30,60);
 const db=(globalThis as typeof globalThis & {__KLINORBIS_DB:PrivacyDatabase}).__KLINORBIS_DB;
 const resources=["call_sessions","tickets","appointments","patient_coordination"];
 if(write){const body=await request.json() as Record<string,unknown>;if(JSON.stringify(body).length>6000)throw new GovernanceError(413,"İstek çok büyük.");return Response.json(await governanceWrite(db,"institution",actor.email,body,resources));}
 const offset=Math.max(0,Math.min(100000,Number(new URL(request.url).searchParams.get("offset"))||0));
 const data=await governanceList(db,"institution",offset);await recordRead(actor,"data-governance:list");
 return Response.json({...data,resources},{headers:{"cache-control":"private, no-store"}});
}catch(e){if(e instanceof GovernanceError)return Response.json({error:e.message},{status:e.status});return securityResponse(e,request);}}
