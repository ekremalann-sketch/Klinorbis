// KG1 (adım 1): varlık kaydı. Her cihaz ve ekipmanın tek kimliği (kod + QR), sahibi, yeri, durumu ve bakım/kalibrasyon vadesi.
// Yetki sunucuda: kayıt ve güncelleme yalnız operasyon yöneticisi (her birim) veya birim sorumlusu (yalnız kendi birimi).
// Okuma birimle sınırlıdır. Her değişiklik denetim kaydına yazılır. Klinik bilgi tutulmaz, klinik karar üretilmez.
import { getDb } from "../db";
import { appendAudit, auditStatements } from "./audit";
import { notificationStatements } from "./notifications";
import { newReference, runBatch, runStatements, stepNotifications } from "./playbook-store";
import { playbookOf } from "./playbooks";
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
    const own = "code IN (SELECT asset_code FROM asset_custody WHERE holder_email=? AND returned_at IS NULL)";
    where.push(actor.unitCodes.length ? `(unit_code IN (${actor.unitCodes.map(() => "?").join(",")}) OR ${own})` : own);
    args.push(...actor.unitCodes, actor.email);
  }
  if (filter.unit) { where.push("unit_code=?"); args.push(filter.unit); }
  if (filter.status && Object.hasOwn(ASSET_STATUSES, filter.status)) { where.push("status=?"); args.push(filter.status); }
  if (filter.code) { where.push("code=?"); args.push(filter.code.toUpperCase().slice(0, 20)); }
  const rows = (await d1().prepare(`SELECT assets.*,c.holder_email AS holder,c.accepted_at AS custody_accepted_at FROM assets
    LEFT JOIN asset_custody c ON c.asset_code=assets.code AND c.returned_at IS NULL ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY code LIMIT 500`).bind(...args).all<AssetRow & { holder: string | null; custody_accepted_at: number | null }>()).results;
  const units = HOSPITAL_UNITS.filter((u) => canManageUnit(actor, u.code)).map((u) => ({ code: u.code, name: u.name }));
  return { assets: rows.map((r) => ({ ...view(r, now), custody: r.holder ? { holder: r.holder, accepted: !!r.custody_accepted_at, mine: r.holder === actor.email } : null })), canCreate: units.length > 0, units, me: actor.email };
}

export async function createAsset(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const kind = typeof input.kind === "string" && Object.hasOwn(ASSET_KINDS, input.kind) ? input.kind as Kind : null;
  if (!kind) throw new SecurityError(400, "Varlık türünü seçin.", "INVALID_INPUT");
  const unit = typeof input.unitCode === "string" ? HOSPITAL_UNITS.find((u) => u.code === input.unitCode) : undefined;
  if (!unit) throw new SecurityError(400, "Sorumlu birimi seçin.", "INVALID_INPUT");
  if (!canManageUnit(actor, unit.code)) throw new SecurityError(403, "Bu birim için varlık kaydı açma yetkiniz yok.", "UNIT_ACCESS_DENIED");
  const name = text(input.name, 80);
  if (!name) throw new SecurityError(400, "Varlık adını yazın.", "INVALID_INPUT");
  const owner = typeof input.ownerType === "string" && Object.hasOwn(OWNER_TYPES, input.ownerType) ? input.ownerType : "hastane";
  const mInt = days(input.maintenanceIntervalDays), cInt = days(input.calibrationIntervalDays);
  const prefix = ASSET_KINDS[kind].prefix;
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await d1().prepare("SELECT max(CAST(substr(code,5) AS INTEGER)) AS n FROM assets WHERE code LIKE ?").bind(`${prefix}-%`).first<number>("n");
    const code = `${prefix}-${String(Number(max ?? 0) + 1).padStart(4, "0")}`;
    try {
      await d1().prepare(`INSERT INTO assets(code,name,kind,category,brand,model,serial,owner_type,unit_code,location,status,maintenance_interval_days,calibration_interval_days,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?)`).bind(code, name, kind, text(input.category, 60), text(input.brand, 60), text(input.model, 60), text(input.serial, 60),
        owner, unit.code, text(input.location, 80), mInt, cInt, actor.email, now, now).run();
      await appendAudit(getDb(), { actor: actor.email, action: "asset.created", resource: code, detail: `${ASSET_KINDS[kind].label} · ${unit.name}` });
      return { code };
    } catch (error) {
      if (!/UNIQUE/i.test(String((error as Error)?.message))) throw error;
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
      const s = typeof input.status === "string" && Object.hasOwn(ASSET_STATUSES, input.status) ? input.status as Status : null;
      if (!s || s === a.status) throw new SecurityError(400, "Yeni durumu seçin.", "INVALID_INPUT");
      set = "status=?"; val = s; detail = `${ASSET_STATUSES[a.status]} → ${ASSET_STATUSES[s]}`; break;
    }
    case "maintained": set = "last_maintenance_at=?"; val = now; detail = "Bakım yapıldı olarak işaretlendi"; break;
    case "calibrated": set = "last_calibration_at=?"; val = now; detail = "Kalibrasyon yapıldı olarak işaretlendi"; break;
    default: throw new SecurityError(400, "Bilinmeyen değişiklik.", "INVALID_INPUT");
  }
  const r = await d1().prepare(`UPDATE assets SET ${set},updated_at=?,version=version+1 WHERE id=? AND version=?`).bind(val, now, a.id, Number(input.version ?? a.version)).run();
  if (!Number(r.meta?.changes ?? 0)) throw new SecurityError(409, "Kayıt başka biri tarafından değiştirildi; sayfayı yenileyin.", "VERSION_CONFLICT");
  await appendAudit(getDb(), { actor: actor.email, action: `asset.${input.change}`, resource: a.code, detail });
  return { code: a.code };
}

// ---- KG1 (adım 2): zimmet ----
async function openAsset(actor: RequestActor, rawCode: unknown) {
  const code = typeof rawCode === "string" ? rawCode.toUpperCase().slice(0, 20) : "";
  const a = await d1().prepare("SELECT * FROM assets WHERE code=?").bind(code).first<AssetRow>();
  const c = a ? await d1().prepare("SELECT * FROM asset_custody WHERE asset_code=? AND returned_at IS NULL").bind(a.code).first<{ id: number; holder_email: string; given_at: number; accepted_at: number | null }>() : null;
  if (!a || (!canAccessUnit(actor, a.unit_code) && c?.holder_email !== actor.email)) throw new SecurityError(404, "Varlık bulunamadı.", "NOT_FOUND");
  return { a, c };
}

/** Yönetici varlığı etkin bir personele zimmetler; personele "onay bekliyor" bildirimi gider. */
export async function assignCustody(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const { a } = await openAsset(actor, input.code);
  if (!canManageUnit(actor, a.unit_code)) throw new SecurityError(403, "Zimmeti birim sorumlusu veya operasyon yöneticisi verir.", "UNIT_ACCESS_DENIED");
  if (a.status === "hurda") throw new SecurityError(409, "Hurdaya ayrılan varlık zimmetlenemez.", "ASSET_STATE");
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 200) : "";
  const staff = await d1().prepare("SELECT email FROM staff_accounts WHERE email=? AND active=1").bind(email).first<string>("email");
  if (!staff) throw new SecurityError(400, "Zimmet verilecek kişi etkin personel listesinde yok.", "INVALID_INPUT");
  try {
    await d1().prepare("INSERT INTO asset_custody(asset_code,holder_email,given_by,given_at) VALUES(?,?,?,?)").bind(a.code, email, actor.email, now).run();
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error)?.message))) throw new SecurityError(409, "Varlığın açık zimmeti var; önce iade alın.", "CUSTODY_OPEN");
    throw error;
  }
  const db = getDb();
  await runBatch(db, [
    ...notificationStatements(db, [email], { kind: "task", title: "Zimmet onayınız bekleniyor", detail: `${a.code} ${a.name}`, path: `/varliklar?kod=${a.code}`, key: `custody:${a.code}:${now}` }, new Date(now)),
    ...await auditStatements(db, [{ actor: actor.email, action: "asset.custody.assigned", resource: a.code, detail: `zimmet → ${email}` }]),
  ] as Parameters<typeof runBatch>[1], "Zimmet bildirimi yazılamadı.");
  return { code: a.code, holder: email };
}

/** Zimmet onayı (imza): yalnız zimmetlenen kişi, kendi oturumuyla. Onay makbuzu kaydedilir. */
export async function acceptCustody(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const { a, c } = await openAsset(actor, input.code);
  if (!c || c.holder_email !== actor.email) throw new SecurityError(403, "Bu varlık size zimmetlenmedi.", "NOT_HOLDER");
  if (c.accepted_at) throw new SecurityError(409, "Zimmet zaten onaylandı.", "CUSTODY_STATE");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${a.code}|${actor.email}|${c.given_at}|${now}`));
  const receipt = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const r = await d1().prepare("UPDATE asset_custody SET accepted_at=?,receipt=? WHERE id=? AND accepted_at IS NULL AND returned_at IS NULL").bind(now, receipt, c.id).run();
  if (!Number(r.meta?.changes ?? 0)) throw new SecurityError(409, "Zimmet durumu değişti; sayfayı yenileyin.", "CUSTODY_STATE");
  await appendAudit(getDb(), { actor: actor.email, action: "asset.custody.accepted", resource: a.code, detail: `makbuz ${receipt}` });
  return { code: a.code, receipt };
}

/** İade: zimmetli kişi veya birim yöneticisi. Kayıt silinmez, kapanır. */
export async function returnCustody(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const { a, c } = await openAsset(actor, input.code);
  if (!c) throw new SecurityError(409, "Açık zimmet yok.", "CUSTODY_STATE");
  if (c.holder_email !== actor.email && !canManageUnit(actor, a.unit_code)) throw new SecurityError(403, "İadeyi zimmetli kişi veya birim sorumlusu kaydeder.", "UNIT_ACCESS_DENIED");
  const r = await d1().prepare("UPDATE asset_custody SET returned_at=?,returned_by=? WHERE id=? AND returned_at IS NULL").bind(now, actor.email, c.id).run();
  if (!Number(r.meta?.changes ?? 0)) throw new SecurityError(409, "Zimmet durumu değişti; sayfayı yenileyin.", "CUSTODY_STATE");
  await appendAudit(getDb(), { actor: actor.email, action: "asset.custody.returned", resource: a.code, detail: `iade: ${c.holder_email}` });
  return { code: a.code };
}

// ---- KG1 (adım 2): plandan otomatik iş ----
const PLAN_DAYS = 7;
/**
 * Bakım/kalibrasyon vadesine 7 gün kalan (veya hiç kaydı olmayan) varlıklar için doğru birime iş açar.
 * Aynı vade için ikinci iş açılmaz (trigger_event tekil). "Yapıldı" işaretlenince yeni vade yeni iş üretir.
 */
export async function openDuePlanJobs(now = Date.now(), limit = 20) {
  const db = getDb();
  const rows = (await d1().prepare(`SELECT * FROM assets WHERE status<>'hurda' AND (maintenance_interval_days IS NOT NULL OR calibration_interval_days IS NOT NULL) ORDER BY id LIMIT 500`).all<AssetRow>()).results;
  let opened = 0;
  for (const a of rows) {
    const plans: { what: "bakim" | "kalibrasyon"; due: Due; playbook: string }[] = [
      { what: "bakim", due: dueOf(a.last_maintenance_at, a.maintenance_interval_days, now), playbook: a.kind === "teknik" ? "planli-bakim-teknik" : "planli-bakim-bio" },
      { what: "kalibrasyon", due: dueOf(a.last_calibration_at, a.calibration_interval_days, now), playbook: "planli-kalibrasyon" },
    ];
    for (const p of plans) {
      if (opened >= limit) return { opened };
      if (p.due.level === "yok" || (p.due.at !== null && p.due.at - now > PLAN_DAYS * DAY)) continue;
      const trigger = `asset:${a.code}:${p.what}:${p.due.at ?? 0}`;
      if (await d1().prepare("SELECT 1 AS x FROM playbook_runs WHERE trigger_event=?").bind(trigger).first("x")) continue;
      const pb = playbookOf(p.playbook);
      if (!pb) continue;
      const reference = newReference(pb.code), at = new Date(now);
      const note = `${a.code} ${a.name} · ${findUnit(a.unit_code).name}${a.location ? ` · ${a.location}` : ""} · ${p.what === "bakim" ? "bakım" : "kalibrasyon"} vadesi ${p.due.at ? new Date(p.due.at).toLocaleDateString("tr-TR") : "kayıtsız"}`;
      try {
        await runBatch(db, [
          ...runStatements(db, pb, { reference, startedBy: "system", note, parentReference: null, triggerEvent: trigger, now: at }),
          ...await stepNotifications(db, reference, pb, 0, at),
          ...await auditStatements(db, [{ actor: "system", action: `asset.plan.${p.what}`, resource: a.code, detail: reference }]),
        ] as Parameters<typeof runBatch>[1], "Plan işi açılamadı.");
        opened++;
      } catch { /* eşzamanlı tur aynı işi açtıysa tekil kısıt engeller; sonraki tur yeniden bakar */ }
    }
  }
  return { opened };
}
