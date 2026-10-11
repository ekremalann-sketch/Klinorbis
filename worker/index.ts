/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { runAutomationAgent } from "../lib/agent-runtime";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  KLINORBIS_LOG_SALT?: string;
  KLINORBIS_AUDIT_HMAC_KEY?: string;
  KLINORBIS_DEMO_ENABLED?: string;
  KLINORBIS_OWNER_EMAIL?: string;
  KLINORBIS_OWNER_ACCOUNT_USER_ID?: string;
  KLINORBIS_WEBHOOK_SECRET?: string;
  KLINORBIS_N8N_WEBHOOK_URL?: string;
  KLINORBIS_N8N_SHARED_SECRET?: string;
  KLINORBIS_AI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  KLINORBIS_AI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setRuntime(env);
    const url = new URL(request.url);
    if (!['klinorbis.ekremalan.chatgpt.site','localhost','127.0.0.1','terminal.local'].includes(url.hostname)) {
      return new Response("Bu erişim adresi desteklenmiyor.",{status:403,headers:{"cache-control":"no-store"}});
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, request);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response, request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    setRuntime(env);
    // Cron tetikleyicisi (vite.config.ts → triggers.crons). Durdurma anahtarı runAutomationAgent içinde uygulanır;
    // hata yakalanır ki zamanlanmış tur çökse bile sonraki tur engellenmesin.
    const db = drizzle(env.DB, { schema });
    ctx.waitUntil(runAutomationAgent(db, "scheduled-worker").then(() => undefined, (error) => { console.error("Zamanlanmış otomasyon turu başarısız", error instanceof Error ? error.message : "bilinmeyen hata"); }));
  },
};

function setRuntime(env: Env) {
  (globalThis as typeof globalThis & { __KLINORBIS_DB?: D1Database }).__KLINORBIS_DB = env.DB;
  (globalThis as typeof globalThis & { __KLINORBIS_SECURITY_ENV?: Record<string, string | undefined> }).__KLINORBIS_SECURITY_ENV = {
    securityLogSalt: env.KLINORBIS_LOG_SALT,
    auditHmacKey: env.KLINORBIS_AUDIT_HMAC_KEY,
    ownerEmail: env.KLINORBIS_OWNER_EMAIL,
    ownerAccountUserId: env.KLINORBIS_OWNER_ACCOUNT_USER_ID,
    webhookSecret: env.KLINORBIS_WEBHOOK_SECRET,
    n8nWebhookUrl: env.KLINORBIS_N8N_WEBHOOK_URL,
    n8nSharedSecret: env.KLINORBIS_N8N_SHARED_SECRET,
    aiApiKey: env.KLINORBIS_AI_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    aiModel: env.KLINORBIS_AI_MODEL,
  };
  (globalThis as typeof globalThis & { __KLINORBIS_DEMO_ENABLED?: string }).__KLINORBIS_DEMO_ENABLED = env.KLINORBIS_DEMO_ENABLED;
}

async function withSecurityHeaders(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  const isHtml = headers.get("content-type")?.toLowerCase().includes("text/html") && request.method !== "HEAD";
  const nonce = isHtml ? createNonce() : null;
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : "";
  headers.set("Content-Security-Policy", `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'${nonceSource}; style-src 'self'${nonceSource}; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-KLINORBIS-Request-Id", request.headers.get("x-request-id") || crypto.randomUUID());
  if (request.url.startsWith("https://")) headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (new URL(request.url).pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store, private");
  let body: BodyInit | null = response.body;
  if (isHtml && nonce) {
    const html = await response.text();
    body = html
      .replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
      .replace(/<style\b(?![^>]*\bnonce=)([^>]*)>/gi, `<style nonce="${nonce}"$1>`);
    headers.delete("content-length");
    headers.set("Cache-Control", "no-store, private");
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

export default worker;
