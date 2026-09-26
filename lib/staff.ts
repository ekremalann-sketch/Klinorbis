// Personel ve yetki kuralları: rol haritası, doğrulama ve devir durumları.
// Giriş parolası yoktur; kimlik Sites platform hesabından gelir. Bu modül yalnız
// "bu e-posta hangi rolde, hangi birimlerde çalışır" bilgisini yönetir.
import { HOSPITAL_UNITS } from "./hospital-units";
import { SecurityError, type SystemRole } from "./security";
export { ROLE_MAP } from "./role-map";

export const STAFF_ROLES: SystemRole[] = ["operations_manager", "unit_manager", "clinician", "call_agent", "privacy_officer", "security_officer"];
/** Birim üyeliği olmadan çalışamayan roller. */
export const UNIT_ROLES = new Set<SystemRole>(["unit_manager", "clinician", "call_agent"]);
/** Tüm birimleri kapsayan (birim atanmayan) roller. */
export const NETWORK_ROLES = new Set<SystemRole>(["operations_manager", "privacy_officer", "security_officer"]);

const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

export function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.includes("..")) throw new SecurityError(400, "Geçerli bir iş e-postası girin.", "INVALID_INPUT");
  return email;
}

export function parseRole(value: unknown): SystemRole {
  if (typeof value !== "string" || !STAFF_ROLES.includes(value as SystemRole)) throw new SecurityError(400, "Geçerli bir rol seçin.", "INVALID_INPUT");
  return value as SystemRole;
}

export type MembershipInput = { unitCode: string; unitRole: string; canManageTickets: boolean; canReadCalls: boolean };

export function parseMemberships(role: SystemRole, value: unknown): MembershipInput[] {
  if (NETWORK_ROLES.has(role)) return []; // tüm ağı kapsayan roller birime bağlanmaz
  if (!Array.isArray(value) || value.length === 0) throw new SecurityError(400, "Bu rol için en az bir birim seçin.", "UNIT_REQUIRED");
  if (value.length > HOSPITAL_UNITS.length) throw new SecurityError(400, "Birim listesi geçersiz.", "INVALID_INPUT");
  const seen = new Set<string>();
  return value.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const unit = HOSPITAL_UNITS.find((u) => u.code === raw.unitCode);
    if (!unit || seen.has(unit.code)) throw new SecurityError(400, "Birim listesi geçersiz.", "INVALID_INPUT");
    seen.add(unit.code);
    const unitRole = typeof raw.unitRole === "string" && raw.unitRole.trim() ? raw.unitRole.trim().slice(0, 60) : unit.assignedRole;
    return {
      unitCode: unit.code,
      unitRole,
      canManageTickets: raw.canManageTickets !== false,
      // Çağrı içeriği yalnız çağrı rolüne ve birim sorumlusuna varsayılan açık.
      canReadCalls: typeof raw.canReadCalls === "boolean" ? raw.canReadCalls : role !== "clinician",
    };
  });
}

/** Devir yapabilen roller: birim içinde iş taşıyan roller. Gözetim rolleri devir yapmaz. */
export const HANDOFF_ROLES = UNIT_ROLES;
export const HANDOFF_STATUS = { pending: "Bekliyor", accepted: "Kabul edildi", declined: "Reddedildi", cancelled: "İptal edildi" } as const;
