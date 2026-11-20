import { getDb } from "../../../db";
import { normalizePin, normalizeTrackingCode } from "../../../lib/patient-journey";
import { patientStatus } from "../../../lib/patient-journey-store";
import { assertJsonRequest, enforceAnonymousRateLimit, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// Hasta: takip kodu + PIN ile kendi sürecini görür. Oturum gerektirmez; IP başına dakikada 10 deneme,
// kod başına 5 hatalı PIN'de 15 dakika kilit. Yanıt önbelleğe alınmaz, arama motorlarına kapalıdır.
export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 512);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new SecurityError(403, "Başka kökenden gelen istek engellendi.", "CSRF_BLOCKED");
    await enforceAnonymousRateLimit(request, "takip", 10, 60);
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new SecurityError(400, "Geçersiz istek.", "INVALID_JSON"); }
    const code = normalizeTrackingCode(body?.code);
    const pin = normalizePin(body?.pin);
    if (!code || !pin) throw new SecurityError(400, "Takip kodu 8 karakter, PIN 6 rakam olmalıdır.", "INVALID_INPUT");
    return Response.json(await patientStatus(getDb(), code, pin), { headers: { "cache-control": "no-store, private", "x-robots-tag": "noindex" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
