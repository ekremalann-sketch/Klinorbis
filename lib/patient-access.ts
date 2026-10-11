// Hasta erişimi işletim modeli: kanallar, talep türleri, hekim yokluğunda yeniden planlama ve
// hasta bilgilendirme kuralları. Bu dosya bağımlılıksızdır; rota kodu ve testler aynı kuralları kullanır.
//
// Klinorbis klinik karar vermez. Buradaki kurallar yalnız operasyonu düzenler: kim, hangi sürede,
// hangi kanaldan, hangi bilgiyle döner. Klinik önceliği olan hastalarda karar her zaman hekimdedir.

export type ChannelCode = "phone" | "whatsapp" | "sms" | "web" | "email" | "desk";
export type Channel = {
  code: ChannelCode;
  label: string;
  /** İlk karşılayan birim (Çağrı Merkezi, Hasta İletişim, Hasta Kabul). */
  intakeUnit: string;
  /** İlk insan yanıtı için hedef süre (dakika). */
  firstResponseMinutes: number;
  /** Kimlik doğrulama yöntemi; doğrulanmadan kişiye özel bilgi verilmez. */
  identity: string;
  /** Bu kanaldan hastaya ne gönderilebilir. */
  allowed: string;
  /** Bu kanaldan asla gönderilmeyecek bilgi. */
  never: string;
  /** Giden bilgilendirmede kullanılabilir mi (açık iletişim izni varsa). */
  outbound: boolean;
};

export const CHANNELS: Channel[] = [
  { code: "phone", label: "Telefon (çağrı merkezi)", intakeUnit: "CAG", firstResponseMinutes: 1, outbound: true,
    identity: "Ad-soyad + doğum yılı + kayıtlı telefonun son 4 hanesi; üçünden biri tutmazsa yalnız genel bilgi verilir.",
    allowed: "Randevu alma, değiştirme, iptal; başvuru durumu; hazırlık talimatı.",
    never: "Tanı, tahlil değeri, ilaç dozu. Bu sorular hekime veya yetkili sağlık personeline aktarılır." },
  { code: "whatsapp", label: "WhatsApp Business", intakeUnit: "HIL", firstResponseMinutes: 15, outbound: true,
    identity: "Kayıtlı numaradan yazılmalı; kişiye özel bilgi öncesi tek kullanımlık kod.",
    allowed: "Randevu tarihi, saati, poliklinik ve kampüs; başvuru referansı.",
    never: "Tanı, sonuç, görüntü, belge ekleri. Hasta ek gönderirse kayda alınmaz, güvenli portala yönlendirilir." },
  { code: "sms", label: "SMS", intakeUnit: "HIL", firstResponseMinutes: 30, outbound: true,
    identity: "Yalnız kayıtlı numaraya gönderim; yanıt kısa kodla (EVET/HAYIR/ARA).",
    allowed: "Randevu hatırlatma, değişiklik bildirimi, geri arama bilgisi.",
    never: "Hekim adı dışında klinik bilgi, tanı, bölüm adı hassas ise (ör. psikiyatri) yalnız 'poliklinik'." },
  { code: "web", label: "Web formu / hasta portalı", intakeUnit: "HIL", firstResponseMinutes: 60, outbound: false,
    identity: "Portal oturumu (e-Devlet veya kurum hesabı).",
    allowed: "Tüm randevu işlemleri, belge talebi, başvuru takibi.",
    never: "Formda TCKN, kart veya IBAN serbest metin olarak tutulmaz; otomatik maskelenir." },
  { code: "email", label: "E-posta", intakeUnit: "HIL", firstResponseMinutes: 240, outbound: true,
    identity: "Kayıtlı e-posta; kişiye özel bilgi öncesi portal bağlantısı.",
    allowed: "Randevu özeti, bilgilendirme metni.",
    never: "Ek olarak sonuç veya rapor gönderilmez." },
  { code: "desk", label: "Danışma / hasta kabul", intakeUnit: "KBL", firstResponseMinutes: 5, outbound: false,
    identity: "Kimlik belgesi.",
    allowed: "Yüz yüze tüm idari işlemler.",
    never: "—" },
];

export type RequestType = { code: string; label: string; unit: string; keywords: string[]; automatedReply: boolean; needsApproval?: string };
/** Talep türleri: kanaldan gelen mesaj bu listeye göre sınıflandırılır; bulunamazsa Hasta İletişim karşılar. */
export const REQUEST_TYPES: RequestType[] = [
  { code: "book", label: "Randevu alma", unit: "RND", keywords: ["randevu al", "randevu istiyorum", "muayene olmak", "randevu almak"], automatedReply: true },
  { code: "change", label: "Randevu değişikliği", unit: "RND", keywords: ["randevu değiş", "tarih değiş", "saat değiş", "ertele"], automatedReply: true },
  { code: "cancel", label: "Randevu iptali", unit: "RND", keywords: ["iptal", "gelemeyeceğim", "gelemiyorum"], automatedReply: true },
  { code: "result", label: "Sonuç bilgisi", unit: "LAB", keywords: ["sonuç", "tahlil", "rapor çıktı"], automatedReply: false },
  { code: "billing", label: "Fatura ve ödeme", unit: "VZN", keywords: ["fatura", "ödeme", "ücret", "provizyon"], automatedReply: false },
  { code: "complaint", label: "Şikâyet / hasta hakkı", unit: "HHK", keywords: ["şikâyet", "şikayet", "memnun değil", "hasta hakları"], automatedReply: false },
  { code: "clinical", label: "Klinik soru (hekime aktarılır)", unit: "HIL", keywords: ["ilaç", "doz", "yan etki", "ağrım", "ateş"], automatedReply: false, needsApproval: "clinical_question" },
  { code: "info", label: "Genel bilgi", unit: "HIL", keywords: [], automatedReply: true },
];

const fold = (v: string) => v.toLocaleLowerCase("tr-TR");
export function classifyRequest(text: string) {
  const value = fold(text);
  return REQUEST_TYPES.find((t) => t.keywords.some((k) => value.includes(k))) ?? REQUEST_TYPES.find((t) => t.code === "info")!;
}

// ————— Hekim yokluğu —————

export const ABSENCE_REASONS = { leave: "Planlı izin", sick: "Sağlık raporu", surgery: "Acil ameliyat / vaka", duty: "Nöbet sonrası izin", congress: "Kongre / görevlendirme", other: "Diğer" } as const;
export type AbsenceReason = keyof typeof ABSENCE_REASONS;

export type Physician = { code: string; displayLabel: string; unitCode: string; facilityCode: string; dailyCapacity: number; active: boolean };
export type Appointment = {
  reference: string; patientAlias: string; physicianCode: string; unitCode: string; facilityCode: string;
  startsAt: number; status: string; clinicalPriority: boolean; allowOtherPhysician: boolean;
  preferredChannel: ChannelCode | null; consentChannels: ChannelCode[];
};
export type PlanOption = "substitute_same_day" | "same_physician_later" | "other_campus" | "clinical_review" | "callback";
export type Proposal = { appointmentReference: string; option: PlanOption; physicianCode: string | null; facilityCode: string | null; startsAt: number | null; reason: string };

export const OPTION_LABEL: Record<PlanOption, string> = {
  substitute_same_day: "Aynı gün, aynı branştan başka hekim",
  same_physician_later: "Aynı hekim, ilk uygun gün",
  other_campus: "Başka kampüs, aynı branş",
  clinical_review: "Hekim değerlendirmesi gerekli",
  callback: "Çağrı merkezi arayıp birlikte planlar",
};

const DAY = 86_400_000;
/** Europe/Istanbul (UTC+3, yaz saati yok) yerel takvim günü. */
export function localDay(ms: number) { return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10); }
export function localHour(ms: number) { return new Date(ms + 3 * 3_600_000).getUTCHours(); }
function isWeekend(day: string) { const d = new Date(day + "T12:00:00Z").getUTCDay(); return d === 0 || d === 6; }

/**
 * Bir hekimin belirli gündeki randevuları için öneri üretir. Saf fonksiyondur; kapasiteyi
 * kendi içinde ayırır, böylece aynı plan içinde iki hastaya aynı boşluk önerilmez.
 *
 * Sıra (hastanın beklemesini en aza indiren, klinik riski hekime bırakan):
 *  1. Klinik öncelikli hasta → hekim değerlendirmesi (otomatik öneri yok).
 *  2. Hasta başka hekime izin verdiyse → aynı gün aynı branş/kampüste boş kapasitesi olan hekim, aynı saat.
 *  3. Aynı hekim → 14 gün içinde ilk uygun iş günü, aynı saat.
 *  4. Başka kampüs, aynı branş, aynı gün (hasta başka hekime izin verdiyse).
 *  5. Hiçbiri yoksa → çağrı merkezi arar.
 */
export function planAbsence(input: { physician: Physician; day: string; appointments: Appointment[]; physicians: Physician[]; booked: Record<string, number>; absentDays?: Record<string, string[]>; reservedSlots?: { physicianCode: string; startsAt: number }[] }): Proposal[] {
  const load = { ...input.booked }; // anahtar: `${hekimKodu}|${gün}`
  const absent = input.absentDays ?? {};
  // Saat kilidi: aynı hekimin aynı saatinde başka randevu veya başka planın önerisi varsa o saat önerilmez.
  const ACTIVE = ["scheduled", "confirmed", "offered", "rescheduled", "needs_action"];
  const taken = new Set<string>([
    ...input.appointments.filter((a) => ACTIVE.includes(a.status) && a.physicianCode !== input.physician.code).map((a) => `${a.physicianCode}|${a.startsAt}`),
    ...input.appointments.filter((a) => ACTIVE.includes(a.status) && a.physicianCode === input.physician.code && localDay(a.startsAt) !== input.day).map((a) => `${a.physicianCode}|${a.startsAt}`),
    ...(input.reservedSlots ?? []).map((r) => `${r.physicianCode}|${r.startsAt}`),
  ]);
  const free = (p: Physician, day: string, at?: number) => p.active && !(absent[p.code] ?? []).includes(day) && !isWeekend(day) && (load[`${p.code}|${day}`] ?? 0) < p.dailyCapacity && (at === undefined || !taken.has(`${p.code}|${at}`));
  const take = (p: Physician, day: string, at?: number) => { load[`${p.code}|${day}`] = (load[`${p.code}|${day}`] ?? 0) + 1; if (at !== undefined) taken.add(`${p.code}|${at}`); };
  const affected = input.appointments
    .filter((a) => a.physicianCode === input.physician.code && localDay(a.startsAt) === input.day && ["scheduled", "confirmed"].includes(a.status))
    .sort((a, b) => a.startsAt - b.startsAt);
  return affected.map((a) => {
    if (a.clinicalPriority) return { appointmentReference: a.reference, option: "clinical_review", physicianCode: null, facilityCode: null, startsAt: null, reason: "Klinik öncelikli hasta: erteleme veya hekim değişikliğine birim hekimi karar verir." };
    const peers = input.physicians.filter((p) => p.code !== input.physician.code && p.unitCode === a.unitCode);
    if (a.allowOtherPhysician) {
      const same = peers.find((p) => p.facilityCode === a.facilityCode && free(p, input.day, a.startsAt));
      if (same) { take(same, input.day, a.startsAt); return { appointmentReference: a.reference, option: "substitute_same_day", physicianCode: same.code, facilityCode: same.facilityCode, startsAt: a.startsAt, reason: "Hasta başka hekime onay vermiş; aynı gün aynı saat korunur." }; }
    }
    for (let i = 1; i <= 14; i++) {
      const ms = a.startsAt + i * DAY; const day = localDay(ms);
      if (free(input.physician, day, ms)) { take(input.physician, day, ms); return { appointmentReference: a.reference, option: "same_physician_later", physicianCode: input.physician.code, facilityCode: a.facilityCode, startsAt: ms, reason: `Aynı hekimin ilk uygun günü (${i} gün sonra).` }; }
    }
    if (a.allowOtherPhysician) {
      const other = peers.find((p) => p.facilityCode !== a.facilityCode && free(p, input.day, a.startsAt));
      if (other) { take(other, input.day, a.startsAt); return { appointmentReference: a.reference, option: "other_campus", physicianCode: other.code, facilityCode: other.facilityCode, startsAt: a.startsAt, reason: "Aynı kampüste yer yok; başka kampüste aynı gün." }; }
    }
    return { appointmentReference: a.reference, option: "callback", physicianCode: null, facilityCode: null, startsAt: null, reason: "Uygun boşluk bulunamadı; görevli hastayı arayıp birlikte planlar." };
  });
}

// ————— Hasta bilgilendirme —————

export const QUIET_START = 21, QUIET_END = 9; // 21:00–09:00 arası mesaj gönderilmez (yerel saat)

/** Kanal seçimi: hastanın izin verdiği kanallar içinden; randevuya 24 saatten az kaldıysa telefonla aranır. */
export function chooseChannel(a: Pick<Appointment, "preferredChannel" | "consentChannels">, hoursUntil: number): { channel: ChannelCode | null; alsoCall: boolean } {
  const consents = a.consentChannels.filter((c) => CHANNELS.find((x) => x.code === c)?.outbound);
  const urgent = hoursUntil < 24;
  if (urgent && consents.includes("phone")) return { channel: "phone", alsoCall: true };
  const pick = a.preferredChannel && consents.includes(a.preferredChannel) ? a.preferredChannel : (["sms", "whatsapp", "email", "phone"] as ChannelCode[]).find((c) => consents.includes(c)) ?? null;
  return { channel: pick, alsoCall: urgent || pick === null };
}

/** Sessiz saatlerdeyse gönderimi 09:00'a erteler; aynı gün randevu varsa beklemez (telefonla aranır). */
export function sendTime(nowMs: number, urgent: boolean) {
  const h = localHour(nowMs);
  if (urgent || (h >= QUIET_END && h < QUIET_START)) return nowMs;
  const localMidnight = Date.parse(localDay(nowMs + (h >= QUIET_START ? DAY : 0)) + "T00:00:00Z") - 3 * 3_600_000;
  return localMidnight + QUIET_END * 3_600_000;
}

export type TemplateCode = "request_received" | "appointment_changed" | "appointment_review" | "callback_planned" | "appointment_confirmed" | "appointment_cancelled";
const fmt = (ms: number) => {
  const d = new Date(ms + 3 * 3_600_000);
  const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * Bildirim metinleri kısa, kişisel sağlık bilgisi içermeyen ve tek eylem isteyen biçimdedir.
 * Hekim yokluğunun nedeni (izin, rapor) hastaya yazılmaz: "hekimimizin programı değişti".
 * Hassas branşlar (ruh sağlığı, infertilite vb.) metinde "poliklinik" olarak geçer.
 */
const SENSITIVE_UNITS = new Set(["PSK", "IVF", "ONK", "POH", "RON", "PAL", "ENF"]);
export function renderMessage(code: TemplateCode, v: { reference: string; unitLabel?: string; unitCode?: string; facilityLabel?: string; physicianLabel?: string; startsAt?: number | null; oldStartsAt?: number | null }) {
  const unit = v.unitCode && SENSITIVE_UNITS.has(v.unitCode) ? "poliklinik" : (v.unitLabel || "poliklinik");
  switch (code) {
    case "request_received": return `Başvurunuz alındı. Referans: ${v.reference}. Ekibimiz sizinle en kısa sürede iletişime geçecek. Acil durumda 112'yi arayın.`;
    case "appointment_changed": return `${v.oldStartsAt ? fmt(v.oldStartsAt) + " tarihli " : ""}${unit} randevunuzda hekimimizin programı değişti. Önerimiz: ${v.startsAt ? fmt(v.startsAt) : "-"}, ${v.facilityLabel || ""}${v.physicianLabel ? ", " + v.physicianLabel : ""}. Uygunsa EVET, başka zaman için ARA yazın. Ref: ${v.reference}`;
    case "appointment_review": return `${v.oldStartsAt ? fmt(v.oldStartsAt) + " tarihli " : ""}${unit} randevunuzla ilgili ekibimiz sizi arayacak. Lütfen telefonunuzu açık tutun. Ref: ${v.reference}`;
    case "callback_planned": return `${unit} randevunuz için size uygun yeni bir zaman bulmak üzere çağrı merkezimiz sizi arayacak. Ref: ${v.reference}`;
    case "appointment_confirmed": return `Randevunuz onaylandı: ${v.startsAt ? fmt(v.startsAt) : "-"}, ${v.facilityLabel || ""}. Gelemeyecekseniz İPTAL yazın. Ref: ${v.reference}`;
    case "appointment_cancelled": return `Randevunuz iptal edildi. Yeni randevu için çağrı merkezimizi arayabilirsiniz. Ref: ${v.reference}`;
  }
}

/** Mesajda kişisel veri sızıntısına karşı son kontrol: TCKN, telefon, e-posta, tanı kelimeleri. */
export function assertSafeMessage(text: string) {
  const banned = [/\b[1-9]\d{10}\b/, /@/, /\b(?:0|90)?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/, /tanı|teşhis|kanser|tümör|depresyon|gebelik|hiv|hepatit/i];
  if (banned.some((re) => re.test(text))) throw new Error("Bildirim metni kişisel sağlık verisi veya iletişim bilgisi içeremez.");
  if (text.length > 320) throw new Error("Bildirim metni 320 karakteri aşamaz.");
  return text;
}

/** Hastanın yanıtı (görevli tarafından kaydedilir veya SMS/WhatsApp yanıt kodundan gelir). */
export const PATIENT_RESPONSES = { accepted: "Önerilen zamanı kabul etti", declined: "Başka zaman istedi", unreachable: "Ulaşılamadı", cancelled: "Randevusunu iptal etti" } as const;
export type PatientResponse = keyof typeof PATIENT_RESPONSES;
export const MAX_ATTEMPTS = 3;

export function maskContact(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 10) return `${digits.startsWith("90") ? "+90 " : ""}5** *** ${digits.slice(-4, -2)} ${digits.slice(-2)}`;
  if (value.includes("@")) { const [u, d] = value.split("@"); return `${u.slice(0, 1)}***@${d}`; }
  return "***";
}
