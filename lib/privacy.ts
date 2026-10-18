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
// Rakam içermeyen takma adlar yalnız bilinen kurum önekleriyle kabul edilir; "AYŞE.YILMAZ" gibi ad-soyad biçimleri reddedilir.
const ALIAS_PREFIXES = new Set(["HST", "HASTA", "KRM", "DEMO", "TEST", "EGT", "EĞT", "ODA", "TRN", "PLT", "PILOT", "PİLOT", "SNT", "HBYS", "ANON"]);
export function aliasLooksLikeName(value: string) {
  const v = String(value || "").trim();
  if (!v || /\d/.test(v)) return false;
  const first = v.split(/[-._\s]/)[0]?.toLocaleUpperCase("tr-TR") ?? "";
  return !ALIAS_PREFIXES.has(first);
}
export function validPatientAlias(value: string) {
  return /^(?:(?:HST|PAT|TRN|DEMO|TEST)-(?:[A-ZÇĞİÖŞÜ0-9]{1,12}-)*[0-9]{1,6}|PRT-[0-9]{1,6}[A-Z]?|EGT-HST-[0-9]{1,6})$/u.test(value) && !/\d{7,}/.test(value) && !redactPII(value).detected.length;
}

export const NAME_MASK = "[AD MASKELİ]";
// Operasyon sözlüğü: bu köklerle başlayan büyük harfli kelimeler kişi adı sayılmaz (birim, rol, kategori, kurum terimleri).
const NON_NAME_STEMS = [
  "acil","yonlendir","randevu","merkez","cagri","hasta","iletisim","kardiyo","kalp","damar","cerrahi","koroner","yogun","bakim","noroloji","norosir","ortopedi","travma","radyoloji","goruntule","laboratuv","biyokimya","onkoloji","kemoterapi","pediatri","cocuk","kadin","dogum","neonat","yenidogan","dahiliye","genel","gogus","goz","kulak","burun","bogaz","uroloji","nefroloji","diyaliz","endokrin","gastro","enfeksiyon","psikiyatri","fizik","tedavi","rehabilit","anestezi","ameliyat","poliklinik","klinik","klinig","servis","birim","rolu","rol","gorevli","operator","operasyon","yonetici","yonetim","mudur","koordinat","sorumlu","ekip","ekibi","vardiya","nobet","triyaj","eczane","sterilizasyon","temizlik","hijyen","guvenlik","teknik","biyomedikal","bilgi","islem","kalite","satinalma","depo","cevre","atik","kvkk","kisisel","veri","gizlilik","siber","denetim","sistem","otomatik","otomasyon","kural","tabanli","ozet","oneri","yapay","zeka","standart","talep","talebi","oncelikli","insan","incelemesi","inceleme","olasilik","sinyal","sinyali","geri","arama","aranacak","kuyruk","kuyrugu","devir","devri","egitim","pilot","sentetik","demo","kampus","hastane","hastanesi","saglik","sehir","ornek","telefon","web","form","santral","whatsapp","sms","eposta","takvim","hbys","fhir","api","ozel","kamu","universite","devlet","turkiye","istanbul","ankara","izmir","pazartesi","sali","carsamba","persembe","cuma","cumartesi","pazar","ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik","bugun","yarin","dun","sabah","aksam","gece","ogle","lutfen","merhaba","tesekkur","iyi","gunler","arayan","gorusme","kayit","kaydi","durum","yeni","acik","kapali","tamam","tamamlandi","bekliyor","onay","onayi","red","iptal","aktarma","aktar","kapat","basla","kabul","not","notu","masked","maskeli","ad","soyad","takma","dr","doc","prof","uzm","hemsire","sayin","bey","hanim","bay","bayan","kurum","sahibi","yardimci","asistan","ai","ayni","gun","ben","biz","siz","sen","onlar","bu","su","evet","hayir","gunaydin","selam","alo","rica","efendim","acaba","hocam","annem","babam","esim","oglum","kizim","kardesim","benim","bizim","sizin","adim","ismim","ama","ve","ile","icin","cok","daha","simdi","sonra","once","hemen","saat","dakika","yuksek","dusuk","orta","kritik","risk","agri","ates","kusma","kanama","nefes","bilinc","bayil","kriz","yanik","felc","inme",
];
const COMMON_FIRST_NAMES = new Set([
  "ayse","fatma","emine","hatice","zeynep","elif","meryem","sultan","hacer","merve","esra","busra","ozlem","yasemin","hulya","sevgi","leyla","gulsen","hanife","havva","zehra","rabia","kubra","tugba","ebru","derya","sibel","songul","filiz","aysel","nuray","serap","dilek","melek","asli",
  "mehmet","mustafa","ahmet","ali","huseyin","hasan","ibrahim","ismail","osman","yusuf","murat","omer","ramazan","halil","suleyman","abdullah","mahmut","recep","salih","fatih","kadir","emre","hakan","burak","serkan","volkan","onur","gokhan","erkan","tolga","cem","sinan","kemal","orhan","yasar","ekrem","selim","levent","baris","oguz","kaan","berk","enes","furkan","yunus","eren",
]);
const foldName = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/'.*$/, "");
const isNonName = (word: string) => {
  const w = foldName(word);
  if (w.length < 2) return true;
  return NON_NAME_STEMS.some(stem => stem.length >= 4 ? w.startsWith(stem) : w === stem);
};
const WORD = "[A-ZÇĞİÖŞÜ][a-zçğıöşüâîû]+(?:['’][a-zçğıöşü]+)?";
const CAPS = "[A-ZÇĞİÖŞÜ]{2,}(?:['’][A-ZÇĞİÖŞÜa-zçğıöşü]+)?";
const B = "(?<![\\p{L}\\p{N}_\\-\\[@.])";
const A = "(?![\\p{L}\\p{N}_\\-\\]@])";
const TITLE_RE = new RegExp(`${B}(Dr|Doç|Prof|Uzm|Op|Hemşire|Hem|Sn|Sayın|Bay|Bayan)(\\.?)(\\s+)(?:${WORD}|${CAPS})(?:\\s+(?:${WORD}|${CAPS})){0,2}${A}`, "gu");
const LABEL_RE = /(?<![\p{L}])((?:hasta(?:nın)?\s+)?ad[ıi]?\s*(?:ve\s+)?soyad[ıi]?|hasta(?:nın)?\s+ad[ıi]|isim|ismi)(\s*[:=]\s*)([^\n,;:()\[\]]{2,60}?)(?=$|[\n,;()]|\.\s|\s+(?:tel|telefon|yaş|doğum|birim|not)\b)/giu;
const HONORIFIC_RE = new RegExp(`${B}(${WORD})(\\s+)(Hanım|Bey|Hanımefendi|Beyefendi)${A}`, "gu");
const RUN_RE = new RegExp(`${B}(?:${WORD})(?:\\s+(?:${WORD}))+${A}`, "gu");
const CAPS_RUN_RE = new RegExp(`${B}(?:${CAPS})(?:\\s+(?:${CAPS}))+${A}`, "gu");
const SINGLE_RE = new RegExp(`${B}${WORD}${A}`, "gu");

function maskRun(run: string) {
  const words = run.split(/(\s+)/);
  const out: string[] = [];
  let pending: string[] = [];
  const flush = () => {
    const names = pending.filter(w => !/^\s+$/.test(w));
    if (names.length >= 2) out.push(NAME_MASK); else out.push(...pending);
    pending = [];
  };
  for (const part of words) {
    if (/^\s+$/.test(part)) { if (pending.length) pending.push(part); else out.push(part); continue; }
    if (isNonName(part)) {
      // Sondaki boşluğu korumak için bekleyen boşluğu sonradan ekle.
      const trailing = pending.length && /^\s+$/.test(pending[pending.length - 1]) ? pending.pop()! : "";
      flush(); if (trailing) out.push(trailing); out.push(part);
    } else pending.push(part);
  }
  const trailing = pending.length && /^\s+$/.test(pending[pending.length - 1]) ? pending.pop()! : "";
  flush(); if (trailing) out.push(trailing);
  return out.join("");
}

/** Serbest metindeki olası kişi adlarını maskeler (sezgisel; her adı yakalama garantisi yoktur). */
export function maskPersonNames(input: string): string {
  if (!input || typeof input !== "string") return input;
  let text = input.normalize("NFC");
  text = text.replace(LABEL_RE, (_m, label: string, sep: string) => `${label}${sep}${NAME_MASK}`);
  text = text.replace(TITLE_RE, (m, title: string, dot: string, space: string) => {
    const rest = m.slice(title.length + dot.length + space.length);
    if (rest.split(/\s+/).every(isNonName)) return m;
    return `${title}${dot}${space}${NAME_MASK}`;
  });
  text = text.replace(HONORIFIC_RE, (m, name: string, space: string, hon: string) => isNonName(name) ? m : `${NAME_MASK}${space}${hon}`);
  text = text.replace(RUN_RE, run => maskRun(run));
  text = text.replace(CAPS_RUN_RE, run => maskRun(run));
  text = text.replace(SINGLE_RE, word => COMMON_FIRST_NAMES.has(foldName(word)) ? NAME_MASK : word);
  return text;
}

/** Ekranda gösterilecek serbest metin: kimlik/iletişim + olası ad maskesi. */
export function redactForDisplay(input: string): string {
  if (!input || typeof input !== "string") return input;
  return maskPersonNames(redactPII(input).maskedText);
}

/** Personel e-postasını ekranda kısaltır: "ayse.kaya@kurum.org" → "ayse.k…@kurum". */
export function maskEmail(value?: string | null): string {
  const v = String(value || "");
  const at = v.indexOf("@");
  if (at < 1) return v;
  const local = v.slice(0, at), domain = v.slice(at + 1).split(".")[0] || "";
  return `${local.slice(0, Math.min(3, local.length))}…@${domain}`;
}
const fold = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
// Yalnız 112 bilgilendirmesini tetikleyen ifadeler (sınıflandırma değil). Kök biçimler: Türkçe çekim ekleri ("ağrısı", "ağrım", "ağrısından", "bayıldı", "bayılıyor") yakalanır.
// Uzun kökler (6+ harf) ek alabilir; kısa kökler ("felç", "inme") yalnız tam kelime olarak eşleşir
// ki "inmek" gibi ilgisiz kelimeler acil sayılmasın.
const critical = ["kalp krizi", "zehirlen", "anafilaksi", "havale", "ciddi yanik", "agir yanik", "gogus agri", "gogsum agri", "nefes alamiyor", "nefes darligi cok", "siddetli kanama", "kanamasi durmuyor", "bilinc kaybi", "bilincini kaybet", "solunum durma", "nobet geciri", "havale geciri", "felc", "inme", "bayildi", "bayiliyor", "bayilma", "asiri doz", "intihar"];
/** Hasta/arayan metninde acil durum ifadesi geçerse yalnız sabit 112 bilgilendirmesi gösterilir ve otomatik akış
 * bir görevliye bırakılır. Puan, aciliyet sınıfı, klinik birim önerisi veya öncelik ÜRETİLMEZ (ADR-003: Klinorbis
 * belirtiden triyaj yapmaz; öncelik yalnız yetkili personelden veya HBYS'den gelir). */
export const EMERGENCY_NOTICE_TEXT = "Bu kanal acil sağlık hizmeti değildir. Tıbbi acil durumda hemen 112'yi arayın.";
export function emergencyWordsNotice(text: string): { notice: boolean; matched: string | null } {
  const normalized = fold(text);
  for (const phrase of critical) {
    const tail = phrase.replace(/\s/g, "").length >= 5 ? "[a-z]*" : "";
    const regex = new RegExp(`(?<![a-z])${phrase}${tail}(?![a-z])`, "g");
    for (const match of normalized.matchAll(regex)) {
      const after = normalized.slice((match.index ?? 0) + match[0].length);
      if (/^\s*(?:yok(?:tu)?|degil|olmadi|bulunmuyor)\b/.test(after)) continue;
      return { notice: true, matched: phrase };
    }
  }
  return { notice: false, matched: null };
}

