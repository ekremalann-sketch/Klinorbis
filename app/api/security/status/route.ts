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
      posture: "protected-pilot",
      controls: {
        platformIdentity: true,
        serverAuthorization: true,
        unitIsolation: true,
        objectAuthorization: true,
        csrfOriginDefense: true,
        rateLimiting: true,
        bodySizeLimit: true,
        piiRedaction: true,
        tamperEvidentAudit: true,
        signedWebhooks: Boolean(getWebhookSecret()),
        securityHeaders: true,
        externalHealthDataTransfer: false,
      },
      eventCount: total?.count || 0,
      recent,
    }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}
