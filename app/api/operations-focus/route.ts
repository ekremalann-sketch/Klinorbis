import { getDb } from "../../../db";
import { opsFocus } from "../../../lib/ops-focus";
import { enforceRateLimit, requireActor, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// "Operasyon": yalnız müdahale gerektirenler (operasyon yöneticisi).
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "opsfocus.read", 120, 60);
    return Response.json(await opsFocus(getDb(), actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
