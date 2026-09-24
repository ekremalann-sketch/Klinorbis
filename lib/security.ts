import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { rateLimitCounters, securityEvents, staffAccounts, unitMemberships } from "../db/schema";

export type SystemRole = "operations_manager" | "unit_manager" | "clinician" | "call_agent" | "privacy_officer" | "security_officer";
export type RequestActor = {
  email: string;
  label: string;
  role: SystemRole;
  unitCodes: string[];
  canSeeAllUnits: boolean;
};

export class SecurityError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

type RuntimeSecurityEnv = {
  ownerEmail?: string;
  ownerAccountUserId?: string;
  webhookSecret?: string;
  n8nWebhookUrl?: string;
  n8nSharedSecret?: string;
};

function runtimeEnv(): RuntimeSecurityEnv {
  return (globalThis as typeof globalThis & { __KLINORBIS_SECURITY_ENV?: RuntimeSecurityEnv }).__KLINORBIS_SECURITY_ENV ?? {};
}

export function requestId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[a-zA-Z0-9._:-]{8,96}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function cleanText(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw new SecurityError(400, `${field} metin olmalıdır.`, "INVALID_INPUT");
  const cleaned = value.normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (cleaned.length < min || cleaned.length > max) throw new SecurityError(400, `${field} ${min}-${max} karakter olmalıdır.`, "INVALID_INPUT");
  return cleaned;
}

export function assertJsonRequest(request: Request, maxBytes = 32_768) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new SecurityError(415, "Yalnız JSON istekleri kabul edilir.", "UNSUPPORTED_MEDIA_TYPE");
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > maxBytes) throw new SecurityError(413, "İstek gövdesi çok büyük.", "PAYLOAD_TOO_LARGE");
}

export function assertBrowserMutation(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) {
    throw new SecurityError(403, "Başka kökenden gelen işlem engellendi.", "CSRF_BLOCKED");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new SecurityError(403, "Siteler arası işlem engellendi.", "CSRF_BLOCKED");
  }
  // The Sites dispatch layer may remove application-specific request headers.
  // Accept a verified same-origin browser request as the CSRF proof in that case.
  const hasAppHeader = request.headers.get("x-klinorbis-request") === "browser";
  const hasSameOriginProof = origin === requestOrigin && fetchSite === "same-origin";
  if (!hasAppHeader && !hasSameOriginProof) {
    throw new SecurityError(403, "Güvenli işlem doğrulaması eksik.", "CSRF_BLOCKED");
  }
}

export async function requireActor(request: Request): Promise<RequestActor> {
  const db = getDb();
  const host = new URL(request.url).hostname;
  const isAgentPreview = host === "terminal.local" || host === "localhost" || host === "127.0.0.1";
  const headerEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const headerUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const ownerEmail = runtimeEnv().ownerEmail?.trim().toLowerCase();
  const ownerAccountUserId = runtimeEnv().ownerAccountUserId?.trim();

  if (!headerEmail && !isAgentPreview) throw new SecurityError(401, "Kimlik doğrulaması gerekli.", "AUTH_REQUIRED");
  const email = headerEmail || "agent-preview@local.invalid";
  const owner = Boolean(
    (ownerEmail && email === ownerEmail) ||
    (ownerAccountUserId && headerUserId === ownerAccountUserId) ||
    isAgentPreview,
  );

  if (owner) {
    // Keep authenticated reads side-effect free. Writing last-seen telemetry on
    // every 2.5-second dashboard refresh caused D1 contention during startup.
    return { email, label: isAgentPreview ? "Güvenli Önizleme" : "Yetkili Kullanıcı", role: "operations_manager", unitCodes: [], canSeeAllUnits: true };
  }

  const [account] = await db.select().from(staffAccounts).where(and(eq(staffAccounts.email, email), eq(staffAccounts.active, true))).limit(1);
  if (!account) throw new SecurityError(403, "Bu kullanıcıya KLINORBIS görevi atanmadı.", "NO_ROLE");
  const memberships = await db.select().from(unitMemberships).where(and(eq(unitMemberships.email, email), eq(unitMemberships.active, true)));
  return {
    email,
    label: account.displayLabel,
    role: account.systemRole as SystemRole,
    unitCodes: memberships.map((membership) => membership.unitCode),
    canSeeAllUnits: account.systemRole === "operations_manager" || account.systemRole === "privacy_officer" || account.systemRole === "security_officer",
  };
}

export function canAccessUnit(actor: RequestActor, unitCode: string) {
  return actor.canSeeAllUnits || actor.unitCodes.includes(unitCode);
}

export function requireUnitAccess(actor: RequestActor, unitCode: string) {
  if (!canAccessUnit(actor, unitCode)) throw new SecurityError(403, "Bu birimin kayıtlarına erişim yetkiniz yok.", "UNIT_ACCESS_DENIED");
}

export async function enforceRateLimit(request: Request, actor: RequestActor, action: string, limit = 60, windowSeconds = 60) {
  const db = getDb();
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const key = await sha256(`${actor.email}|${action}|${windowStart}`);
  const expiresAt = new Date(windowStart + windowSeconds * 1000);
  await db.insert(rateLimitCounters).values({ key, count: 1, expiresAt }).onConflictDoUpdate({
    target: rateLimitCounters.key,
    set: { count: sql`${rateLimitCounters.count} + 1`, expiresAt },
  });
  const [counter] = await db.select().from(rateLimitCounters).where(and(eq(rateLimitCounters.key, key), gt(rateLimitCounters.expiresAt, new Date()))).limit(1);
  if ((counter?.count ?? 0) > limit) {
    await recordSecurityEvent(request, "rate_limit", "high", actor.email, `${action} sınırı aşıldı`);
    throw new SecurityError(429, "Çok fazla işlem yapıldı. Kısa süre sonra tekrar deneyin.", "RATE_LIMITED");
  }
}

export async function recordSecurityEvent(request: Request, eventType: string, severity: "low" | "medium" | "high" | "critical", actor: string, detail: string) {
  try {
    const db = getDb();
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await sha256(`${runtimeEnv().webhookSecret || "local-security-salt"}|${ip}`);
    await db.insert(securityEvents).values({ requestId: requestId(request), eventType, severity, actor, ipHash, path: new URL(request.url).pathname, detail: cleanLog(detail) });
  } catch {
    // Security logging must not disclose data or turn a blocked request into a success.
  }
}

export function securityResponse(error: unknown, request: Request) {
  if (error instanceof SecurityError) {
    void recordSecurityEvent(request, error.code.toLowerCase(), error.status >= 500 ? "critical" : error.status >= 403 ? "high" : "medium", request.headers.get("oai-authenticated-user-email") || "anonymous", error.message);
    return Response.json({ error: error.message, code: error.code, requestId: requestId(request) }, { status: error.status });
  }
  const id = requestId(request);
  void recordSecurityEvent(request, "server_error", "critical", request.headers.get("oai-authenticated-user-email") || "anonymous", `Beklenmeyen hata · ${id}`);
  return Response.json({ error: "İşlem güvenli biçimde tamamlanamadı.", code: "SERVER_ERROR", requestId: id }, { status: 500 });
}

export function getWebhookSecret() {
  return runtimeEnv().webhookSecret;
}

export function getN8nRuntimeConfig() {
  const value = runtimeEnv();
  return {
    webhookUrl: value.n8nWebhookUrl,
    sharedSecret: value.n8nSharedSecret,
  };
}

export function automationConnectorStatus() {
  const config = getN8nRuntimeConfig();
  const n8nConfigured = Boolean(config.webhookUrl && config.sharedSecret);
  const schedulerSigningReady = Boolean(config.sharedSecret);
  return [
    {
      id: "klinorbis-worker",
      name: "KLINORBIS Flow Engine",
      provider: "Cloudflare Worker + D1",
      state: "active",
      truthLabel: "Canlı ve kalıcı",
      configuration: { endpointConfigured: true, signingKeyConfigured: true },
      detail: "Ana iş kuralları, kuyruk, idempotency, retry ve denetim bu motor üzerinde çalışır.",
    },
    {
      id: "capacity-orchestrator",
      name: "Kapasite ve Sevk Karar Motoru",
      provider: "KLINORBIS Worker + D1",
      state: "active",
      truthLabel: "Canlı pilot karar motoru",
      configuration: { endpointConfigured: true, signingKeyConfigured: true },
      detail: "Kimliksiz pilot kaynak verisini kapasite, vardiya, rezervasyon, blokaj ve alternatif kampüs kurallarıyla otomatik kabul/ret/yeniden yönlendirme kararına dönüştürür.",
    },
    {
      id: "n8n-self-hosted",
      name: "Self-hosted n8n adaptörü",
      provider: "n8n",
      state: n8nConfigured ? "connected" : "adapter_ready",
      truthLabel: n8nConfigured
        ? "Bağlantı yapılandırıldı"
        : schedulerSigningReady
          ? "İmzalı zamanlayıcı hazır · n8n adresi yok"
          : "Adaptör hazır · sunucu adresi yok",
      configuration: {
        endpointConfigured: Boolean(config.webhookUrl),
        signingKeyConfigured: Boolean(config.sharedSecret),
      },
      detail: n8nConfigured
        ? "Kimliksiz olay metadatası imzalı webhook ile kurum içi n8n orkestrasyonuna gönderilebilir."
        : schedulerSigningReady
          ? "Makineden makineye ajan tetikleyicisinin HMAC anahtarı üretimde hazır; dış n8n sunucu URL'si tanımlanana kadar bağlı sayılmaz."
          : "İçe aktarılabilir akış paketi ve imzalı webhook sözleşmesi hazır; harici n8n çalışıyor gibi gösterilmez.",
    },
    {
      id: "hospital-pbx",
      name: "Kurum santrali",
      provider: "HMAC webhook",
      state: getWebhookSecret() ? "adapter_ready" : "not_configured",
      truthLabel: getWebhookSecret() ? "Güvenli alıcı hazır" : "Kurum anahtarı bekleniyor",
      configuration: { endpointConfigured: false, signingKeyConfigured: Boolean(getWebhookSecret()) },
      detail: "Gerçek çağrının otomatik açılması için santralin imzalı olay göndermesi gerekir.",
    },
    {
      id: "hbys",
      name: "HBYS randevu ve kaynak adaptörü",
      provider: "FHIR / HL7 / kurum API",
      state: "not_configured",
      truthLabel: "Sandbox bağlantısı bekleniyor",
      configuration: { endpointConfigured: false, signingKeyConfigured: false },
      detail: "Kesin doktor, slot, yatak veya klinik sonuç bilgisi bağlantı olmadan üretilmez.",
    },
  ] as const;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanLog(value: string) {
  return value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").slice(0, 500);
}
