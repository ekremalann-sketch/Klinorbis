import { getDb } from "../../../db";
import { assignTask, workloadView } from "../../../lib/workload";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, requireOperationalWriter, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Personel iş yükü dengesi.
// GET  → birim başına açık/geciken iş, kişi başı yük, sahipsiz işler ve atama önerileri (kullanıcının gördüğü birimler)
// POST assign {reference, email} → işi birimdeki kişiye ata (birim sorumlusu veya operasyon yöneticisi; kişiye bildirim gider)
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "workload.read", 60, 60);
    if (!["operations_manager", "unit_manager"].includes(actor.role)) throw new SecurityError(403, "İş yükü ekranını birim sorumlusu ve operasyon yöneticisi görür.", "MANAGER_REQUIRED");
    return Response.json(await workloadView(getDb(), actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 2048);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireOperationalWriter(actor);
    await enforceRateLimit(request, actor, "workload.write", 60, 60);
    const body = await request.json() as { action?: unknown; reference?: unknown; email?: unknown };
    if (body.action !== "assign") throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    const reference = typeof body.reference === "string" ? body.reference.slice(0, 80) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    return Response.json({ ok: true, ...(await assignTask(getDb(), actor, reference, email)) });
  } catch (error) {
    return securityResponse(error, request);
  }
}
