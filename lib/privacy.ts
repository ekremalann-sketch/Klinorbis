export type RedactionResult = { maskedText: string; detected: string[] };
function validTckn(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  return ((d.slice(0, 9).reduce((a, n, i) => a + n * (i % 2 === 0 ? 7 : -1), 0) % 10 + 10) % 10 === d[9]) && d.slice(0, 10).reduce((a, n) => a + n, 0) % 10 === d[10];
}
function validCard(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const sum = [...digits].reverse().reduce((total, digit, i) => {
    let n = Number(digit); if (i % 2) { n *= 2; if (n > 9) n -= 9; } return total + n;
  }, 0);
  return sum % 10 === 0;
}
export function redactPII(input: string): RedactionResult {
  let maskedText = input.normalize("NFC"); const detected: string[] = [];
  const mark = (type: string, token: string) => { detected.push(type); return token; };
  // Unicode boundaries avoid leaking the Turkish part of an email address.
  maskedText = maskedText.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, () => mark("E-POSTA", "[EMAIL_MASKED]"));
  maskedText = maskedText.replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/gi, () => mark("IBAN", "[IBAN_MASKED]"));
  maskedText = maskedText.replace(/(?<!\d)(?:[1-9][ .-]?)(?:\d[ .-]?){9}\d(?!\d)/g, value => validTckn(value.replace(/\D/g, "")) ? mark("TCKN", "[TCKN_MASKED]") : value);
  maskedText = maskedText.replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, value => validCard(value) ? mark("KART", "[CARD_MASKED]") : value);
  maskedText = maskedText.replace(/\+\d{1,3}[\s().-]*(?:\d[\s().-]*){7,12}\d(?!\d)/g, () => mark("TELEFON", "[PHONE_MASKED]"));
  maskedText = maskedText.replace(/(?<!\d)(?:0|90)?(?:5\d{2}|[2-4]\d{2}|850)[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/g, () => mark("TELEFON", "[PHONE_MASKED]"));
  return { maskedText, detected: [...new Set(detected)] };
}
export function validPatientAlias(value: string) {
  return /^(?=.*[A-ZÇĞİÖŞÜ])[A-ZÇĞİÖŞÜ0-9._-]{3,40}$/u.test(value) && !/\d{7,}/.test(value) && !redactPII(value).detected.length;
}
const fold = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
const critical = ["gogus agrisi", "nefes alamiyorum", "nefes alamiyor", "siddetli kanama", "bilinc kaybi", "solunum durmasi", "havale", "felc", "inme", "bayildi", "asiri doz"];
export function urgencySignal(text: string) {
  const normalized = fold(text);
  for (const phrase of critical) {
    const regex = new RegExp(`(?<![a-z])${phrase}(?![a-z])`, "g");
    for (const match of normalized.matchAll(regex)) {
      const after = normalized.slice((match.index ?? 0) + phrase.length);
      if (/^\s*(?:yok(?:tu)?|degil|olmadi|bulunmuyor)\b/.test(after)) continue;
      return { level: 5 as const, isEmergency: true, matched: phrase, category: "ACİL OLASILIK SİNYALİ", recommendedUnit: "Acil Yönlendirme" };
    }
  }
  const high = ["yuksek ates", "siddetli agri", "durmayan kusma"].find(x => normalized.includes(x));
  return high ? { level: 4 as const, isEmergency: false, matched: high, category: "ÖNCELİKLİ İNSAN İNCELEMESİ", recommendedUnit: "Hasta İletişim" } : { level: 2 as const, isEmergency: false, matched: null, category: "STANDART TALEP", recommendedUnit: "Hasta İletişim" };
}
