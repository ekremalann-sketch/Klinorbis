import { getDb } from "../../../db";
import { actOnJourney, journeyBoard, openJourney } from "../../../lib/patient-journey-store";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, requireOperationalWriter, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Hasta süreç takibi (personel).
// GET  → hastane akış panosu (birim bazlı sayılar), görülebilen süreçler ve kendi birim kuyruğum
// POST { action: "open", pathway, clinicUnit, alias }                → yeni süreç; takip kodu ve PIN bir kez döner
// POST { action: "start"|"complete"|"skip"|"reject"|"add"|"cancel", reference, version, ... } → adım işlemi
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "journey.read", 90, 60);
    return Response.json(await journeyBoard(getDb(), actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireOperationalWriter(actor);
    await enforceRateLimit(request, actor, "journey.write", 60, 60);
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new SecurityError(400, "Geçersiz istek gövdesi.", "INVALID_JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new SecurityError(400, "Geçersiz istek gövdesi.", "INVALID_JSON");
    const db = getDb();
    if (body.action === "open") return Response.json({ ok: true, ...(await openJourney(db, actor, body)) }, { headers: { "cache-control": "no-store, private" } });
    return Response.json(await actOnJourney(db, actor, body), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
