import { getDb } from "../../../db";
import { routingCenter, setRoute } from "../../../lib/routing";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Birimler ve Yönlendirme: hangi talep hangi birime gider, birimde işi kim dağıtır, birimin hizmetleri.
// GET  → görüntüleme (operasyon yöneticisi, bilgi işlem, birim sorumluları)
// POST { action: "set", code, unitCode } | { action: "reset", code } → yalnız operasyon yöneticisi / bilgi güvenliği / Bilgi Teknolojileri sorumlusu
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "routing.read", 60, 60);
    return Response.json(await routingCenter(getDb(), actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 1024);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "routing.write", 30, 60);
    const b = await request.json() as { action?: unknown; code?: unknown; unitCode?: unknown };
    const code = typeof b.code === "string" ? b.code.slice(0, 40) : "";
    if (b.action === "set") return Response.json({ ok: true, ...(await setRoute(getDb(), actor, code, typeof b.unitCode === "string" ? b.unitCode.slice(0, 8).toUpperCase() : "")) });
    if (b.action === "reset") return Response.json({ ok: true, ...(await setRoute(getDb(), actor, code, null)) });
    throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
  } catch (error) {
    return securityResponse(error, request);
  }
}
