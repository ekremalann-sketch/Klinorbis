import { getDb } from "../../../db";
import { decideTransferRequest } from "../../../lib/control-tower";
import { assertBrowserMutation, assertJsonRequest, cleanText, enforceRateLimit, requireActor, SecurityError, securityResponse, type SystemRole } from "../../../lib/security";

// Transfer kabul/ret kararı yalnız yetkili insan tarafından kaydedilir; sistem karar üretmez.
const DECIDERS = new Set<SystemRole>(["clinician", "operations_manager"]);

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    if (!DECIDERS.has(actor.role)) throw new SecurityError(403, "Transfer kararını yetkili hekim kaydeder.", "DECIDER_REQUIRED");
    await enforceRateLimit(request, actor, "transfer.decide", 30, 60);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.reference !== "string" || (body.decision !== "accept" && body.decision !== "reject") || typeof body.physician !== "string") {
      throw new SecurityError(400, "Geçersiz transfer kararı.", "INVALID_DECISION");
    }
    const reason = body.reason ? cleanText(body.reason, "Gerekçe", 0, 300) : "";
    const result = await decideTransferRequest(getDb(), actor, {
      reference: body.reference.slice(0, 80), decision: body.decision, physician: body.physician.trim(), reason,
      facilityCode: typeof body.facilityCode === "string" ? body.facilityCode.slice(0, 20) : undefined,
    });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
