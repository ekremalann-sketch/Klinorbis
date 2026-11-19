import { createAsset, listAssets, updateAsset } from "../../../lib/assets";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// KG1: varlık kaydı. Yetki ve birim kapsamı sunucuda (lib/assets) denetlenir; arayüz yalnız yansıtır.
// GET ?birim=&durum=&kod= → { assets, canCreate, units }
// POST { action: create|update, … }
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "assets.read", 120, 60);
    const q = new URL(request.url).searchParams;
    const body = await listAssets(actor, { unit: q.get("birim") ?? undefined, status: q.get("durum") ?? undefined, code: q.get("kod") ?? undefined });
    return Response.json(body, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "assets.write", 30, 60);
    const b = await request.json() as Record<string, unknown>;
    let result: unknown;
    switch (b.action) {
      case "create": result = await createAsset(actor, b); break;
      case "update": result = await updateAsset(actor, b); break;
      default: throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return securityResponse(error, request);
  }
}
