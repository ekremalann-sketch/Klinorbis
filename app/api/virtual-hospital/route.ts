import { getDb } from '../../../db';
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, securityResponse, SecurityError } from '../../../lib/security';
import { controlVirtualHospital, getVirtualHospital, requireSimulationManager, tickVirtualHospital } from '../../../lib/virtual-hospital-store';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const actor=await requireActor(request);requireSimulationManager(actor);
 return Response.json(await getVirtualHospital(getDb()),{headers:{'cache-control':'no-store, private'}});
}catch(error){return securityResponse(error,request);}}
export async function POST(request:Request){try{
 assertJsonRequest(request,2048);assertBrowserMutation(request);
 const actor=await requireActor(request);requireSimulationManager(actor);
 await enforceRateLimit(request,actor,'simulation.control',60,60);
 const raw=await request.text();if(raw.length>2048)throw new SecurityError(413,'İstek çok büyük.','SIM_BODY_TOO_LARGE');
 const body=JSON.parse(raw) as {action?:string;settings?:unknown};const db=getDb();
 if(body.action==='tick'||body.action==='advance'){
  await tickVirtualHospital(db,Date.now(),body.action==='advance'?120:undefined);
  return Response.json(await getVirtualHospital(db));
 }
 return Response.json(await controlVirtualHospital(db,actor,String(body.action),body.settings));
}catch(error){return securityResponse(error,request);}}
