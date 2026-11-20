// Hasta süreç takibi (başvurudan çıkışa): hastanın hastanedeki idari/operasyonel yolculuğu.
// Bu dosya bağımlılıksızdır; API, ekran ve testler aynı kuralları kullanır.
//
// Sınır: Klinorbis hangi tetkikin, hangi konsültasyonun veya yatışın gerektiğine karar vermez.
// Ek adımı (tetkik, konsültasyon, yatış) yetkili personel seçer; sistem yalnız işi doğru birime taşır,
// süreyi ölçer ve hastaya "şu an neredesiniz, sırada kaç kişi var" bilgisini verir.
import { HOSPITAL_UNITS } from "./hospital-units";

export type StepState = "pending" | "waiting" | "active" | "done" | "rejected" | "skipped";
export type JourneyStatus = "active" | "completed" | "cancelled";
/** "clinic" yer tutucusu: başvuruda seçilen poliklinik/servis birimiyle değiştirilir. */
export type StepTemplate = { unit: string | "clinic"; label: string; optional?: boolean; rejectTo?: string; rejectLabel?: string };
export type Pathway = { code: string; label: string; summary: string; steps: StepTemplate[]; clinicKinds: ("clinical" | "diagnostic")[] };

const KABUL: StepTemplate = { unit: "KBL", label: "Hasta kabul ve kayıt" };
const PROVIZYON: StepTemplate = { unit: "PRV", label: "Sigorta / provizyon onayı", rejectTo: "VZN", rejectLabel: "Ücret bilgilendirmesi (provizyon alınamadı)" };
const VEZNE: StepTemplate = { unit: "VZN", label: "Vezne ve ödeme", optional: true };
const CIKIS: StepTemplate = { unit: "DNS", label: "Çıkış ve bilgilendirme" };

export const PATHWAYS: Pathway[] = [
  { code: "poliklinik", label: "Poliklinik başvurusu", summary: "Kabul → provizyon → muayene → (gerekirse tetkik ve sonuç değerlendirme) → vezne → çıkış",
    clinicKinds: ["clinical"], steps: [KABUL, PROVIZYON, { unit: "clinic", label: "Poliklinik muayenesi" }, VEZNE, CIKIS] },
  { code: "yatis", label: "Yatışlı tedavi", summary: "Kabul → provizyon → muayene → yatak ayırma → servise yerleşme → taburculuk → ilaç teslimi → vezne → çıkış",
    clinicKinds: ["clinical"], steps: [KABUL, PROVIZYON, { unit: "clinic", label: "Yatış öncesi muayene" }, { unit: "YTK", label: "Yatak ayırma" },
      { unit: "ULS", label: "Servise taşıma", optional: true }, { unit: "clinic", label: "Serviste tedavi süreci" }, { unit: "TBR", label: "Taburculuk hazırlığı" },
      { unit: "ECZ", label: "Taburcu ilaçlarının teslimi", optional: true }, VEZNE, CIKIS] },
  { code: "acil", label: "Acil servis başvurusu", summary: "Acil kayıt → acil servis süreci → (gerekirse tetkik, konsültasyon, yatış) → vezne → çıkış",
    clinicKinds: ["clinical"], steps: [{ unit: "ACS", label: "Acil başvuru kaydı" }, { unit: "ACS", label: "Acil servis süreci" }, PROVIZYON, VEZNE, CIKIS] },
  { code: "gunubirlik", label: "Günübirlik işlem", summary: "Kabul → provizyon → işlem hazırlığı → işlem → gözlem → vezne → çıkış",
    clinicKinds: ["clinical", "diagnostic"], steps: [KABUL, PROVIZYON, { unit: "clinic", label: "İşlem hazırlığı" }, { unit: "clinic", label: "İşlem" },
      { unit: "clinic", label: "İşlem sonrası gözlem" }, VEZNE, CIKIS] },
  { code: "tetkik", label: "Yalnız tetkik (kan alma / görüntüleme)", summary: "Kabul → provizyon → tetkik birimi → sonuç hazırlığı → çıkış",
    clinicKinds: ["diagnostic"], steps: [KABUL, PROVIZYON, { unit: "clinic", label: "Tetkik işlemi" }, VEZNE, CIKIS] },
  { code: "checkup", label: "Check-up", summary: "Kabul → provizyon → check-up planı → kan alma → görüntüleme → sonuç görüşmesi → vezne → çıkış",
    clinicKinds: ["clinical"], steps: [KABUL, PROVIZYON, { unit: "CHK", label: "Check-up planlama" }, { unit: "NMK", label: "Kan alma" }, { unit: "LAB", label: "Laboratuvar çalışması" },
      { unit: "RAD", label: "Görüntüleme" }, { unit: "CHK", label: "Sonuç görüşmesi" }, VEZNE, CIKIS] },
];

/** Muayene sırasında yetkili personelin ekleyebileceği adımlar. Sonrasında hasta otomatik olarak sonuç değerlendirmesine döner. */
export const ADDABLE_STEPS: { code: string; units: { unit: string; label: string }[]; label: string }[] = [
  { code: "kan", label: "Kan / idrar tetkiki", units: [{ unit: "NMK", label: "Kan alma / numune verme" }, { unit: "LAB", label: "Laboratuvar çalışması" }] },
  { code: "rontgen", label: "Röntgen", units: [{ unit: "RAD", label: "Röntgen çekimi" }] },
  { code: "ultrason", label: "Ultrason", units: [{ unit: "RAD", label: "Ultrason" }] },
  { code: "tomografi", label: "Bilgisayarlı tomografi", units: [{ unit: "RAD", label: "Tomografi çekimi" }] },
  { code: "mr", label: "Manyetik rezonans", units: [{ unit: "RAD", label: "MR çekimi" }] },
  { code: "nukleer", label: "Nükleer tıp tetkiki", units: [{ unit: "NTP", label: "Nükleer tıp tetkiki" }] },
  { code: "eeg-emg", label: "EEG / EMG", units: [{ unit: "NFS", label: "Nörofizyoloji tetkiki" }] },
  { code: "endoskopi", label: "Endoskopi", units: [{ unit: "EDS", label: "Endoskopi işlemi" }] },
  { code: "patoloji", label: "Patoloji", units: [{ unit: "PAT", label: "Patoloji materyal kabulü" }] },
  { code: "recete", label: "Reçete / ilaç teslimi", units: [{ unit: "ECZ", label: "İlaç teslimi" }] },
  { code: "yatis", label: "Yatış kararı", units: [{ unit: "YTK", label: "Yatak ayırma" }, { unit: "ULS", label: "Servise taşıma" }] },
  { code: "ameliyat", label: "Ameliyat planı", units: [{ unit: "ANR", label: "Anestezi ön değerlendirmesi" }, { unit: "AML", label: "Ameliyat" }] },
  { code: "sosyal", label: "Sosyal hizmet desteği", units: [{ unit: "SHZ", label: "Sosyal hizmet görüşmesi" }] },
];

/** Hastaya gösterilen durum metinleri (tanı veya klinik bilgi içermez). */
export const PATIENT_STATE_TEXT: Record<StepState, string> = {
  pending: "Sırası gelecek",
  waiting: "Sırada bekliyorsunuz",
  active: "İşleminiz yapılıyor",
  done: "Tamamlandı",
  rejected: "Başka birime yönlendirildi",
  skipped: "Gerekmedi",
};
export const JOURNEY_STATUS_TEXT: Record<JourneyStatus, string> = { active: "Süreciniz devam ediyor", completed: "Süreciniz tamamlandı", cancelled: "Süreciniz sonlandırıldı, lütfen danışmaya başvurun" };

/** Süreci başlatabilen birimler: hasta kabul, acil servis, danışma, çağrı merkezi. */
export const OPENING_UNITS = ["KBL", "ACS", "DNS", "CAG", "UHS"];

export function unitName(code: string) { return HOSPITAL_UNITS.find((u) => u.code === code)?.name ?? code; }
export function unitSla(code: string) { return HOSPITAL_UNITS.find((u) => u.code === code)?.slaMinutes ?? 30; }
export function pathwayByCode(code: unknown) { return PATHWAYS.find((p) => p.code === code) ?? null; }
export function clinicOptions(pathway: Pathway) { return HOSPITAL_UNITS.filter((u) => (pathway.clinicKinds as string[]).includes(u.kind)).map((u) => ({ code: u.code, name: u.name })); }

export type PlannedStep = { unitCode: string; label: string; optional: boolean; rejectTo: string | null; rejectLabel: string | null };
/** Başvuru anında yolculuğun adım listesi. Başvuruda seçilen birim "clinic" yerine yazılır. */
export function planSteps(pathway: Pathway, clinicUnit: string): PlannedStep[] {
  const valid = clinicOptions(pathway).some((u) => u.code === clinicUnit);
  if (!valid) throw new Error("Seçilen birim bu başvuru türüne uygun değil.");
  return pathway.steps.map((s) => ({ unitCode: s.unit === "clinic" ? clinicUnit : s.unit, label: s.label, optional: Boolean(s.optional), rejectTo: s.rejectTo ?? null, rejectLabel: s.rejectLabel ?? null }));
}

/** Okunurken karışmayan harfler (0/O, 1/I/L yok). 31^8 ≈ 8,5×10^11 olasılık. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newTrackingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(16); let out = "";
  for (let i = 0; out.length < 8 && i < bytes.length; i++) if (bytes[i] < 248) out += ALPHABET[bytes[i] % ALPHABET.length];
  while (out.length < 8) out += ALPHABET[random(1)[0] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
export function newPin(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const b = random(4); const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}
export function normalizeTrackingCode(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export function normalizePin(value: unknown) { return typeof value === "string" && /^\d{6}$/.test(value.trim()) ? value.trim() : null; }

/** Kimin hangi işlemi yapabileceği (sunucu tarafında da aynı fonksiyon kullanılır). */
export type Actorish = { role: string; unitCodes: string[]; canSeeAllUnits: boolean };
const WRITERS = ["operations_manager", "unit_manager", "clinician", "call_agent"];
export function canOpenJourney(a: Actorish) { return a.role === "operations_manager" || (WRITERS.includes(a.role) && a.unitCodes.some((u) => OPENING_UNITS.includes(u))); }
export function canWorkStep(a: Actorish, unitCode: string) { return WRITERS.includes(a.role) && (a.role === "operations_manager" || a.unitCodes.includes(unitCode)); }
/** Tetkik/konsültasyon/yatış eklemek klinik bir istemdir: yalnız o birimin klinisyeni veya birim sorumlusu ekler. */
export function canAddSteps(a: Actorish, unitCode: string) { return (a.role === "clinician" || a.role === "unit_manager") && a.unitCodes.includes(unitCode); }
export function canCancelJourney(a: Actorish) { return a.role === "operations_manager" || (a.role === "unit_manager" && a.unitCodes.some((u) => OPENING_UNITS.includes(u))); }
export function canViewJourney(a: Actorish, unitCodes: string[]) { return a.canSeeAllUnits || unitCodes.some((u) => a.unitCodes.includes(u)); }

/** Bir adımda geçen süre hedefi aşıldı mı (birimin SLA dakikası). */
export function isOverdue(step: { unitCode: string; state: StepState; enteredAt: number | null }, now = Date.now()) {
  return (step.state === "waiting" || step.state === "active") && step.enteredAt !== null && now - step.enteredAt > unitSla(step.unitCode) * 60_000;
}
