// Birim rehberi ve talep türleri.
//
// Hastanedeki ~100 birim, kullanıcıyı boğmamak için 6 sade gruba ayrılır. Tanı birimlerinde (laboratuvar, radyoloji…)
// birimin içindeki hizmetler (röntgen, BT, MR, kan alma…) ayrı birim yapılmadan "hizmet" olarak gösterilir.
//
// Talep türleri: personelin başka bir birimden istediği operasyonel işler. Her tür tek bir birime gider (yönlendirme),
// o birimde işi birim sorumlusu dağıtır ya da ekip kendisi kabul eder. Yönlendirme bilgi işlem / operasyon yöneticisi
// tarafından "Birimler ve Yönlendirme" ekranından değiştirilebilir (bkz. lib/routing.ts).
//
// Klinik sınır (ADR-003): Tahlil, görüntüleme, kan ürünü veya ilaç İSTEMİ hekim tarafından HBYS'de yapılır.
// Klinorbis bu türlerde yalnız lojistik ve koordinasyonu (numune taşıma, hastayı çekime götürme, gecikme takibi) yürütür.
import { HOSPITAL_UNITS, type HospitalUnitSeed } from "./hospital-units";

export type UnitGroupKey = "klinik" | "tani" | "hasta" | "destek" | "teknik" | "yonetim";
export const UNIT_GROUPS: { key: UnitGroupKey; label: string; hint: string }[] = [
  { key: "klinik", label: "Klinik birimler", hint: "Servisler, poliklinikler, yoğun bakım, ameliyathane, acil" },
  { key: "tani", label: "Tanı ve tetkik", hint: "Laboratuvar, kan alma, radyoloji (röntgen, BT, MR, ultrason), patoloji, nükleer tıp" },
  { key: "hasta", label: "Hasta hizmetleri", hint: "Kabul, randevu, çağrı merkezi, yatak, transfer, taburculuk, danışma" },
  { key: "destek", label: "Destek hizmetleri", hint: "Temizlik, hasta taşıma, eczane, sterilizasyon, mutfak, çamaşırhane, güvenlik" },
  { key: "teknik", label: "Teknik ve bilgi işlem", hint: "Bilgi teknolojileri, biyomedikal, teknik hizmetler, satın alma" },
  { key: "yonetim", label: "Yönetim ve güvence", hint: "Kalite, enfeksiyon kontrol, hasta güvenliği, KVKK, bilgi güvenliği, insan kaynakları" },
];

const GROUP_BY_CODE: Record<string, UnitGroupKey> = {
  // Tanı ve tetkik
  LAB: "tani", NMK: "tani", RAD: "tani", GRD: "tani", NTP: "tani", PAT: "tani", KAN: "tani", NFS: "tani", EDS: "tani",
  // Hasta hizmetleri
  RND: "hasta", CAG: "hasta", HIL: "hasta", ACY: "hasta", KBL: "hasta", YTK: "hasta", TRF: "hasta", TBR: "hasta", VZN: "hasta", PRV: "hasta",
  UHS: "hasta", DNS: "hasta", SHZ: "hasta", HHK: "hasta", ARS: "hasta", EVS: "hasta",
  // Destek
  CTM: "destek", ULS: "destek", ECZ: "destek", MSS: "destek", MTF: "destek", CMS: "destek", GVN: "destek", MRG: "destek", CEV: "destek", DYT: "destek",
  // Teknik ve bilgi işlem
  BTI: "teknik", BMD: "teknik", TKH: "teknik", SAT: "teknik",
  // Yönetim ve güvence
  KLT: "yonetim", EKK: "yonetim", HGV: "yonetim", ETK: "yonetim", ISG: "yonetim", EGT: "yonetim", KVT: "yonetim", BGV: "yonetim", IKY: "yonetim",
};
export function groupOf(unit: Pick<HospitalUnitSeed, "code" | "kind">): UnitGroupKey {
  return GROUP_BY_CODE[unit.code] ?? (unit.kind === "governance" ? "yonetim" : unit.kind === "diagnostic" ? "tani" : unit.kind === "operational" ? "destek" : "klinik");
}

/** Birimin içindeki hizmetler (ayrı birim açmadan). Klinik karar içermez; yalnız hangi işin nerede yapıldığını gösterir. */
export const UNIT_SERVICES: Record<string, string[]> = {
  LAB: ["Biyokimya", "Hematoloji (hemogram)", "Mikrobiyoloji ve kültür", "Hormon ve immünoloji", "İdrar ve gaita tetkikleri", "Acil laboratuvar"],
  NMK: ["Kan alma", "Numune kabul ve etiket", "Servisten gelen numunelerin teslimi"],
  RAD: ["Röntgen (direkt grafi)", "Bilgisayarlı tomografi (BT)", "Manyetik rezonans (MR)", "Ultrason", "Mamografi", "Floroskopi", "Kemik yoğunluğu (DEXA)"],
  GRD: ["Anjiyografi", "Girişimsel işlem salonu"],
  NTP: ["PET-BT", "Sintigrafi"],
  PAT: ["Doku ve biyopsi örneği kabulü", "Sitoloji", "Frozen (ameliyat sırası) koordinasyonu"],
  KAN: ["Kan grubu ve çapraz karşılaştırma numunesi", "Kan ürünü hazırlama ve teslim", "Bağışçı kabulü"],
  NFS: ["EEG", "EMG"],
  EDS: ["Gastroskopi", "Kolonoskopi", "Bronkoskopi"],
  ECZ: ["Servis ilaç talebi teslimi", "Tıbbi sarf malzeme", "Acil ilaç temini"],
  MSS: ["Steril set teslimi", "Kirli set toplama"],
  CTM: ["Taburcu sonrası oda temizliği", "İzolasyon temizliği", "Alan / dökülme temizliği", "Tıbbi atık toplama"],
  ULS: ["Hasta taşıma (sedye / tekerlekli sandalye)", "Numune taşıma", "Tetkike götürme ve geri getirme"],
  BTI: ["Bilgisayar ve yazıcı", "Ağ ve internet", "HBYS kullanıcı / şifre", "Telefon ve santral", "Barkod / etiket yazıcısı"],
  BMD: ["Tıbbi cihaz arızası", "Periyodik bakım ve kalibrasyon", "Yedek cihaz temini"],
  TKH: ["Elektrik ve aydınlatma", "Su ve tesisat", "Isıtma, soğutma, havalandırma", "Asansör", "Tıbbi gaz", "Oda ve mobilya onarımı"],
  MTF: ["Hasta yemeği", "Diyet tepsisi", "Refakatçi yemeği"],
  CMS: ["Çarşaf / nevresim", "Önlük ve tekstil"],
  GVN: ["Olay müdahalesi", "Kayıp eşya", "Ziyaretçi kontrolü"],
  ACS: ["Kırmızı / sarı / yeşil alan", "Gözlem", "Servise yatış koordinasyonu"],
  YTK: ["Yatak ayırma", "Kapasite tablosu", "Boş yatak bilgisi"],
};

export type RequestType = {
  code: string; label: string; group: string; defaultUnit: string; minutes: number; priority: "Normal" | "Yüksek";
  hint: string; fields?: ("location" | "target" | "device")[]; fault?: boolean; clinicalNote?: string;
};

const HBYS = "Tetkik veya ürün istemi hekim tarafından HBYS'de yapılır; bu talep yalnız koordinasyon içindir.";
/** Talep türleri. Varsayılan birim burada; kurum kendi düzenine göre "Birimler ve Yönlendirme" ekranından değiştirir. */
export const REQUEST_TYPES: RequestType[] = [
  // Temizlik ve hasta taşıma
  { code: "temizlik-oda", label: "Oda / yatak temizliği", group: "Temizlik ve taşıma", defaultUnit: "CTM", minutes: 45, priority: "Normal", hint: "Taburcu sonrası veya kirlenen oda", fields: ["location"] },
  { code: "temizlik-alan", label: "Alan temizliği / dökülme", group: "Temizlik ve taşıma", defaultUnit: "CTM", minutes: 20, priority: "Yüksek", hint: "Koridor, bekleme alanı, dökülme", fields: ["location"] },
  { code: "atik-toplama", label: "Tıbbi atık toplama", group: "Temizlik ve taşıma", defaultUnit: "CTM", minutes: 60, priority: "Normal", hint: "Dolu atık kutusu", fields: ["location"] },
  { code: "hasta-tasima", label: "Hasta taşıma", group: "Temizlik ve taşıma", defaultUnit: "ULS", minutes: 20, priority: "Normal", hint: "Sedye veya tekerlekli sandalye ile kurum içi taşıma", fields: ["location", "target"] },
  { code: "numune-tasima", label: "Numune taşıma (laboratuvara)", group: "Temizlik ve taşıma", defaultUnit: "ULS", minutes: 15, priority: "Yüksek", hint: "Servisten laboratuvar / patolojiye numune götürme", fields: ["location", "target"] },
  // Tanı ve tetkik koordinasyonu
  { code: "kan-alma", label: "Serviste kan alma koordinasyonu", group: "Tanı ve tetkik", defaultUnit: "NMK", minutes: 30, priority: "Normal", hint: "İstemi HBYS'de yapılmış hastadan kan alınamadı / tekrar gerekiyor", fields: ["location"], clinicalNote: HBYS },
  { code: "lab-gecikme", label: "Laboratuvar sonucu gecikti", group: "Tanı ve tetkik", defaultUnit: "LAB", minutes: 30, priority: "Normal", hint: "Beklenen sonuç süresi aşıldı; laboratuvar durumu bildirsin", clinicalNote: HBYS },
  { code: "goruntuleme-sira", label: "Görüntüleme sıra / saat koordinasyonu", group: "Tanı ve tetkik", defaultUnit: "RAD", minutes: 30, priority: "Normal", hint: "Röntgen, BT, MR, ultrason için hastanın çekim saati", fields: ["location"], clinicalNote: HBYS },
  { code: "goruntuleme-gecikme", label: "Görüntüleme raporu gecikti", group: "Tanı ve tetkik", defaultUnit: "RAD", minutes: 60, priority: "Normal", hint: "Çekim yapıldı, rapor süresi aşıldı", clinicalNote: HBYS },
  { code: "kan-urunu", label: "Kan ürünü teslim koordinasyonu", group: "Tanı ve tetkik", defaultUnit: "KAN", minutes: 20, priority: "Yüksek", hint: "İstemi yapılmış kan ürününün servise teslimi", fields: ["location"], clinicalNote: HBYS },
  { code: "patoloji-materyal", label: "Patoloji materyali teslimi", group: "Tanı ve tetkik", defaultUnit: "PAT", minutes: 30, priority: "Normal", hint: "Ameliyathane / servisten doku örneği", fields: ["location"], clinicalNote: HBYS },
  // Eczane ve malzeme
  { code: "ilac-teslim", label: "İlaç / malzeme teslimi", group: "Eczane ve malzeme", defaultUnit: "ECZ", minutes: 45, priority: "Normal", hint: "Onaylı servis talebinin teslimi", fields: ["location"], clinicalNote: "İlaç istemi hekim tarafından HBYS'de yapılır." },
  { code: "steril-set", label: "Steril set talebi", group: "Eczane ve malzeme", defaultUnit: "MSS", minutes: 45, priority: "Normal", hint: "Ameliyathane, servis veya poliklinik için set", fields: ["location"] },
  { code: "tekstil", label: "Çarşaf / tekstil", group: "Eczane ve malzeme", defaultUnit: "CMS", minutes: 60, priority: "Normal", hint: "Temiz çarşaf, nevresim, önlük", fields: ["location"] },
  { code: "yemek", label: "Yemek / diyet tepsisi", group: "Eczane ve malzeme", defaultUnit: "MTF", minutes: 45, priority: "Normal", hint: "Eksik veya geç gelen tepsi", fields: ["location"] },
  // Teknik arıza
  { code: "ariza-cihaz", label: "Tıbbi cihaz arızası", group: "Teknik arıza", defaultUnit: "BMD", minutes: 60, priority: "Yüksek", hint: "Monitör, pompa, ventilatör, cihaz alarmı", fields: ["location", "device"], fault: true },
  { code: "ariza-elektrik", label: "Elektrik / aydınlatma", group: "Teknik arıza", defaultUnit: "TKH", minutes: 60, priority: "Normal", hint: "Priz, lamba, sigorta", fields: ["location"], fault: true },
  { code: "ariza-su", label: "Su / tesisat", group: "Teknik arıza", defaultUnit: "TKH", minutes: 60, priority: "Normal", hint: "Akıntı, tıkanıklık, sıcak su", fields: ["location"], fault: true },
  { code: "ariza-iklim", label: "Isıtma / soğutma", group: "Teknik arıza", defaultUnit: "TKH", minutes: 120, priority: "Normal", hint: "Klima, kalorifer, havalandırma", fields: ["location"], fault: true },
  { code: "ariza-asansor", label: "Asansör", group: "Teknik arıza", defaultUnit: "TKH", minutes: 30, priority: "Yüksek", hint: "Durmuş veya arızalı asansör", fields: ["location"], fault: true },
  { code: "ariza-oda", label: "Oda / mobilya onarımı", group: "Teknik arıza", defaultUnit: "TKH", minutes: 240, priority: "Normal", hint: "Kapı, dolap, yatak mekanizması", fields: ["location"], fault: true },
  // Bilgi işlem
  { code: "bt-bilgisayar", label: "Bilgisayar / yazıcı", group: "Bilgi işlem", defaultUnit: "BTI", minutes: 60, priority: "Normal", hint: "Açılmıyor, yazdırmıyor, toner", fields: ["location", "device"], fault: true },
  { code: "bt-ag", label: "Ağ / internet", group: "Bilgi işlem", defaultUnit: "BTI", minutes: 30, priority: "Yüksek", hint: "Bağlantı yok, sistem yavaş", fields: ["location"], fault: true },
  { code: "bt-hbys-erisim", label: "HBYS kullanıcı / şifre", group: "Bilgi işlem", defaultUnit: "BTI", minutes: 30, priority: "Normal", hint: "Giriş yapılamıyor, yetki eksik (şifrenizi yazmayın)", fault: true },
  { code: "bt-barkod", label: "Barkod / etiket yazıcısı", group: "Bilgi işlem", defaultUnit: "BTI", minutes: 30, priority: "Yüksek", hint: "Numune etiketi basılmıyor", fields: ["location", "device"], fault: true },
  // İdari ve hasta hizmetleri
  { code: "arsiv-dosya", label: "Arşivden dosya talebi", group: "İdari ve hasta hizmetleri", defaultUnit: "ARS", minutes: 240, priority: "Normal", hint: "Eski dosya veya belge" },
  { code: "sosyal-hizmet", label: "Sosyal hizmet desteği", group: "İdari ve hasta hizmetleri", defaultUnit: "SHZ", minutes: 240, priority: "Normal", hint: "Taburculuk, barınma, refakatçi desteği" },
  { code: "guvenlik", label: "Güvenlik desteği", group: "İdari ve hasta hizmetleri", defaultUnit: "GVN", minutes: 10, priority: "Yüksek", hint: "Olay, tartışma, kayıp eşya", fields: ["location"] },
];

export const requestType = (code: string) => REQUEST_TYPES.find((t) => t.code === code);
export const unitExists = (code: string) => HOSPITAL_UNITS.some((u) => u.code === code);
