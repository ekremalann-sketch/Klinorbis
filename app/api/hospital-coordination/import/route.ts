// K10: Excel'den yatak listesi yükleme (yalnız kurgusal kodlar, en çok 500 satır). Ana uçtaki 4 KB sınırı korunur; bu uç 64 KB.
import {assertBrowserMutation,assertJsonRequest,enforceRateLimit,requireActor,securityResponse,SecurityError} from '../../../../lib/security';
import {importCoordBeds} from '../../../../lib/hospital-coordination';
export const dynamic='force-dynamic';
const LIMIT=64*1024;
export async function POST(request:Request){try{
 assertJsonRequest(request,LIMIT);assertBrowserMutation(request);const a=await requireActor(request);await enforceRateLimit(request,a,'coord.import',10,60);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>LIMIT)throw new SecurityError(413,'Liste çok büyük (en çok 500 satır).','PAYLOAD_TOO_LARGE');
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{throw new SecurityError(400,'Geçersiz istek.','INVALID_JSON');}
 const tenant=request.headers.get('x-klinorbis-sim-tenant')??'SIM-KURUM-A';
 return Response.json({ok:true,...await importCoordBeds(a,tenant,b.text)},{headers:{'cache-control':'no-store, private'}});
}catch(e){return securityResponse(e,request);}}
