import { getDb } from "../../../db";
import { escalateOverdueTasks } from "../../../lib/escalation";
import { listNotifications, markNotificationsRead } from "../../../lib/notifications";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Kişiye özel bildirimler.
// GET  → son 30 bildirim ve okunmamış sayısı (yalnız oturumdaki kişinin kendi bildirimleri)
// POST → read {ids: number[]} | read.all
// Zamanlayıcı çalışmasa da gecikme yükseltmesi kaybolmasın diye GET, en fazla dakikada bir yükseltme taraması tetikler.
let lastSweep = 0;

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "notifications.read", 120, 60);
    const db = getDb();
    if (Date.now() - lastSweep > 60_000) { lastSweep = Date.now(); await escalateOverdueTasks(db).catch(() => undefined); }
    return Response.json(await listNotifications(db, actor.email), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "notifications.write", 60, 60);
    const body = await request.json() as { action?: unknown; ids?: unknown };
    const db = getDb();
    if (body.action === "read.all") return Response.json({ ok: true, changed: await markNotificationsRead(db, actor.email, "all") });
    if (body.action === "read") {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
      return Response.json({ ok: true, changed: await markNotificationsRead(db, actor.email, ids) });
    }
    throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
  } catch (error) {
    return securityResponse(error, request);
  }
}
