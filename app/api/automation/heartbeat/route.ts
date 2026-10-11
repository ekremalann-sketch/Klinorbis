import { getDb } from "../../../../db";
import { getAutomationAgentStatus } from "../../../../lib/agent-health";
import { runAutomationAgent } from "../../../../lib/agent-runtime";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

// Panel görünürken yetkili yönetici döngüyü tetikler. Tüm çağrılar ajan motorunun ortak kilidini kullanır.
export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 1_024);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    if (actor.role !== "operations_manager") throw new SecurityError(403, "Otomasyonu yalnız operasyon yöneticisi çalıştırır.", "OPERATIONS_MANAGER_REQUIRED");
    await enforceRateLimit(request, actor, "automation.heartbeat", 6, 60);
    const db = getDb();
    const status = await getAutomationAgentStatus(db);
    if (status.ageSeconds !== null && status.ageSeconds < 30) return Response.json({ ran: false, reason: "fresh", status });
    const result = await runAutomationAgent(db, "panel-heartbeat");
    return Response.json({ ran: result.ran, reason: result.ran ? "ran" : "locked", status: result.status });
  } catch (error) {
    return securityResponse(error, request);
  }
}
