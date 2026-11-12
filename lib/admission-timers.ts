// K9: Mevzuatta sayıyla verilmiş iki süre (Yataklı Sağlık Tesislerinde Acil Servis Hizmetlerinin Uygulama Usul ve Esasları
// Hakkında Tebliğ, md. 11/3 ve 11/4):
//  - Yatış işlemi tesis edilen hasta, uygun yatak varsa en geç 2 saat içinde kliniğe nakledilir → 90. dk uyarı, 120. dk aşım.
//  - Acilde hasta takibinin 8 saati geçmemesi esastır → 6. saatte uyarı, 8. saatte aşım.
// Bu yalnız idari bir zaman sayacıdır; klinik öncelik, karar veya öneri üretmez.
export const DECISION_WARN_MIN = 90, DECISION_LIMIT_MIN = 120;
export const ER_WARN_MIN = 6 * 60, ER_LIMIT_MIN = 8 * 60;
export type TimerLevel = "normal" | "uyari" | "asim";
export type AdmissionTimer = { decisionMinutes: number; decisionLevel: TimerLevel; erMinutes: number; erLevel: TimerLevel };

const level = (m: number, warn: number, limit: number): TimerLevel => (m >= limit ? "asim" : m >= warn ? "uyari" : "normal");
export function admissionTimer(a: { arrived_at: number; decided_at: number; placed_at?: number | null }, now: number): AdmissionTimer {
  const end = a.placed_at ?? now;
  const decisionMinutes = Math.max(0, Math.floor((end - a.decided_at) / 60_000));
  const erMinutes = Math.max(0, Math.floor((end - a.arrived_at) / 60_000));
  return { decisionMinutes, decisionLevel: level(decisionMinutes, DECISION_WARN_MIN, DECISION_LIMIT_MIN), erMinutes, erLevel: level(erMinutes, ER_WARN_MIN, ER_LIMIT_MIN) };
}
export const TIMER_TEXT: Record<TimerLevel, string> = { normal: "Süre içinde", uyari: "Uyarı", asim: "Süre aşıldı" };
export function minutesText(m: number) { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} sa ${r} dk` : `${r} dk`; }
