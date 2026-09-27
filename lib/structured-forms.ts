// Yapılandırılmış operasyon formları: hasta nakli (ULS) ve taburculuk (TBR).
// Form alanları sunucuda doğrulanır ve talep özetine düzenli biçimde yazılır; talep
// her zaman formun birimine gider. Kimlik bilgisi yazılmaz: hasta yalnız takma adla anılır,
// serbest metin yine PII maskelemesinden geçer. Klinik karar içermez; operasyon koordinasyonudur.
import { SecurityError } from "./security";

export type FormKind = "transport" | "discharge";
export const FORM_UNIT: Record<FormKind, string> = { transport: "ULS", discharge: "TBR" };

const MOBILITY = ["Yürüyerek", "Tekerlekli sandalye", "Sedye", "Yatakla"] as const;
const PRIORITY = ["Normal", "Yüksek"] as const;
export const DISCHARGE_ITEMS = [
  { id: "epikriz", label: "Epikriz / çıkış özeti hazır" },
  { id: "recete", label: "Reçete ve ilaç teslimi planlandı" },
  { id: "egitim", label: "Hasta/yakın bilgilendirmesi yapıldı" },
  { id: "kontrol", label: "Kontrol randevusu verildi" },
  { id: "ulasim", label: "Eve ulaşım ayarlandı" },
  { id: "fatura", label: "Vezne / provizyon işlemi tamam" },
] as const;

const text = (v: unknown, field: string, min: number, max: number) => {
  const s = typeof v === "string" ? v.normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, " ").trim() : "";
  if (s.length < min || s.length > max) throw new SecurityError(400, `${field} ${min}-${max} karakter olmalıdır.`, "INVALID_INPUT");
  return s;
};
const pick = <T extends readonly string[]>(v: unknown, list: T, field: string): T[number] => {
  if (typeof v !== "string" || !list.includes(v)) throw new SecurityError(400, `${field} için geçerli bir seçenek seçin.`, "INVALID_INPUT");
  return v as T[number];
};

export function buildStructuredSubject(kind: unknown, raw: unknown): { kind: FormKind; unitCode: string; subject: string; priority: "Normal" | "Yüksek" } {
  if (kind !== "transport" && kind !== "discharge") throw new SecurityError(400, "Form türü geçersiz.", "INVALID_INPUT");
  const f = (raw ?? {}) as Record<string, unknown>;
  if (kind === "transport") {
    const from = text(f.from, "Alınacak yer", 2, 80);
    const to = text(f.to, "Götürülecek yer", 2, 80);
    if (from.toLocaleLowerCase("tr-TR") === to.toLocaleLowerCase("tr-TR")) throw new SecurityError(400, "Alınacak ve götürülecek yer aynı olamaz.", "INVALID_INPUT");
    const mobility = pick(f.mobility, MOBILITY, "Taşıma şekli");
    const priority = pick(f.priority ?? "Normal", PRIORITY, "Öncelik");
    const when = typeof f.when === "string" && /^\d{2}:\d{2}$/.test(f.when) ? f.when : "Hemen";
    const extras = [f.oxygen === true && "oksijen desteği", f.monitor === true && "monitör", f.escort === true && "refakatçi personel"].filter(Boolean);
    const note = typeof f.note === "string" ? text(f.note, "Not", 0, 300) : "";
    return {
      kind, unitCode: FORM_UNIT.transport, priority,
      subject: `[Hasta nakli] ${from} → ${to} · ${mobility} · Saat: ${when}${extras.length ? ` · Gerekli: ${extras.join(", ")}` : ""}${note ? ` · Not: ${note}` : ""}`,
    };
  }
  const ward = text(f.ward, "Servis / oda", 2, 60);
  const planned = typeof f.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.plannedDate) ? f.plannedDate : null;
  if (!planned) throw new SecurityError(400, "Planlanan taburculuk tarihini seçin.", "INVALID_INPUT");
  const done = Array.isArray(f.done) ? f.done.filter((x): x is string => typeof x === "string" && DISCHARGE_ITEMS.some((i) => i.id === x)) : [];
  const open = DISCHARGE_ITEMS.filter((i) => !done.includes(i.id)).map((i) => i.label);
  const note = typeof f.note === "string" ? text(f.note, "Not", 0, 300) : "";
  return {
    kind, unitCode: FORM_UNIT.discharge, priority: open.length >= 3 ? "Yüksek" : "Normal",
    subject: `[Taburculuk] ${ward} · Plan: ${planned} · Tamam: ${done.length}/${DISCHARGE_ITEMS.length}${open.length ? ` · Açık engeller: ${open.join("; ")}` : " · Engel yok"}${note ? ` · Not: ${note}` : ""}`,
  };
}
