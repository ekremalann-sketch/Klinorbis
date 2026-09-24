export type HospitalUnitSeed = {
  code: string;
  name: string;
  kind: "clinical" | "diagnostic" | "operational" | "governance";
  scope: string;
  slaMinutes: number;
  assignedRole: string;
};

export const HOSPITAL_UNITS: HospitalUnitSeed[] = [
  { code: "ACY", name: "Acil Yönlendirme", kind: "clinical", scope: "Acil olasılık sinyali ve yetkili sağlık personeline devir", slaMinutes: 2, assignedRole: "Klinik Triyaj Rolü" },
  { code: "RND", name: "Randevu Merkezi", kind: "operational", scope: "Randevu talebi, slot doğrulama, iptal ve değişiklik", slaMinutes: 15, assignedRole: "Randevu Operatörü" },
  { code: "CAG", name: "Çağrı Merkezi", kind: "operational", scope: "Gelen çağrı, kimlik doğrulama ve geri arama kuyruğu", slaMinutes: 1, assignedRole: "Çağrı Merkezi Görevlisi" },
  { code: "HIL", name: "Hasta İletişim", kind: "operational", scope: "Genel başvuru, yönlendirme ve hasta bilgilendirme", slaMinutes: 15, assignedRole: "Hasta İletişim Görevlisi" },
  { code: "KRD", name: "Kardiyoloji", kind: "clinical", scope: "Kardiyoloji poliklinik ve konsültasyon talepleri", slaMinutes: 30, assignedRole: "Kardiyoloji Birim Rolü" },
  { code: "KVC", name: "Kalp ve Damar Cerrahisi", kind: "clinical", scope: "Kalp-damar cerrahisi değerlendirme, ameliyat hazırlığı ve kontrol koordinasyonu", slaMinutes: 20, assignedRole: "Kalp Damar Cerrahisi Birim Rolü" },
  { code: "KOR", name: "Koroner Yoğun Bakım", kind: "clinical", scope: "Koroner yoğun bakım yatak, devir ve kritik bakım koordinasyonu", slaMinutes: 2, assignedRole: "Koroner Yoğun Bakım Rolü" },
  { code: "DHL", name: "İç Hastalıkları", kind: "clinical", scope: "Dahiliye poliklinik ve konsültasyon kuyruğu", slaMinutes: 30, assignedRole: "Dahiliye Birim Rolü" },
  { code: "GAS", name: "Gastroenteroloji", kind: "clinical", scope: "Gastroenteroloji poliklinik, endoskopi ve izlem koordinasyonu", slaMinutes: 30, assignedRole: "Gastroenteroloji Birim Rolü" },
  { code: "NEF", name: "Nefroloji", kind: "clinical", scope: "Nefroloji, diyaliz ve böbrek hastalıkları koordinasyonu", slaMinutes: 25, assignedRole: "Nefroloji Birim Rolü" },
  { code: "END", name: "Endokrinoloji ve Metabolizma", kind: "clinical", scope: "Endokrinoloji, diyabet ve metabolizma başvuruları", slaMinutes: 30, assignedRole: "Endokrinoloji Birim Rolü" },
  { code: "RMT", name: "Romatoloji", kind: "clinical", scope: "Romatoloji poliklinik ve tedavi izlem koordinasyonu", slaMinutes: 30, assignedRole: "Romatoloji Birim Rolü" },
  { code: "HEM", name: "Hematoloji", kind: "clinical", scope: "Hematoloji poliklinik, tedavi ve transfüzyon koordinasyonu", slaMinutes: 20, assignedRole: "Hematoloji Birim Rolü" },
  { code: "GER", name: "Geriatri", kind: "clinical", scope: "İleri yaş hasta erişimi ve çok disiplinli bakım koordinasyonu", slaMinutes: 30, assignedRole: "Geriatri Birim Rolü" },
  { code: "ALJ", name: "Alerji ve İmmünoloji", kind: "clinical", scope: "Alerji, immünoloji test ve poliklinik koordinasyonu", slaMinutes: 30, assignedRole: "Alerji İmmünoloji Birim Rolü" },
  { code: "GCR", name: "Genel Cerrahi", kind: "clinical", scope: "Cerrahi değerlendirme ve ameliyat planlama", slaMinutes: 20, assignedRole: "Genel Cerrahi Birim Rolü" },
  { code: "GCS", name: "Göğüs Cerrahisi", kind: "clinical", scope: "Göğüs cerrahisi değerlendirme ve operasyon hazırlığı", slaMinutes: 20, assignedRole: "Göğüs Cerrahisi Birim Rolü" },
  { code: "PLC", name: "Plastik, Rekonstrüktif ve Estetik Cerrahi", kind: "clinical", scope: "Plastik ve rekonstrüktif cerrahi başvuru koordinasyonu", slaMinutes: 25, assignedRole: "Plastik Cerrahi Birim Rolü" },
  { code: "CCT", name: "Çocuk Cerrahisi", kind: "clinical", scope: "Çocuk cerrahisi değerlendirme ve ameliyat hazırlığı", slaMinutes: 15, assignedRole: "Çocuk Cerrahisi Birim Rolü" },
  { code: "ORT", name: "Ortopedi ve Travmatoloji", kind: "clinical", scope: "Ortopedi başvuruları ve kontrol planları", slaMinutes: 25, assignedRole: "Ortopedi Birim Rolü" },
  { code: "NRL", name: "Nöroloji", kind: "clinical", scope: "Nöroloji poliklinik ve tetkik koordinasyonu", slaMinutes: 25, assignedRole: "Nöroloji Birim Rolü" },
  { code: "BSC", name: "Beyin ve Sinir Cerrahisi", kind: "clinical", scope: "Nöroşirürji değerlendirme kuyruğu", slaMinutes: 20, assignedRole: "Nöroşirürji Birim Rolü" },
  { code: "GHS", name: "Göğüs Hastalıkları", kind: "clinical", scope: "Solunum sistemi başvuruları", slaMinutes: 20, assignedRole: "Göğüs Hastalıkları Birim Rolü" },
  { code: "KDH", name: "Kadın Hastalıkları ve Doğum", kind: "clinical", scope: "Kadın sağlığı, gebelik ve doğum hizmetleri", slaMinutes: 20, assignedRole: "Kadın Doğum Birim Rolü" },
  { code: "PER", name: "Perinatoloji ve Yüksek Riskli Gebelik", kind: "clinical", scope: "Perinatoloji randevu, tetkik ve çok disiplinli takip koordinasyonu", slaMinutes: 15, assignedRole: "Perinatoloji Birim Rolü" },
  { code: "IVF", name: "İnfertilite ve Üremeye Yardımcı Tedavi", kind: "clinical", scope: "İnfertilite başvurusu, ön değerlendirme ve tedavi takvimi koordinasyonu", slaMinutes: 30, assignedRole: "İnfertilite Birim Rolü" },
  { code: "CDH", name: "Çocuk Sağlığı ve Hastalıkları", kind: "clinical", scope: "Pediatri poliklinik ve izlem hizmetleri", slaMinutes: 15, assignedRole: "Pediatri Birim Rolü" },
  { code: "NEO", name: "Yenidoğan Yoğun Bakım", kind: "clinical", scope: "Yenidoğan yoğun bakım yatak, devir ve aile iletişimi koordinasyonu", slaMinutes: 2, assignedRole: "Yenidoğan Yoğun Bakım Rolü" },
  { code: "PKR", name: "Çocuk Kardiyolojisi", kind: "clinical", scope: "Çocuk kardiyoloji poliklinik ve tetkik koordinasyonu", slaMinutes: 15, assignedRole: "Çocuk Kardiyoloji Birim Rolü" },
  { code: "PNR", name: "Çocuk Nörolojisi", kind: "clinical", scope: "Çocuk nöroloji poliklinik ve tetkik koordinasyonu", slaMinutes: 15, assignedRole: "Çocuk Nöroloji Birim Rolü" },
  { code: "PGE", name: "Çocuk Gastroenterolojisi", kind: "clinical", scope: "Çocuk gastroenteroloji başvuru ve işlem koordinasyonu", slaMinutes: 20, assignedRole: "Çocuk Gastroenteroloji Birim Rolü" },
  { code: "PNF", name: "Çocuk Nefrolojisi", kind: "clinical", scope: "Çocuk nefroloji poliklinik ve izlem koordinasyonu", slaMinutes: 20, assignedRole: "Çocuk Nefroloji Birim Rolü" },
  { code: "POH", name: "Çocuk Hematoloji ve Onkolojisi", kind: "clinical", scope: "Pediatrik hematoloji-onkoloji randevu ve tedavi koordinasyonu", slaMinutes: 15, assignedRole: "Çocuk Hematoloji Onkoloji Rolü" },
  { code: "KBB", name: "Kulak Burun Boğaz", kind: "clinical", scope: "KBB poliklinik başvuruları", slaMinutes: 25, assignedRole: "KBB Birim Rolü" },
  { code: "GOZ", name: "Göz Hastalıkları", kind: "clinical", scope: "Göz polikliniği ve tetkik planlaması", slaMinutes: 25, assignedRole: "Göz Birim Rolü" },
  { code: "URL", name: "Üroloji", kind: "clinical", scope: "Üroloji poliklinik ve işlem koordinasyonu", slaMinutes: 25, assignedRole: "Üroloji Birim Rolü" },
  { code: "DRM", name: "Dermatoloji", kind: "clinical", scope: "Deri hastalıkları poliklinik kuyruğu", slaMinutes: 30, assignedRole: "Dermatoloji Birim Rolü" },
  { code: "PSK", name: "Ruh Sağlığı ve Hastalıkları", kind: "clinical", scope: "Psikiyatri randevu ve güvenli yönlendirme", slaMinutes: 20, assignedRole: "Ruh Sağlığı Birim Rolü" },
  { code: "FTR", name: "Fizik Tedavi ve Rehabilitasyon", kind: "clinical", scope: "Rehabilitasyon planı ve seans koordinasyonu", slaMinutes: 30, assignedRole: "FTR Birim Rolü" },
  { code: "ALG", name: "Algoloji ve Ağrı", kind: "clinical", scope: "Ağrı polikliniği, girişim ve takip koordinasyonu", slaMinutes: 20, assignedRole: "Algoloji Birim Rolü" },
  { code: "ANR", name: "Anesteziyoloji ve Reanimasyon", kind: "clinical", scope: "Ameliyat öncesi değerlendirme ve yoğun bakım", slaMinutes: 10, assignedRole: "Anestezi Birim Rolü" },
  { code: "ONK", name: "Onkoloji", kind: "clinical", scope: "Onkoloji randevu ve tedavi koordinasyonu", slaMinutes: 20, assignedRole: "Onkoloji Birim Rolü" },
  { code: "RON", name: "Radyasyon Onkolojisi", kind: "clinical", scope: "Radyoterapi planlama, seans ve kontrol koordinasyonu", slaMinutes: 20, assignedRole: "Radyasyon Onkolojisi Rolü" },
  { code: "PAL", name: "Palyatif Bakım", kind: "clinical", scope: "Palyatif bakım kabul, yatak ve aile iletişimi koordinasyonu", slaMinutes: 15, assignedRole: "Palyatif Bakım Birim Rolü" },
  { code: "ONA", name: "Organ Nakli Merkezi", kind: "clinical", scope: "Organ nakli aday, kurul, yatış ve izlem koordinasyonu", slaMinutes: 10, assignedRole: "Organ Nakli Koordinasyon Rolü" },
  { code: "DYT", name: "Beslenme ve Diyet", kind: "clinical", scope: "Beslenme değerlendirme ve diyetisyen randevu koordinasyonu", slaMinutes: 45, assignedRole: "Beslenme Diyet Birim Rolü" },
  { code: "CHK", name: "Check-Up ve Koruyucu Sağlık", kind: "clinical", scope: "Check-up paket, hazırlık ve çok branşlı randevu koordinasyonu", slaMinutes: 45, assignedRole: "Check-Up Koordinasyon Rolü" },
  { code: "UYM", name: "Uyku Bozuklukları Merkezi", kind: "clinical", scope: "Uyku laboratuvarı randevu, hazırlık ve sonuç erişimi", slaMinutes: 30, assignedRole: "Uyku Merkezi Birim Rolü" },
  { code: "YOG", name: "Yoğun Bakım", kind: "clinical", scope: "Yatak, devir ve kritik bakım koordinasyonu", slaMinutes: 2, assignedRole: "Yoğun Bakım Birim Rolü" },
  { code: "AML", name: "Ameliyathane", kind: "clinical", scope: "Salon, ekip ve vaka planlama", slaMinutes: 10, assignedRole: "Ameliyathane Koordinasyon Rolü" },
  { code: "RAD", name: "Radyoloji", kind: "diagnostic", scope: "Görüntüleme randevusu ve sonuç erişimi", slaMinutes: 30, assignedRole: "Radyoloji Birim Rolü" },
  { code: "GRD", name: "Girişimsel Radyoloji", kind: "diagnostic", scope: "Girişimsel radyoloji işlem hazırlığı ve kurul koordinasyonu", slaMinutes: 15, assignedRole: "Girişimsel Radyoloji Rolü" },
  { code: "NTP", name: "Nükleer Tıp", kind: "diagnostic", scope: "Nükleer tıp tetkik koordinasyonu", slaMinutes: 30, assignedRole: "Nükleer Tıp Birim Rolü" },
  { code: "PAT", name: "Patoloji", kind: "diagnostic", scope: "Patoloji materyal ve sonuç süreçleri", slaMinutes: 45, assignedRole: "Patoloji Birim Rolü" },
  { code: "LAB", name: "Laboratuvar", kind: "diagnostic", scope: "Laboratuvar sonuç erişimi ve operasyon desteği", slaMinutes: 45, assignedRole: "Laboratuvar Birim Rolü" },
  { code: "ENF", name: "Enfeksiyon Hastalıkları", kind: "clinical", scope: "Enfeksiyon konsültasyonu ve izolasyon akışı", slaMinutes: 15, assignedRole: "Enfeksiyon Birim Rolü" },
  { code: "ECZ", name: "Eczane", kind: "operational", scope: "İlaç tedarik ve klinik eczacılık talepleri", slaMinutes: 20, assignedRole: "Eczane Birim Rolü" },
  { code: "KAN", name: "Kan Merkezi", kind: "diagnostic", scope: "Kan ürünü talep ve stok koordinasyonu", slaMinutes: 10, assignedRole: "Kan Merkezi Birim Rolü" },
  { code: "ADS", name: "Ağız ve Diş Sağlığı", kind: "clinical", scope: "Ağız-diş muayene, çene cerrahisi ve işlem koordinasyonu", slaMinutes: 30, assignedRole: "Ağız Diş Sağlığı Rolü" },
  { code: "NFS", name: "Nörofizyoloji Laboratuvarı", kind: "diagnostic", scope: "EEG, EMG ve uyandırılmış potansiyel randevu koordinasyonu", slaMinutes: 30, assignedRole: "Nörofizyoloji Birim Rolü" },
  { code: "EDS", name: "Endoskopi Ünitesi", kind: "diagnostic", scope: "Endoskopi işlem hazırlığı, salon ve takip koordinasyonu", slaMinutes: 20, assignedRole: "Endoskopi Ünitesi Rolü" },
  { code: "EVS", name: "Evde Sağlık", kind: "operational", scope: "Evde sağlık başvuru ve ziyaret planlama", slaMinutes: 60, assignedRole: "Evde Sağlık Birim Rolü" },
  { code: "SHZ", name: "Sosyal Hizmet", kind: "operational", scope: "Sosyal destek ve taburculuk koordinasyonu", slaMinutes: 60, assignedRole: "Sosyal Hizmet Birim Rolü" },
  { code: "HHK", name: "Hasta Hakları", kind: "governance", scope: "Başvuru, şikâyet ve geri bildirim", slaMinutes: 60, assignedRole: "Hasta Hakları Birim Rolü" },
  { code: "YTK", name: "Yatak ve Kapasite Yönetimi", kind: "operational", scope: "Yatak uygunluğu, doluluk, bekleme ve kapasite darboğazı", slaMinutes: 5, assignedRole: "Yatak Yönetim Koordinatörü" },
  { code: "TRF", name: "Transfer Merkezi", kind: "operational", scope: "Kurum içi ve kurumlar arası kabul, transfer ve yatak rezervasyonu", slaMinutes: 5, assignedRole: "Transfer Merkezi Koordinatörü" },
  { code: "TBR", name: "Taburculuk Koordinasyonu", kind: "operational", scope: "Taburculuk engeli, evrak, ilaç, ulaşım ve takip koordinasyonu", slaMinutes: 20, assignedRole: "Taburculuk Koordinasyon Rolü" },
  { code: "ULS", name: "Hasta Ulaşım ve Transport", kind: "operational", scope: "Kurum içi hasta taşıma ve öncelik bazlı görev ataması", slaMinutes: 10, assignedRole: "Hasta Transport Rolü" },
  { code: "CTM", name: "Çevre ve Temizlik Hizmetleri", kind: "operational", scope: "Oda dönüş, izolasyon temizliği ve çevre hizmeti görevleri", slaMinutes: 10, assignedRole: "Çevre Hizmetleri Rolü" },
  { code: "KBL", name: "Hasta Kabul ve Kayıt", kind: "operational", scope: "Hasta kabul, kimlik eşleme ve kayıt doğrulama", slaMinutes: 10, assignedRole: "Hasta Kabul Görevlisi" },
  { code: "VZN", name: "Vezne ve Faturalandırma", kind: "operational", scope: "Tahsilat, fatura ve mali bilgilendirme talepleri", slaMinutes: 30, assignedRole: "Vezne Faturalandırma Rolü" },
  { code: "PRV", name: "Sigorta ve Provizyon", kind: "operational", scope: "SGK, özel sigorta ve provizyon takip işlemleri", slaMinutes: 30, assignedRole: "Provizyon Uzmanı" },
  { code: "BMD", name: "Biyomedikal Hizmetler", kind: "operational", scope: "Tıbbi cihaz arıza, bakım ve kalibrasyon görevleri", slaMinutes: 15, assignedRole: "Biyomedikal Teknik Rolü" },
  { code: "BTI", name: "Bilgi Teknolojileri", kind: "operational", scope: "HBYS, ağ, cihaz, hesap ve entegrasyon destek talepleri", slaMinutes: 15, assignedRole: "BT Hizmet Masası Rolü" },
  { code: "TKH", name: "Teknik Hizmetler ve Tesis", kind: "operational", scope: "Tesis, elektrik, mekanik ve altyapı görevleri", slaMinutes: 20, assignedRole: "Teknik Hizmetler Rolü" },
  { code: "SAT", name: "Satın Alma ve Tedarik", kind: "operational", scope: "Malzeme, hizmet ve kritik tedarik talepleri", slaMinutes: 60, assignedRole: "Satın Alma Rolü" },
  { code: "MSS", name: "Merkezi Sterilizasyon", kind: "operational", scope: "Set, sterilizasyon, izlenebilirlik ve ameliyathane teslimi", slaMinutes: 10, assignedRole: "Sterilizasyon Birim Rolü" },
  { code: "UHS", name: "Uluslararası Hasta Hizmetleri", kind: "operational", scope: "Çok dil, seyahat, fiyatlandırma ve uluslararası hasta koordinasyonu", slaMinutes: 30, assignedRole: "Uluslararası Hasta Rolü" },
  { code: "ARS", name: "Tıbbi Arşiv ve Dokümantasyon", kind: "operational", scope: "Belge erişimi, arşiv ve kayıt tamamlama süreçleri", slaMinutes: 45, assignedRole: "Tıbbi Arşiv Rolü" },
  { code: "MRG", name: "Morg Hizmetleri", kind: "operational", scope: "Morg kabul, teslim ve belge koordinasyonu", slaMinutes: 15, assignedRole: "Morg Hizmetleri Rolü" },
  { code: "KLT", name: "Kalite Yönetimi", kind: "governance", scope: "Kalite göstergeleri, düzeltici faaliyet ve süreç iyileştirme", slaMinutes: 60, assignedRole: "Kalite Yönetim Rolü" },
  { code: "EKK", name: "Enfeksiyon Kontrol Komitesi", kind: "governance", scope: "Enfeksiyon kontrol olayı, izolasyon ve sürveyans koordinasyonu", slaMinutes: 10, assignedRole: "Enfeksiyon Kontrol Rolü" },
  { code: "HGV", name: "Hasta Güvenliği", kind: "governance", scope: "Hasta güvenliği olayı, kök neden ve düzeltici faaliyet", slaMinutes: 10, assignedRole: "Hasta Güvenliği Rolü" },
  { code: "ETK", name: "Etik ve Klinik Yönetişim", kind: "governance", scope: "Etik danışma, klinik yönetişim ve ikincil inceleme", slaMinutes: 30, assignedRole: "Etik Yönetişim Rolü" },
  { code: "ISG", name: "İş Sağlığı ve Güvenliği", kind: "governance", scope: "Çalışan güvenliği, ramak kala ve iş kazası takibi", slaMinutes: 15, assignedRole: "İSG Birim Rolü" },
  { code: "CEV", name: "Atık ve Çevre Yönetimi", kind: "governance", scope: "Tıbbi atık, çevre uyumu ve olay koordinasyonu", slaMinutes: 30, assignedRole: "Çevre Yönetim Rolü" },
  { code: "EGT", name: "Eğitim ve Simülasyon Merkezi", kind: "governance", scope: "Personel eğitimi, yetkinlik ve simülasyon planlama", slaMinutes: 120, assignedRole: "Eğitim Koordinasyon Rolü" },
  { code: "KVT", name: "KVKK ve Veri Koruma", kind: "governance", scope: "Erişim, aktarım, saklama ve ihlal değerlendirmesi", slaMinutes: 30, assignedRole: "KVKK Yetkilisi" },
  { code: "BGV", name: "Bilgi Güvenliği", kind: "governance", scope: "Güvenlik olayı, erişim denetimi ve müdahale", slaMinutes: 10, assignedRole: "Bilgi Güvenliği Rolü" },
];

export function findUnit(value?: string | null) {
  if (!value) return HOSPITAL_UNITS.find((unit) => unit.code === "HIL")!;
  const normalized = value.toLocaleLowerCase("tr-TR").trim();
  return HOSPITAL_UNITS.find((unit) => unit.code.toLowerCase() === normalized || unit.name.toLocaleLowerCase("tr-TR") === normalized)
    ?? HOSPITAL_UNITS.find((unit) => unit.code === "HIL")!;
}

export function recommendUnit(subject: string, requestedUnit?: string | null) {
  if (requestedUnit) return findUnit(requestedUnit);
  const value = subject.toLocaleLowerCase("tr-TR");
  const matchers: Array<[string[], string]> = [
    [["randevu", "tarih değiş", "iptal"], "RND"],
    [["tahlil", "laboratuvar", "kan sonucu"], "LAB"],
    [["kalp damar cerrahisi", "kvc"], "KVC"],
    [["kardiyoloji", "kalp"], "KRD"],
    [["ortopedi", "kırık", "eklem"], "ORT"],
    [["radyoloji", "mr", "tomografi", "ultrason"], "RAD"],
    [["gastroenteroloji", "endoskopi"], "GAS"],
    [["nefroloji", "diyaliz"], "NEF"],
    [["endokrinoloji", "diyabet"], "END"],
    [["infertilite", "tüp bebek", "üreme"], "IVF"],
    [["onkoloji", "kemoterapi"], "ONK"],
    [["çocuk kardiyoloji"], "PKR"],
    [["çocuk nöroloji"], "PNR"],
    [["evde sağlık", "evde bakım"], "EVS"],
    [["provizyon", "sigorta"], "PRV"],
    [["fatura", "vezne"], "VZN"],
    [["şikâyet", "hasta hakkı"], "HHK"],
  ];
  const code = matchers.find(([terms]) => terms.some((term) => value.includes(term)))?.[1] ?? "HIL";
  return findUnit(code);
}
