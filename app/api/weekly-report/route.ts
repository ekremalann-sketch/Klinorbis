import { getDb } from "../../../db";
import { recordRead } from "../../../lib/read-audit";
import { weeklyReport } from "../../../lib/weekly-report";
import { enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Haftalık yönetim raporu (operasyon yöneticisi: tüm hastane; birim sorumlusu: kendi birimleri).
// İsteğe bağlı ?cost= (saatlik personel maliyeti, TL) ve ?followup= (gecikme başına takip dakikası) varsayımları.
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "weekly.read", 30, 60);
    if (!["operations_manager", "unit_manager"].includes(actor.role)) throw new SecurityError(403, "Haftalık raporu birim sorumlusu ve operasyon yöneticisi görür.", "MANAGER_REQUIRED");
    const url = new URL(request.url);
    const num = (key: string, fallback: number, min: number, max: number) => { const v = Number(url.searchParams.get(key)); return Number.isFinite(v) && url.searchParams.has(key) ? Math.min(max, Math.max(min, v)) : fallback; };
    await recordRead(actor, "weekly-report");
    const report = await weeklyReport(getDb(), actor, new Date(), { staffHourlyCostTL: num("cost", 400, 50, 5000), followUpMinutesPerLateStep: num("followup", 6, 1, 60) });
    return Response.json(report, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
