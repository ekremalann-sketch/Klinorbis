import { getDb } from "../../../db";
import { notificationStatements } from "../../../lib/notifications";
import { allowedEndpoint, deviceCount, dispatchPush, subscribe, unsubscribe, vapidConfig } from "../../../lib/web-push";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// K8: Telefon bildirimi (ekran kapalıyken).
// GET  → {configured, publicKey, devices}: anahtar kurulu değilse configured=false (açıkmış gibi gösterilmez).
// POST → subscribe {endpoint} | unsubscribe {endpoint} | test (kişinin kendisine deneme bildirimi)
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "push.read", 60, 60);
    const vapid = vapidConfig();
    return Response.json({ configured: Boolean(vapid), publicKey: vapid?.publicKey ?? null, devices: await deviceCount(actor.email) }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 2048);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "push.write", 10, 60);
    if (!vapidConfig()) throw new SecurityError(503, "Telefon bildirimi bu kurulumda henüz açılmadı. Sistem yöneticisi bildirim anahtarlarını eklemeli.", "PUSH_NOT_CONFIGURED");
    const body = await request.json() as { action?: unknown; endpoint?: unknown };
    if (body.action === "subscribe" || body.action === "unsubscribe") {
      const endpoint = allowedEndpoint(body.endpoint);
      if (!endpoint) throw new SecurityError(400, "Bu tarayıcının bildirim adresi desteklenmiyor.", "PUSH_ENDPOINT_REJECTED");
      if (body.action === "subscribe") { await subscribe(actor.email, endpoint); return Response.json({ ok: true, devices: await deviceCount(actor.email) }); }
      return Response.json({ ok: true, removed: await unsubscribe(actor.email, endpoint), devices: await deviceCount(actor.email) });
    }
    if (body.action === "test") {
      const now = new Date();
      await getDb().batch(notificationStatements(getDb(), [actor.email], { kind: "task", title: "Deneme bildirimi", detail: "Telefon bildirimi çalışıyor.", path: "/inbox", key: `push-test:${Math.floor(now.getTime() / 60_000)}` }, now) as never);
      const out = await dispatchPush();
      return Response.json({ ok: true, sent: out.sent });
    }
    throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
  } catch (error) {
    return securityResponse(error, request);
  }
}
