// İsteğe bağlı yapay zekâ izleme (yalnız KLINORBIS_AI_API_KEY veya OPENAI_API_KEY tanımlıysa çalışır).
// Güvenlik sınırları:
//  - Dışarı YALNIZ birim kodu bazında toplam sayılar gider: geciken görev sayısı, bekleyen onay sayısı/yaşı,
//    insana devir bekleyen çağrı sayısı. Hasta adı, takma ad, referans, serbest metin, e-posta gönderilmez.
//  - En fazla 15 dakikada bir çağrılır; 15 sn zaman aşımı; yanıt kısa bir Türkçe öneri olarak saklanır.
//  - Öneri yalnız bilgi amaçlıdır; bu modül hiçbir işlem yürütmez (insan onayı gerekir).
import { and, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { approvals, automationEvents, callSessions, integrationEvents, operationalTasks } from "../db/schema";
import { appendAudit } from "./audit";
import { demoEnabled } from "./automation-policy";
import { redactForDisplay } from "./privacy";

type Db = ReturnType<typeof getDb>;
type AiEnv = { aiApiKey?: string; openaiApiKey?: string; aiModel?: string };

export const AI_MONITOR_INTERVAL_MS = 15 * 60_000;
const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const UNIT_CODE = /^[A-Z0-9]{2,8}$/;

function aiEnv(): AiEnv {
  return (globalThis as typeof globalThis & { __KLINORBIS_SECURITY_ENV?: AiEnv }).__KLINORBIS_SECURITY_ENV ?? {};
}
function apiKey() {
  const env = aiEnv();
  return (env.aiApiKey || env.openaiApiKey || "").trim();
}
export function aiConfigured() {
  return apiKey().length > 0;
}

export type AiAggregate = {
  overdueTasksByUnit: Record<string, number>;
  pendingApprovals: { count: number; oldestMinutes: number };
  handoffCalls: number;
};

/** Yalnız sayılardan oluşan özet; birim kodları dışında hiçbir metin içermez. */
export async function collectAggregate(db: Db, now = new Date()): Promise<AiAggregate> {
  const live = !demoEnabled();
  const overdueRows = await db.select({ unitCode: operationalTasks.unitCode, total: sql<number>`count(*)` })
    .from(operationalTasks)
    .where(and(lt(operationalTasks.dueAt, now), notInArray(operationalTasks.status, ["completed", "cancelled", "scheduled"]), live ? sql`source_type not like 'pilot_%'` : undefined))
    .groupBy(operationalTasks.unitCode);
  const [pending] = await db.select({ total: sql<number>`count(*)`, oldest: sql<number | null>`min(${approvals.createdAt})` })
    .from(approvals).where(eq(approvals.status, "pending"));
  const [handoff] = await db.select({ total: sql<number>`count(*)` }).from(callSessions)
    .where(and(inArray(callSessions.status, ["human_handoff"]), live ? eq(callSessions.training, false) : undefined));
  const overdueTasksByUnit: Record<string, number> = {};
  for (const row of overdueRows) if (UNIT_CODE.test(row.unitCode)) overdueTasksByUnit[row.unitCode] = Number(row.total) || 0;
  const oldest = pending?.oldest ? Number(pending.oldest) : 0;
  return {
    overdueTasksByUnit,
    pendingApprovals: { count: Number(pending?.total) || 0, oldestMinutes: oldest ? Math.max(0, Math.round((now.getTime() - oldest) / 60_000)) : 0 },
    handoffCalls: Number(handoff?.total) || 0,
  };
}

/**
 * Zamanlanmış ajan turunda çağrılır. Anahtar yoksa hiçbir şey yapmaz (no-op).
 * Hata ajan turunu bozmaz; yalnız sonuç döner.
 */
export async function runAiMonitor(db: Db, now = new Date()): Promise<{ ran: boolean; reason?: string; suggestion?: string }> {
  const key = apiKey();
  if (!key) return { ran: false, reason: "not_configured" };
  const [last] = await db.select({ receivedAt: integrationEvents.receivedAt }).from(integrationEvents)
    .where(and(eq(integrationEvents.source, "ai-monitor"), gte(integrationEvents.receivedAt, new Date(now.getTime() - AI_MONITOR_INTERVAL_MS))))
    .orderBy(desc(integrationEvents.receivedAt)).limit(1);
  if (last) return { ran: false, reason: "interval" };
  const eventId = `ai-monitor:${now.getTime()}`;
  // Önce kayıt: eşzamanlı iki tur aynı aralıkta iki kez dış çağrı yapmasın.
  await db.insert(integrationEvents).values({ eventId, source: "ai-monitor", eventType: "ai.suggestion", payloadHash: "pending", status: "running", receivedAt: now }).onConflictDoNothing();
  try {
    const aggregate = await collectAggregate(db, now);
    const model = (aiEnv().aiModel || "gpt-4o-mini").trim().slice(0, 60);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Bir hastane operasyon koordinatörüne yardımcı oluyorsun. Yalnız verilen toplam sayılara bakarak en fazla 3 maddelik, kısa ve Türkçe bir operasyonel öneri yaz. Klinik karar verme, hasta hakkında çıkarım yapma; önerilerin insan onayı gerektirdiğini unutma." },
          { role: "user", content: `Birim kodu bazında toplam sayılar (kişisel veri içermez): ${JSON.stringify(aggregate)}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Yapay zekâ hizmeti ${response.status} yanıtı verdi`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = String(data.choices?.[0]?.message?.content || "").trim();
    if (!raw) throw new Error("Yapay zekâ hizmeti boş yanıt verdi");
    const suggestion = redactForDisplay(raw).replace(/\s+\n/g, "\n").slice(0, 800);
    await db.insert(automationEvents).values({ ticketReference: "SYSTEM", rule: "AI_SUGGESTION", outcome: suggestion, unitCode: null, eventType: "ai_suggestion", actor: "ai-monitor" });
    await appendAudit(db, { actor: "ai-monitor", action: "ai.suggestion", resource: "operations:aggregate", detail: "Toplam sayılardan öneri üretildi; onay bekliyor, işlem yapılmadı." });
    await db.update(integrationEvents).set({ status: "completed", payloadHash: "ok" }).where(eq(integrationEvents.eventId, eventId));
    return { ran: true, suggestion };
  } catch (error) {
    await db.update(integrationEvents).set({ status: "failed", payloadHash: (error instanceof Error ? error.message : "hata").slice(0, 120) }).where(eq(integrationEvents.eventId, eventId));
    return { ran: false, reason: "failed" };
  }
}

export async function latestAiSuggestion(db: Db) {
  if (!aiConfigured()) return null;
  const [row] = await db.select({ outcome: automationEvents.outcome, createdAt: automationEvents.createdAt }).from(automationEvents)
    .where(eq(automationEvents.eventType, "ai_suggestion")).orderBy(desc(automationEvents.createdAt)).limit(1);
  return row ? { text: row.outcome, createdAt: row.createdAt } : null;
}
