// Türkiye çekirdeği HTTP sunucusu (node:http, ek bağımlılık yok). Hastane ağında veya Türkiye'deki veri merkezinde çalışır.
// - /yatak, /temizlik, /entegrasyon: Türkçe ekranlar (sunucu tarafında üretilen sayfa + küçük betik)
// - /api/…: JSON API (vekil imzalı kimlik, yetki kontrolü, RLS bağlamı, denetim izi)
// - /bridge/adt: hastane köprüsünden imzalı HL7 v2 mesajı (ACK döner)
// Güvenlik: katı CSP (nonce), çerçeveleme yasak, önbellek yok, POST için aynı köken + özel başlık, gövde sınırı.
// Hata yanıtı ve günlükte kişisel/klinik veri yer almaz.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { withContext, type Database } from "../db.ts";
import type { Keyring } from "../crypto.ts";
import { authenticate, contextOf, requirePermission, type Principal } from "./auth.ts";
import { ServiceError, invalid, notFound } from "../services/errors.ts";
import { bedBoard, blockBed, releaseReservation, reserveBed, unblockBed, type BlockReason } from "../services/beds.ts";
import { acceptJob, cancelJob, cleaningQueue, completeJob, inspectJob, startJob } from "../services/cleaning.ts";
import { addMapping, ignoreMessage, listMappings, messageOverview, reconcile, retryMessage } from "../services/integration.ts";
import { buildAck, Hl7Error, parseAdt } from "../bridge/hl7v2.ts";
import { ingestAdt, recordFailure } from "../bridge/ingest.ts";
import { databaseNonceStore, verify, type NonceStore } from "../bridge/signer.ts";
import { page } from "./pages.ts";

export type ServerConfig = {
  db: Database;
  proxySecret: string;
  keyrings: (tenantId: string) => Promise<Keyring>;
  bridgeClients: Record<string, { secret: string; tenantId: string }>;
  nonces?: NonceStore;
  cleaningUnitCode?: string;
};
const MAX_BODY = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > MAX_BODY) throw new ServiceError(413, "TOO_LARGE", "İstek gövdesi çok büyük."); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString("utf8");
}
function send(res: ServerResponse, status: number, body: string, type: string, nonce?: string) {
  res.writeHead(status, {
    "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": `default-src 'self'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  });
  res.end(body);
}
const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data), "application/json; charset=utf-8");

function assertMutation(req: IncomingMessage) {
  if (req.headers["x-kb-request"] !== "1") throw new ServiceError(403, "CSRF", "Güvenli işlem doğrulaması eksik.");
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new ServiceError(403, "CSRF", "Başka kökenden gelen işlem engellendi.");
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new ServiceError(415, "JSON_REQUIRED", "Yalnız JSON kabul edilir.");
}
const parseJson = (raw: string) => { try { const v = raw ? JSON.parse(raw) : {}; if (typeof v !== "object" || v === null || Array.isArray(v)) throw 0; return v as Record<string, unknown>; } catch { throw invalid("Geçersiz JSON."); } };
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function createCoreServer(cfg: ServerConfig) {

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://core.local");
    const path = url.pathname, method = req.method ?? "GET";

    if (path === "/saglik") {
      const ok = await cfg.db.query("SELECT 1").then(() => true, () => false);
      return json(res, ok ? 200 : 503, { ok, veritabani: ok ? "bağlı" : "erişilemiyor", zaman: new Date().toISOString() });
    }

    if (path === "/bridge/adt" && method === "POST") return bridge(req, res);

    const principal = await authenticate(cfg.db, cfg.proxySecret, req.headers);
    const ctx = contextOf(principal);
    const run = <T>(fn: Parameters<typeof withContext<T>>[2]) => withContext(cfg.db, ctx, fn);

    if (method === "GET" && (path === "/" || path === "/yatak" || path === "/temizlik" || path === "/entegrasyon")) {
      if (path === "/entegrasyon") requirePermission(principal, "integration.manage");
      if (path === "/") { res.writeHead(302, { location: "/yatak" }); return res.end(); }
      const nonce = randomBytes(16).toString("base64");
      return send(res, 200, page(path.slice(1) as "yatak" | "temizlik" | "entegrasyon", principal, nonce), "text/html; charset=utf-8", nonce);
    }
    if (method === "GET" && path === "/api/me") return json(res, 200, { label: principal.label, roles: principal.roles, permissions: [...principal.permissions] });
    if (method === "GET" && path === "/api/beds") return json(res, 200, await run((tx) => bedBoard(tx)));
    if (method === "GET" && path === "/api/cleaning") return json(res, 200, { jobs: await run((tx) => cleaningQueue(tx)) });
    if (method === "GET" && path === "/api/integration") {
      requirePermission(principal, "integration.manage");
      return json(res, 200, await run(async (tx) => ({ ...(await messageOverview(tx)), mappings: await listMappings(tx),
        units: (await tx.query("SELECT id, code, name FROM kb.units WHERE active ORDER BY name")).rows,
        beds: (await tx.query("SELECT b.id, b.code, r.code AS room_code, u.code AS unit_code FROM kb.beds b JOIN kb.rooms r ON r.id = b.room_id JOIN kb.units u ON u.id = b.unit_id ORDER BY u.code, r.code, b.code")).rows })));
    }

    const m = /^\/api\/(beds|cleaning|integration\/messages)\/([0-9a-f-]{36})\/([a-z]+)$/.exec(path);
    if (method === "POST" && (m || path === "/api/integration/mappings" || path === "/api/integration/reconcile")) {
      assertMutation(req);
      const body = parseJson(await readBody(req));
      if (path === "/api/integration/mappings") {
        requirePermission(principal, "integration.manage");
        const id = await run((tx) => addMapping(tx, principal.tenantId, { kind: body.kind === "bed" ? "bed" : "unit", externalCode: str(body.externalCode, 60), unitId: UUID.test(str(body.unitId)) ? str(body.unitId) : undefined, bedId: UUID.test(str(body.bedId)) ? str(body.bedId) : undefined }, principal.subject));
        return json(res, 201, { ok: true, id });
      }
      if (path === "/api/integration/reconcile") {
        requirePermission(principal, "integration.manage");
        const keys = await cfg.keyrings(principal.tenantId);
        return json(res, 200, await run((tx) => reconcile(tx, principal.tenantId, keys, body.census as never, principal.subject)));
      }
      const [, area, id, action] = m!;
      if (!UUID.test(id)) throw invalid("Geçersiz kayıt.");
      if (area === "beds") {
        requirePermission(principal, "bed.update");
        await run(async (tx) => {
          if (action === "block") await blockBed(tx, id, str(body.reason) as BlockReason, str(body.note) || null, principal.subject);
          else if (action === "unblock") await unblockBed(tx, id);
          else if (action === "reserve") await reserveBed(tx, id, str(body.forRef, 50).toUpperCase(), Number(body.minutes), principal.subject);
          else if (action === "release") await releaseReservation(tx, id);
          else throw notFound("İşlem");
          await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource) VALUES ($1, $2, $3, $4)", [principal.tenantId, principal.subject, 'bed.'+action, id]);
        });
        return json(res, 200, { ok: true });
      }
      if (area === "cleaning") {
        const unit = await cleaningUnit(principal);
        if (action === "inspect") requirePermission(principal, "cleaning.inspect"); else requirePermission(principal, "cleaning.work");
        const out = await run(async (tx) => {
          await tx.query("INSERT INTO audit.events (tenant_id, actor, action, resource) VALUES ($1, $2, $3, $4)", [principal.tenantId, principal.subject, `cleaning.${action}`, id]);
          if (action === "accept") return acceptJob(tx, id, principal.subject);
          if (action === "start") return startJob(tx, id, principal.subject);
          if (action === "complete") return completeJob(tx, id, principal.subject, Array.isArray(body.checklist) ? (body.checklist as string[]).slice(0, 20) : []);
          if (action === "inspect") return inspectJob(tx, id, principal.subject, body.passed === true, unit);
          if (action === "cancel") return cancelJob(tx, id, str(body.reason), principal.subject);
          throw notFound("İşlem");
        });
        return json(res, 200, { ok: true, result: out ?? null });
      }
      requirePermission(principal, "integration.manage");
      if (action === "retry") return json(res, 200, await retryMessage(cfg.db, principal.tenantId, await cfg.keyrings(principal.tenantId), id, principal.subject));
      if (action === "ignore") { await run((tx) => ignoreMessage(tx, principal.tenantId, id, str(body.reason, 300), principal.subject)); return json(res, 200, { ok: true }); }
      throw notFound("İşlem");
    }
    throw notFound("Sayfa");
  };

  async function cleaningUnit(p: Principal) {
    const r = await withContext(cfg.db, contextOf(p), (tx) => tx.query<{ id: string }>("SELECT id FROM kb.units WHERE code = $1 AND active LIMIT 1", [cfg.cleaningUnitCode ?? "CTM"]));
    if (!r.rows[0]) throw new ServiceError(500, "CONFIG", "Temizlik birimi tanımlı değil.");
    return r.rows[0].id;
  }

  async function bridge(req: IncomingMessage, res: ServerResponse) {
    const raw = await readBody(req);
    const keyId = String(req.headers["x-kb-key-id"] ?? "");
    const client = cfg.bridgeClients[keyId];
    const env = { keyId, timestamp: String(req.headers["x-kb-timestamp"] ?? ""), nonce: String(req.headers["x-kb-nonce"] ?? ""), signature: String(req.headers["x-kb-signature"] ?? "") };
    if (!client || !(await verify(client.secret, env, raw, cfg.nonces ?? databaseNonceStore(cfg.db, client.tenantId))).ok) return send(res, 401, buildAck(raw, "AR", "Kimlik doğrulanamadı"), "application/hl7-v2; charset=utf-8");
    let msg;
    try { msg = parseAdt(raw); } catch (e) {
      const ctrl = /\|ADT\^[A-Z0-9]+\|([^|]+)\|/.exec(raw)?.[1] ?? "BILINMIYOR";
      await recordFailure(cfg.db, client.tenantId, ctrl, "ADT", raw, "PARSE");
      return send(res, 200, buildAck(raw, e instanceof Hl7Error ? e.code : "AE", e instanceof Error ? e.message : "Hata"), "application/hl7-v2; charset=utf-8");
    }
    const result = await ingestAdt(cfg.db, { tenantId: client.tenantId, cleaningUnitCode: cfg.cleaningUnitCode }, await cfg.keyrings(client.tenantId), msg, raw);
    // Karantina da "alındı" sayılır (AA): mesaj kaybolmaz, insan çözer; kaynak sistemin sonsuz yeniden gönderimi önlenir.
    return send(res, 200, buildAck(raw, "AA", result.status === "quarantined" ? `Karantina: ${result.reason}` : result.status), "application/hl7-v2; charset=utf-8");
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof ServiceError) return json(res, error.status, { error: error.message, code: error.code });
      const pg = error as { code?: string; message?: string };
      if (pg?.code === "23505") return json(res, 409, { error: "Kayıt başka bir işlemle değişti; sayfayı yenileyin.", code: "CONFLICT" });
      if (pg?.code === "23514" || pg?.code === "P0001") return json(res, 409, { error: "İşlem kurallara uymuyor; kaydın güncel durumunu kontrol edin.", code: "RULE" });
      // Ayrıntı günlüğe yalnız hata kodu olarak yazılır (kişisel veri sızmasın).
      console.error("cekirdek-hata", pg?.code ?? "bilinmeyen");
      return json(res, 500, { error: "Beklenmeyen bir hata oluştu.", code: "INTERNAL" });
    });
  });
}
