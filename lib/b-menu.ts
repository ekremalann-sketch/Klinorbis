// K14: Menü 22 maddeden B listesindeki 12 ekrana iner (docs/TASARIM-BELGESI-2026-11.md, B bölümü).
// Her rol yalnız kendi işine ait ekranları görür; ilk madde açılış ekranıdır. Yetki sunucuda ayrıca uygulanır.
// Ürün dışı ekranlar (hasta talepleri, randevu, hekim yokluğu, çağrı, akışlar, sanal hastane, otomasyon…) menüde yoktur.

export type BScreenKey = "bugun" | "yatak" | "temizlik" | "temizlik-kontrol" | "tasima" | "tasima-dagitim" | "transfer" | "ariza" | "devir" | "komuta" | "raporlar" | "ayarlar";
export type BScreen = { key: BScreenKey; label: string; view?: string; href?: string };

export const B_SCREENS: Record<BScreenKey, BScreen> = {
  bugun: { key: "bugun", label: "Bugün", view: "mywork" },
  yatak: { key: "yatak", label: "Yatak panosu", href: "/yatak" },
  temizlik: { key: "temizlik", label: "Temizlik işlerim", href: "/temizlik" },
  "temizlik-kontrol": { key: "temizlik-kontrol", label: "Temizlik kontrolü", view: "myunit" },
  tasima: { key: "tasima", label: "Taşıma işlerim", href: "/hbys#tasima" },
  "tasima-dagitim": { key: "tasima-dagitim", label: "Taşıma dağıtım", href: "/hbys#tasima" },
  transfer: { key: "transfer", label: "Transfer talepleri", view: "capacity" },
  // Arıza bildirimi bugün "Bugün" ekranındaki "Arıza bildir" düğmesindedir; ayrı cihaz ekranı gelince bağlanır.
  ariza: { key: "ariza", label: "Arıza ve cihazlar", view: "mywork" },
  devir: { key: "devir", label: "Operasyon devri", href: "/hbys#devir" },
  komuta: { key: "komuta", label: "Komuta ekranı", view: "dashboard" },
  raporlar: { key: "raporlar", label: "Raporlar", view: "reports" },
  ayarlar: { key: "ayarlar", label: "Ayarlar", view: "staff" },
};

/** Yeni iş rolleri: birim üyeliğindeki rol adından tanınır (Personel ve Yetki → birim rolü). */
export const JOB_ROLES = {
  temizlik: "Temizlik personeli",
  tasima: "Taşıma personeli",
  sorumlu_hemsire: "Sorumlu hemşire",
  acil_sekreteri: "Acil sekreteri",
} as const;
export type JobRole = keyof typeof JOB_ROLES;

const fold = (v: string) => v.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
export function jobRoleOf(unitRoles: readonly string[] | undefined): JobRole | null {
  const roles = (unitRoles ?? []).map(fold);
  if (roles.some((r) => r.includes("sorumlu hemsire"))) return "sorumlu_hemsire";
  if (roles.some((r) => r.includes("acil sekreter"))) return "acil_sekreteri";
  if (roles.some((r) => r.includes("tasima") || r.includes("transport") || r.includes("hasta tasiyici"))) return "tasima";
  if (roles.some((r) => r.includes("temizlik"))) return "temizlik";
  return null;
}

const BY_JOB: Record<JobRole, BScreenKey[]> = {
  temizlik: ["temizlik", "bugun"],
  tasima: ["tasima", "bugun"],
  sorumlu_hemsire: ["bugun", "yatak", "temizlik-kontrol", "transfer", "devir"],
  acil_sekreteri: ["bugun", "yatak", "transfer"],
};
const BY_ROLE: Record<string, BScreenKey[]> = {
  operations_manager: ["komuta", "bugun", "yatak", "transfer", "tasima-dagitim", "devir", "raporlar", "ayarlar"],
  unit_manager: ["bugun", "yatak", "temizlik-kontrol", "transfer", "devir", "raporlar"],
  clinician: ["bugun", "transfer", "yatak"],
  call_agent: ["bugun", "yatak", "transfer"],
  unit_staff: ["bugun"],
  privacy_officer: ["raporlar", "ayarlar"],
  security_officer: ["komuta", "ayarlar"],
};

/** Ayarlar altındaki kurulum ekranları (yalnız yönetici ve gözetim rolleri). */
export const SETTINGS_LINKS: Record<string, { label: string; view: string }[]> = {
  operations_manager: [{ label: "Personel ve roller", view: "staff" }, { label: "Birimler ve yönlendirme", view: "routing" }, { label: "Denetim izi", view: "audit" }],
  privacy_officer: [{ label: "KVKK", view: "privacy" }, { label: "Denetim izi", view: "audit" }],
  security_officer: [{ label: "Siber güvenlik", view: "security" }, { label: "Entegrasyon", view: "integrations" }, { label: "Otomasyon anahtarı", view: "automation" }, { label: "Denetim izi", view: "audit" }],
};

export function bMenu(menuRole: string, unitRoles?: readonly string[]): BScreen[] {
  // Yönetici ve gözetim rolleri iş rolüne göre daraltılmaz.
  const job = ["operations_manager", "privacy_officer", "security_officer"].includes(menuRole) ? null : jobRoleOf(unitRoles);
  const keys = job ? BY_JOB[job] : BY_ROLE[menuRole] ?? ["bugun"];
  const screens = keys.map((k) => B_SCREENS[k]);
  if (menuRole === "privacy_officer") screens[1] = { ...B_SCREENS.ayarlar, view: "privacy" };
  if (menuRole === "security_officer") screens[1] = { ...B_SCREENS.ayarlar, view: "security" };
  return screens;
}
