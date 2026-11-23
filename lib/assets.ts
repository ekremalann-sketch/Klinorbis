// KG1 (adım 1): varlık kaydı. Her cihaz ve ekipmanın tek kimliği (kod + QR), sahibi, yeri, durumu ve bakım/kalibrasyon vadesi.
// Yetki sunucuda: kayıt ve güncelleme yalnız operasyon yöneticisi (her birim) veya birim sorumlusu (yalnız kendi birimi).
// Okuma birimle sınırlıdır. Her değişiklik denetim kaydına yazılır. Klinik bilgi tutulmaz, klinik karar üretilmez.
import { getDb } from "../db";
import { auditHeadConflict, auditStatements } from "./audit";
import { findUnit, HOSPITAL_UNITS } from "./hospital-units";
import { redactPII } from "./privacy";
import { canAccessUnit, SecurityError, type RequestActor } from "./security";

export const ASSET_KINDS = { biyomedikal: { label: "Biyomedikal cihaz", prefix: "BIO" }, teknik: { label: "Teknik ekipman", prefix: "TEK" } } as const;
export const ASSET_STATUSES = { aktif: "Kullanımda", arizali: "Arızalı", bakimda: "Bakımda", hurda: "Hurdaya ayrıldı" } as const;
export const OWNER_TYPES = { hastane: "Hastane demirbaşı", konsinye: "Konsinye / kiralık" } as const;
type Kind = keyof typeof ASSET_KINDS;
type Status = keyof typeof ASSET_STATUSES;
const MANAGERS = ["operations_manager", "unit_manager"];
const DAY = 86_400_000;
const WARN_DAYS = 30;

export type AssetRow = {
  id: number; code: string; name: string; kind: Kind; category: string | null; brand: string | null; model: string | null; serial: string | null;
  owner_type: keyof typeof OWNER_TYPES; unit_code: string; location: string | null; status: Status;
  maintenance_interval_days: number | null; calibration_interval_days: number | null;
  last_maintenance_at: number | null; last_calibration_at: number | null; created_by: string; created_at: number; updated_at: number; version: number;
};
export type Due = { at: number | null; level: "kirmizi" | "sari" | "yesil" | "yok" };

const d1 = () => {
  const d = (globalThis as typeof globalThis & { __KLINORBIS_DB?: D1Database }).__KLINORBIS_DB;
  if (!d) throw new SecurityError(503, "Veritabanı kullanılamıyor.", "DATABASE_UNAVAILABLE");
  return d;
};
const text = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? redactPII(v.trim().slice(0, n)).maskedText : null);
const days = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new SecurityError(400, "Bakım ve kalibrasyon aralığı 1–3650 gün olmalı.", "INVALID_INPUT");
  return n;
};

/** Vade: son işlem + aralık. Aralık yoksa "yok"; aralık var ama hiç işlem yoksa gecikmiş sayılır. */
export function dueOf(last: number | null, intervalDays: number | null, now = Date.now()): Due {
  if (!intervalDays) return { at: null, level: "yok" };
  if (!last) return { at: null, level: "kirmizi" };
  const at = last + intervalDays * DAY;
  return { at, level: at < now ? "kirmizi" : at - now <= WARN_DAYS * DAY ? "sari" : "yesil" };
}
const view = (a: AssetRow, now: number) => ({
  ...a, unitName: findUnit(a.unit_code).name,
  maintenanceDue: dueOf(a.last_maintenance_at, a.maintenance_interval_days, now),
  calibrationDue: dueOf(a.last_calibration_at, a.calibration_interval_days, now),
});

export function canManageUnit(actor: RequestActor, unitCode: string) {
  return MANAGERS.includes(actor.role) && (actor.role === "operations_manager" ? true : actor.unitCodes.includes(unitCode));
}

export async function listAssets(actor: RequestActor, filter: { unit?: string; status?: string; code?: string } = {}, now = Date.now()) {
  const where: string[] = [], args: unknown[] = [];
  if (!actor.canSeeAllUnits) {
    if (!actor.unitCodes.length) return { assets: [], canCreate: false, units: [] };
    where.push(`unit_code IN (${actor.unitCodes.map(() => "?").join(",")})`); args.push(...actor.unitCodes);
  }
  if (filter.unit) { where.push("unit_code=?"); args.push(filter.unit); }
  if (filter.status && filter.status in ASSET_STATUSES) { where.push("status=?"); args.push(filter.status); }
  if (filter.code) { where.push("code=?"); args.push(filter.code.toUpperCase().slice(0, 20)); }
  const rows = (await d1().prepare(`SELECT * FROM assets ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY code LIMIT 500`).bind(...args).all<AssetRow>()).results;
  const units = HOSPITAL_UNITS.filter((u) => canManageUnit(actor, u.code)).map((u) => ({ code: u.code, name: u.name }));
  return { assets: rows.map((r) => view(r, now)), canCreate: units.length > 0, units };
}

export async function createAsset(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const kind = typeof input.kind === "string" && input.kind in ASSET_KINDS ? input.kind as Kind : null;
  if (!kind) throw new SecurityError(400, "Varlık türünü seçin.", "INVALID_INPUT");
  const unit = typeof input.unitCode === "string" ? HOSPITAL_UNITS.find((u) => u.code === input.unitCode) : undefined;
  if (!unit) throw new SecurityError(400, "Sorumlu birimi seçin.", "INVALID_INPUT");
  if (!canManageUnit(actor, unit.code)) throw new SecurityError(403, "Bu birim için varlık kaydı açma yetkiniz yok.", "UNIT_ACCESS_DENIED");
  const name = text(input.name, 80);
  if (!name) throw new SecurityError(400, "Varlık adını yazın.", "INVALID_INPUT");
  const owner = typeof input.ownerType === "string" && input.ownerType in OWNER_TYPES ? input.ownerType : "hastane";
  const mInt = days(input.maintenanceIntervalDays), cInt = days(input.calibrationIntervalDays);
  const prefix = ASSET_KINDS[kind].prefix;
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await d1().prepare("SELECT max(CAST(substr(code,5) AS INTEGER)) AS n FROM assets WHERE code LIKE ?").bind(`${prefix}-%`).first<number>("n");
    const code = `${prefix}-${String(Number(max ?? 0) + 1).padStart(4, "0")}`;
    try {
      const binding = d1();
      const change = binding.prepare(`INSERT INTO assets(code,name,kind,category,brand,model,serial,owner_type,unit_code,location,status,maintenance_interval_days,calibration_interval_days,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?)`).bind(code, name, kind, text(input.category, 60), text(input.brand, 60), text(input.model, 60), text(input.serial, 60),
        owner, unit.code, text(input.location, 80), mInt, cInt, actor.email, now, now);
      const [audit] = await auditStatements(getDb(), [{ actor: actor.email, action: "asset.created", resource: code, detail: `${ASSET_KINDS[kind].label} · ${unit.name}` }]);
      const statement = audit.toSQL();
      await binding.batch([change, binding.prepare(statement.sql).bind(...statement.params)]);
      return { code };
    } catch (error) {
      if (!auditHeadConflict(error) && !/UNIQUE.*assets\.code/i.test(String((error as Error)?.message))) throw error;
    }
  }
  throw new SecurityError(409, "Kod üretilemedi; tekrar deneyin.", "CONFLICT");
}

/** Durum değişikliği veya bakım/kalibrasyon yapıldı kaydı. Sürüm numarası eşzamanlı güncellemeyi engeller. */
export async function updateAsset(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const code = typeof input.code === "string" ? input.code.toUpperCase().slice(0, 20) : "";
  const a = await d1().prepare("SELECT * FROM assets WHERE code=?").bind(code).first<AssetRow>();
  if (!a || !canAccessUnit(actor, a.unit_code)) throw new SecurityError(404, "Varlık bulunamadı.", "NOT_FOUND");
  if (!canManageUnit(actor, a.unit_code)) throw new SecurityError(403, "Varlığı birim sorumlusu veya operasyon yöneticisi günceller.", "UNIT_ACCESS_DENIED");
  if (a.status === "hurda") throw new SecurityError(409, "Hurdaya ayrılan varlık değiştirilemez.", "ASSET_STATE");
  let set: string, val: unknown, detail: string;
  switch (input.change) {
    case "status": {
      const s = typeof input.status === "string" && input.status in ASSET_STATUSES ? input.status as Status : null;
      if (!s || s === a.status) throw new SecurityError(400, "Yeni durumu seçin.", "INVALID_INPUT");
      set = "status=?"; val = s; detail = `${ASSET_STATUSES[a.status]} → ${ASSET_STATUSES[s]}`; break;
    }
    case "maintained": set = "last_maintenance_at=?"; val = now; detail = "Bakım yapıldı olarak işaretlendi"; break;
    case "calibrated": set = "last_calibration_at=?"; val = now; detail = "Kalibrasyon yapıldı olarak işaretlendi"; break;
    default: throw new SecurityError(400, "Bilinmeyen değişiklik.", "INVALID_INPUT");
  }
  const binding = d1();
  const change = binding.prepare(`UPDATE assets SET ${set},updated_at=?,version=version+1 WHERE id=? AND version=?`)
    .bind(val, now, a.id, Number(input.version ?? a.version));
  for (let attempt = 0; attempt < 5; attempt++) {
    const [audit] = await auditStatements(getDb(), [{ actor: actor.email, action: `asset.${input.change}`, resource: a.code, detail }]);
    const statement = audit.toSQL();
    const auditSql = statement.sql.replace(/\bvalues\s*\(([\s\S]*)\)$/i, "select $1 where changes() = 1");
    if (auditSql === statement.sql) throw new Error("Denetim sorgusu hazırlanamadı.");
    try {
      const [result] = await binding.batch([change, binding.prepare(auditSql).bind(...statement.params)]);
      if (!Number(result.meta?.changes ?? 0)) throw new SecurityError(409, "Kayıt başka biri tarafından değiştirildi; sayfayı yenileyin.", "VERSION_CONFLICT");
      return { code: a.code };
    } catch (error) {
      if (!auditHeadConflict(error)) throw error;
    }
  }
  throw new SecurityError(409, "Denetim kaydı çakıştı; tekrar deneyin.", "CONFLICT");
}
