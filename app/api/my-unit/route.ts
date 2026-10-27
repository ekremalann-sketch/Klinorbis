import { getDb } from "../../../db";
import { myUnit } from "../../../lib/my-unit";
import { enforceRateLimit, requireActor, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// "Birimim": birim sorumlusunun işleri ve ekibi. Görevlendirme /api/workload üzerinden (vardiya ve yeniden atama onayıyla).
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "myunit.read", 120, 60);
    const unit = new URL(request.url).searchParams.get("birim")?.slice(0, 10) || undefined;
    return Response.json(await myUnit(getDb(), actor, unit), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
