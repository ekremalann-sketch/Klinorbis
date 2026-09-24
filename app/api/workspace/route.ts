import { getDb } from "../../../db";
import { workspaceSnapshot } from "../../../lib/operations";
import { enforceRateLimit, requireActor, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    try {
      await enforceRateLimit(request, actor, "workspace.read", 180, 60);
    } catch (error) {
      // Preserve explicit throttling decisions, but do not take the entire
      // workspace offline when the rate-limit telemetry store is unavailable.
      if (error && typeof error === "object" && "status" in error) throw error;
    }
    return Response.json(await workspaceSnapshot(getDb(), actor), {
      headers: { "cache-control": "no-store, private", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return securityResponse(error, request);
  }
}
