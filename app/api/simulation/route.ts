import { getDb } from "../../../db";
import { automationStopped } from "../../../lib/automation-policy";
import { DEFAULT_PARAMS, PARAM_LABELS, SCENARIOS, SIM_HOSPITAL, SIM_LABEL } from "../../../lib/simulation";
import { clearSimulations, createSimulation, getSimulation, listSimulations } from "../../../lib/simulation-store";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse, type RequestActor } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Sanal hastane simülasyonu (yalnız operasyon yöneticisi).
// GET            → varsayılan varsayımlar ve son kayıtlar
// GET ?id=SIM-…  → bir kaydın tam sonucu
// POST run {params} → kurgusal hastanede çalıştır ve kaydet (acil durdurma açıkken çalışmaz)
// POST clear        → tüm simülasyon kayıtlarını sil
// Yapay zekâ veya dış servis kullanılmaz; gerçek veri okunmaz.
function requireOpsManager(actor: RequestActor) {
  if (actor.role !== "operations_manager") throw new SecurityError(403, "Simülasyonu yalnız operasyon yöneticisi çalıştırır.", "OPERATIONS_MANAGER_REQUIRED");
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    requireOpsManager(actor);
    await enforceRateLimit(request, actor, "simulation.read", 60, 60);
    const db = getDb();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      if (!/^SIM-[A-Z0-9-]{4,30}$/.test(id)) throw new SecurityError(400, "Geçersiz kayıt.", "INVALID_INPUT");
      const row = await getSimulation(db, id);
      if (!row) throw new SecurityError(404, "Simülasyon kaydı bulunamadı.", "NOT_FOUND");
      return Response.json(row, { headers: { "cache-control": "no-store, private" } });
    }
    return Response.json({ label: SIM_LABEL, hospital: SIM_HOSPITAL, defaults: DEFAULT_PARAMS, labels: PARAM_LABELS, scenarios: SCENARIOS.map((x) => ({ key: x.key, label: x.label, detail: x.detail })), paused: await automationStopped(db), runs: await listSimulations(db) }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireOpsManager(actor);
    await enforceRateLimit(request, actor, "simulation.write", 12, 60);
    const body = await request.json() as { action?: unknown; params?: unknown; scenario?: unknown };
    const db = getDb();
    if (body.action === "clear") return Response.json({ ok: true, removed: await clearSimulations(db, actor.email) });
    if (body.action !== "run") throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    if (await automationStopped(db)) throw new SecurityError(409, "Otomasyon acil durdurmada; simülasyon da çalışmaz.", "AUTOMATION_PAUSED");
    const { id, result } = await createSimulation(db, actor.email, body.params, body.scenario);
    return Response.json({ ok: true, id, result }, { status: 201 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
