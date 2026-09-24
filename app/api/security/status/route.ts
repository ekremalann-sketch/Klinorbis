import { desc, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { securityEvents } from "../../../../db/schema";
import { enforceRateLimit, getWebhookSecret, requireActor, securityResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "security.status", 60, 60);
    if (actor.role !== "operations_manager" && actor.role !== "security_officer" && actor.role !== "privacy_officer") {
      return Response.json({ error: "Güvenlik merkezine erişim yetkiniz yok.", code: "FORBIDDEN" }, { status: 403 });
    }
    const db = getDb();
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(securityEvents);
    const recent = await db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(40);
    return Response.json({
      generatedAt: new Date().toISOString(),
      posture: "verification-pending",
      verificationNote: "Kodda yer alan önlemler canlı ortamda bağımsız olarak doğrulanmadı. Bu yanıt güvenlik sertifikası değildir.",
      controls: {
        // 'true' means verified in this environment, not merely present in source.
        // The listed checks need live adversarial tests before they can be marked verified.
        platformIdentity: false,
        serverAuthorization: false,
        unitIsolation: false,
        objectAuthorization: false,
        csrfOriginDefense: false,
        rateLimiting: false,
        bodySizeLimit: false,
        piiRedaction: false,
        tamperEvidentAudit: false,
        signedWebhooks: Boolean(getWebhookSecret()),
        securityHeaders: false,
        externalHealthDataTransfer: false,
      },
      eventCount: total?.count || 0,
      recent,
    }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
