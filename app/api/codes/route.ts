import { advanceCode, callCode, listCodes } from "../../../lib/color-codes";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// KG2: renkli kodlar. Yetki ve ekip kontrolü sunucuda (lib/color-codes).
// GET → { open, history, colors, canDrill }   POST { action: call|advance, … }
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "codes.read", 240, 60);
    return Response.json(await listCodes(actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 2048);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "codes.write", 20, 60);
    const b = await request.json() as Record<string, unknown>;
    let result: unknown;
    switch (b.action) {
      case "call": result = await callCode(actor, b); break;
      case "advance": result = await advanceCode(actor, b); break;
      default: throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return securityResponse(error, request);
  }
}
