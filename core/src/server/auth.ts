// Kimlik: hastanenin tek oturum açma (SSO) vekili (ör. Keycloak/AD önünde çalışan ters vekil) kullanıcıyı doğrular ve
// isteğe imzalı başlıklar ekler: x-kb-tenant, x-kb-subject, x-kb-time, x-kb-signature = HMAC(gizli, "kurum.konu.zaman").
// Çekirdek bu imzayı doğrular, kişiyi kendi personel tablosundan bulur ve rol/birim kapsamını veritabanından kurar.
// Vekil gizli anahtarı yalnız ortam değişkeninde tutulur. 2 dakikalık zaman penceresi uygulanır.
import { createHmac } from "node:crypto";
import { safeEqualHex } from "../crypto.ts";
import { withContext, type Context, type Database } from "../db.ts";
import { ServiceError } from "../services/errors.ts";

export type Principal = { tenantId: string; tenantCode: string; subject: string; staffId: string; label: string; roles: string[]; permissions: Set<string>; unitIds: string[]; allUnits: boolean };
const WINDOW = 2 * 60_000;

export function signProxyHeaders(secret: string, tenant: string, subject: string, now = Date.now()) {
  const time = String(now);
  return { "x-kb-tenant": tenant, "x-kb-subject": subject, "x-kb-time": time, "x-kb-signature": createHmac("sha256", secret).update(`${tenant}.${subject}.${time}`).digest("hex") };
}

export async function authenticate(db: Database, secret: string, h: Record<string, string | string[] | undefined>, now = Date.now()): Promise<Principal> {
  const one = (k: string) => { const v = h[k]; return Array.isArray(v) ? v[0] : v; };
  const tenant = one("x-kb-tenant") ?? "", subject = one("x-kb-subject") ?? "", time = one("x-kb-time") ?? "", sig = one("x-kb-signature") ?? "";
  if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(tenant) || !subject || subject.length > 200 || !/^\d{13}$/.test(time) || !/^[0-9a-f]{64}$/.test(sig)) throw new ServiceError(401, "AUTH_REQUIRED", "Oturum açmanız gerekiyor.");
  if (Math.abs(now - Number(time)) > WINDOW) throw new ServiceError(401, "AUTH_EXPIRED", "Oturum doğrulaması zaman aşımına uğradı; sayfayı yenileyin.");
  const expected = createHmac("sha256", secret).update(`${tenant}.${subject}.${time}`).digest("hex");
  if (!safeEqualHex(expected, sig)) throw new ServiceError(401, "AUTH_INVALID", "Oturum doğrulanamadı.");
  const tenantId = (await db.transaction(async (tx) => { await tx.query("SET LOCAL ROLE kb_app"); return (await tx.query<{ id: string | null }>("SELECT kb.tenant_id_by_code($1) AS id", [tenant])).rows[0]?.id; }));
  if (!tenantId) throw new ServiceError(403, "NO_TENANT", "Kurum bulunamadı.");
  return withContext(db, { tenantId, actor: subject }, async (tx) => {
    const s = (await tx.query<{ id: string; display_label: string }>("SELECT id, display_label FROM kb.staff WHERE external_subject = $1 AND active", [subject])).rows[0];
    if (!s) throw new ServiceError(403, "NO_ROLE", "Bu kullanıcıya Klinorbis görevi atanmamış.");
    const roles = (await tx.query<{ role_code: string }>("SELECT role_code FROM kb.staff_roles WHERE staff_id = $1 AND (expires_at IS NULL OR expires_at > now())", [s.id])).rows.map((r) => r.role_code);
    const perms = (await tx.query<{ permission_code: string }>("SELECT DISTINCT rp.permission_code FROM kb.role_permissions rp WHERE rp.role_code = ANY($1::text[])", [roles])).rows.map((r) => r.permission_code);
    const units = (await tx.query<{ unit_id: string }>("SELECT unit_id FROM kb.unit_memberships WHERE staff_id = $1 AND active", [s.id])).rows.map((r) => r.unit_id);
    return { tenantId, tenantCode: tenant, subject, staffId: s.id, label: s.display_label, roles, permissions: new Set(perms), unitIds: units, allUnits: roles.includes("operations_manager") };
  });
}

export function contextOf(p: Principal): Context {
  return { tenantId: p.tenantId, actor: p.subject, unitIds: p.unitIds, allUnits: p.allUnits };
}
export function requirePermission(p: Principal, perm: string) {
  if (!p.permissions.has(perm)) throw new ServiceError(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.");
}
