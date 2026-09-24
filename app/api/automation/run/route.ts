import { getDb } from "../../../../db";
import { assertBrowserMutation, enforceRateLimit, requireActor, securityResponse } from "../../../../lib/security";
import { runWorkflowCycle } from "../../../../lib/workflow-engine";

export async function POST(request: Request) {
  try {
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "automation.run", 20, 60);
    if (actor.role !== "operations_manager" && actor.role !== "security_officer") {
      return Response.json({ error: "Otomasyon çevrimi için yetkiniz yok.", code: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ ok: true, ...(await runWorkflowCycle(getDb(), `interactive:${actor.role}`)) });
  } catch (error) {
    return securityResponse(error, request);
  }
}
