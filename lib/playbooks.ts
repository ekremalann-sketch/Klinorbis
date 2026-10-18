// Hastane operasyon akış kütüphanesi (playbook) ve akış ağı.
//
// Her akış, birden çok birimin sırayla yaptığı operasyonel adımlardan oluşur: yatak hazırlığı,
// cihaz arızası, taburculuk, ameliyat iptali, HBYS kesintisi gibi. Klinik karar vermez; klinik
// karar gerektiren adımlar "yetkili sağlık personeli karar verir" diye yazılır ve insan onayına bağlanır.
//
// Kısa yazım: [kod, ad, kategori, tetikleyici, adımlar, sonraki akışlar?]
//   adımlar: "BİRİM|ne yapılır|hedef dakika|bayraklar" ";" ile ayrılır. Bayraklar "," ile:
//            A = onay adımı (başlatan kişi onaylayamaz; klinik birimde yalnız klinisyen, diğerlerinde birim/operasyon yöneticisi)
//            W2880 = adım önceki adımdan 2880 dakika (48 saat) sonra etkinleşir; o zamana kadar görev "zamanı bekleniyor" durumundadır
//   sonraki akışlar: akış kapanınca kendiliğinden başlayan akış kodları, "," ile ayrılır.
//            "kod?kosul" yazımı koşullu zincirdir: son adımı tamamlayan kişi koşulu işaretlemezse o akış açılmaz
//            (ör. yatak bulunduysa dış sevk akışı başlamaz). Koşul adları CHAIN_CONDITIONS'ta tanımlıdır.
import { HOSPITAL_UNITS } from "./hospital-units";

export type PlaybookStep = { unitCode: string; task: string; minutes: number; approval: boolean; waitMinutes: number; clinical: boolean };
export type ChainRule = { code: string; when: string | null };
export type Playbook = { code: string; title: string; category: string; trigger: string; steps: PlaybookStep[]; next: string[]; nextRules: ChainRule[] };

/** Koşullu zincir soruları: son adımı tamamlayan kişi "evet" derse bağlı akış başlar. */
export const CHAIN_CONDITIONS: Record<string, string> = {
  yatak_yok: "Uygun yatak bulunamadı",
  erteleme_gerekli: "Planlı yatış veya ameliyat ertelenecek",
  guvenli_ortam: "Güvenli taburcu ortamı sağlandı",
  kalici_eksik: "Eksik kalıcı; satın alma gerekiyor",
  uzun_durus: "Cihaz 24 saatten uzun devre dışı kalacak",
  onarim_gerekli: "Cihaz onarım gerektiriyor",
  cihaz_hasari: "Kesintide cihaz hasarı tespit edildi",
  kok_neden: "Kök neden analizi gerekli",
  transfer_yetersiz: "Birimler arası transfer yetmedi",
  kagit_kayit: "Kesintide kâğıda kayıt tutuldu",
  kisisel_veri: "Kişisel veri etkilendi",
};

export const PLAYBOOK_CATEGORIES = [
  "Yatak ve hasta akışı", "Taburculuk", "Ameliyathane", "Cihaz ve tesis", "Enfeksiyon ve çevre",
  "Tedarik ve eczane", "Hasta iletişimi ve haklar", "Faturalama ve sigorta", "Bilgi sistemleri ve veri", "Kalite ve güvenlik", "Acil durum kodları",
] as const;

type Row = [string, string, number, string, string, string?];
const C = PLAYBOOK_CATEGORIES;
const ROWS: Row[] = [
  // Yatak ve hasta akışı
  ["yatak-hazirlik", "Taburcu sonrası yatak hazırlığı", 0, "Hasta odadan çıktı", "TBR|Taburcu saatini sisteme gir|15;CTM|Oda temizliği ve dezenfeksiyon|45;TKH|Oda teknik kontrolü (ışık, çağrı zili, oksijen prizi)|20;YTK|Yatağı hazır olarak kapasiteye aç|10"],
  ["servis-nakil", "Servisler arası hasta nakli", 0, "Yetkili hekim nakil kararı verdi", "YTK|Hedef serviste yatak ayır|15|A;ULS|Transport personeli ve sedye ata|15;HIL|Hasta yakınına yeni servisi bildir|15;YTK|Kapasite tablosunu güncelle|10", "yatak-hazirlik"],
  ["acil-yatis-bekleyen", "Acilde yatış bekleyen hasta", 0, "Yatış kararı verildi, yatak yok", "ACY|Yatış kararını kapasite merkezine ilet (karar yetkili hekimdedir)|10;YTK|Uygun yatağı bul veya boşalacak yatağı işaretle|30;YTK|2 saatte yatak çıkmazsa yönetime yükselt|120|A;ULS|Servise transport|20", "kapasite-kirmizi?yatak_yok"],
  ["yogun-bakim-yatak", "Yoğun bakım yatağı talebi", 0, "Yoğun bakım ihtiyacı bildirildi", "YOG|Yoğun bakım sorumlusuna talebi ilet|10;YTK|Boş ve boşalacak yatak listesini çıkar|15;YOG|Önceliklendirme kararını kaydet (yetkili hekim)|20|A;TRF|Yatak yoksa sevk ağını başlat|30", "dis-sevk?yatak_yok"],
  ["dis-sevk", "Başka hastaneye sevk (yatak yok)", 0, "İçeride uygun yatak bulunamadı", "TRF|Sevk kaydını aç ve koordinasyon merkezine bildir|15;TRF|Alıcı hastaneden teyit al|30|A;ARS|Epikriz ve sevk belgelerini hazırla|20;ULS|Ambulans koordinasyonu|30;HIL|Hasta yakınını bilgilendir|15"],
  ["gelen-sevk", "Dış merkezden gelen sevk kabulü", 0, "Başka kurumdan sevk talebi geldi", "TRF|Sevk talebini kaydet|10;YTK|Yatak uygunluğunu kontrol et|20|A;KBL|Ön kayıt aç|15;PRV|Provizyon al|20;YTK|Yatağı ayır ve servise bildir|10"],
  ["kapasite-kirmizi", "Kapasite kırmızı alarm (doluluk %95+)", 0, "Doluluk eşiği aşıldı", "YTK|Doluluk alarmını yönetime bildir|5;TBR|Bugünkü taburcuları hızlandır|60;YTK|Planlı yatışları gözden geçir|30|A;HIL|Ertelenen hastaları bilgilendirme listesini hazırla|60", "elektif-erteleme?erteleme_gerekli"],
  ["elektif-erteleme", "Planlı yatış veya ameliyat ertelemesi", 0, "Kapasite veya liste nedeniyle erteleme", "AML|Etkilenen hasta listesini çıkar|30;RND|Yeni tarih öner|60|A;HIL|Hastayı bilgilendir|60;KLT|Ertelemeyi göstergeye işle|15"],
  ["vefat-idari", "Vefat sonrası idari süreç", 0, "Vefat kaydı yetkili hekimce yapıldı", "MRG|Morg kaydı|30;ARS|Belgeleri hazırla|60;SHZ|Aileye destek ve yönlendirme|60;VZN|Hesap kapanışı|60;YTK|Yatağı serbest bırak|10", "yatak-hazirlik"],
  ["refakatci", "Refakatçi ve ziyaret düzeni talebi", 0, "Hasta yakını refakat istiyor", "HIL|Talebi kaydet|15;YTK|Servis uygunluğunu sor|30|A;HIL|Refakatçi kartını hazırla|15"],
  ["transport-gecikme", "Hasta transportu gecikti", 0, "Transport hedef süresi aşıldı", "ULS|Gecikmeyi ve nedeni kaydet|5;ULS|Yedek personel yönlendir|10;KLT|Haftalık transport göstergesine işle|60"],
  // Taburculuk
  ["taburcu-planli", "Planlı taburculuk", 1, "Yetkili hekim taburcu kararı verdi", "TBR|Taburcu listesini sabah yayınla|30;ECZ|Taburcu ilaçlarını hazırla|60;VZN|Hesap ve provizyon kapanışı|45;RND|Kontrol randevusunu ver|20;ULS|Gerekirse araç ayarla|30", "yatak-hazirlik,taburcu-anket"],
  ["taburcu-evde-saglik", "Taburcu sonrası evde sağlık devri", 1, "Evde bakım ihtiyacı belirtildi", "TBR|Evde sağlık ihtiyacını kaydet|20;EVS|İlk ziyareti planla|60|A;SHZ|Bakım veren desteğini değerlendir|60;HIL|Hastaya ziyaret tarihini bildir|20"],
  ["taburcu-anket", "Taburcu sonrası memnuniyet araması", 1, "Taburcudan 48 saat sonra", "HIL|Hastayı ara veya mesaj gönder (taburcudan 48 saat sonra)|240|W2880;KLT|Sonuçları göstergelere işle|60"],
  ["kontrol-hatirlatma", "Taburcu sonrası kontrol hatırlatması", 1, "Kontrol randevusuna 2 gün kaldı", "RND|Randevuyu teyit et|30;HIL|Randevudan 1 gün önce hatırlatma|60|W1440"],
  ["sosyal-taburcu", "Bakım veremeyen aile (sosyal taburcu)", 1, "Taburcu edilebilir ama güvenli ortam yok", "SHZ|Sosyal inceleme|240;SHZ|Kurum veya bakımevi yönlendirmesi|1440|A;TBR|Taburcu tarihini güncelle|30", "taburcu-planli?guvenli_ortam"],
  ["uluslararasi-taburcu", "Uluslararası hasta taburculuğu", 1, "Yabancı hasta taburcu oluyor", "UHS|Tercüman ve belgeleri hazırla|60;VZN|Fatura ve sigorta|60|A;UHS|Dönüş planı ve transfer|120", "taburcu-anket"],
  // Ameliyathane
  ["ameliyat-iptal", "Ameliyat günü iptali", 2, "Planlı ameliyat aynı gün iptal edildi", "AML|İptal nedenini kaydet|10;RND|Yeni tarih öner|60|A;HIL|Hastayı bilgilendir|30;KLT|İptal göstergesine işle|15"],
  ["ameliyat-hazirlik", "Ameliyat öncesi idari hazırlık", 2, "Ameliyat tarihi belirlendi", "KBL|Yatış kaydını aç|20;PRV|Provizyon ve ön onay|60|A;LAB|Tetkik randevularını ver|60;ANR|Anestezi polikliniği randevusu|60;AML|Listeyi onayla|30|A"],
  ["set-eksik", "Eksik veya hatalı cerrahi set", 2, "Ameliyat öncesi set kontrolünde eksik", "MSS|Eksik seti bildir|10;MSS|Alternatif set veya acil sterilizasyon|60;SAT|Kalıcı eksik için satın alma talebi|1440", "satinalma-acil?kalici_eksik"],
  ["ilk-vaka-gecikme", "İlk vaka gecikmesi", 2, "Sabah ilk ameliyat 15 dakikadan fazla gecikti", "AML|Gecikme nedenini kaydet|10;KLT|Haftalık analizde değerlendir|1440"],
  ["implant-temin", "İmplant ve ortez temini", 2, "Ameliyatta implant gerekecek", "SAT|Tedarikçi siparişi|240|A;PRV|Sigorta onayı|240;AML|Teslim ve kayıt|60;BMD|ÜTS kaydı|60"],
  // Cihaz ve tesis
  ["cihaz-ariza", "Tıbbi cihaz arızası", 3, "Birim cihaz arızası bildirdi", "BMD|Arıza kaydı ve cihazı 'kullanma' etiketiyle işaretle|15;BMD|Yerinde müdahale|120;BMD|Servis firması çağrısı|240|A;SAT|Yedek parça|1440;KLT|Kaydı kapat|30", "yedek-cihaz?uzun_durus"],
  ["yedek-cihaz", "Yedek cihaz veya kiralama", 3, "Arızalı cihaz 24 saatten uzun devre dışı", "BMD|Havuzdan yedek cihaz bul|30;SAT|Kiralama teklifi|240|A;BMD|Kalibrasyon ve teslim|120"],
  ["kalibrasyon", "Periyodik kalibrasyon", 3, "Kalibrasyon tarihi yaklaştı", "BMD|Takvimden listeyi çıkar|60;BMD|Firma randevusu|240;BMD|Etiket ve sertifikayı işle|60"],
  ["goruntuleme-durus", "MR/BT cihazı durdu", 3, "Görüntüleme cihazı arıza verdi", "BMD|Arızayı kaydet|15;RAD|Etkilenen randevu listesini çıkar|30;RND|Randevuları kaydır|120|A;HIL|Hastaları bilgilendir|120", "cihaz-ariza?onarim_gerekli"],
  ["elektrik-kesinti", "Elektrik kesintisi ve jeneratör", 3, "Şebeke elektriği kesildi", "TKH|Jeneratörün devreye girdiğini doğrula|5;TKH|Yoğun bakım ve ameliyathaneyi kontrol et|15;BMD|Kritik cihazları kontrol et|30;KLT|Olay raporu|60", "cihaz-ariza?cihaz_hasari"],
  ["su-kesinti", "Su kesintisi", 3, "Şebeke suyu kesildi", "TKH|Depo seviyesini kontrol et|10;CTM|Hijyen önlemlerini başlat|30;MSS|Sterilizasyon planını gözden geçir|30;KLT|Olay raporu|60"],
  ["asansor-ariza", "Hasta asansörü arızası", 3, "Hasta asansörü durdu", "TKH|Asansör firmasını çağır|15;ULS|Alternatif güzergâhı duyur|10;TKH|Onarım kaydı|240"],
  ["medikal-gaz", "Medikal gaz alarmı", 3, "Oksijen veya vakum basınç alarmı", "TKH|Alarmı yerinde kontrol et|5;BMD|Bağlı cihazları kontrol et|15;TKH|Tank ve tedarikçi|60|A;HGV|Hasta güvenliği bildirimi|60"],
  ["ameliyathane-iklim", "Ameliyathane ısı/nem sapması", 3, "Ortam değerleri sınır dışında", "TKH|Ölçümü doğrula|15;AML|Vakaların durumunu yetkili kişi değerlendirir|20|A;TKH|Klima onarımı|240;EKK|Enfeksiyon kontrolüne bilgi|30"],
  ["oda-bakim", "Hasta odası bakım talebi", 3, "Servis bakım talebi açtı", "TKH|Talebi kaydet|15;TKH|Onarım|240;CTM|Onarım sonrası temizlik|30"],
  ["diyaliz-su", "Diyaliz su sistemi alarmı", 3, "Su arıtma değerleri uygunsuz", "TKH|Su arıtma sistemini kontrol et|15;NEF|Seansların durumunu yetkili hekim değerlendirir|30|A;RND|Gerekirse seansları kaydır|60;HIL|Hastaları bilgilendir|60"],
  // Enfeksiyon ve çevre
  ["izolasyon-oda", "İzolasyon odası hazırlığı", 4, "Yetkili hekim veya EKK izolasyon kararı verdi", "EKK|İzolasyon kararını kaydet|15;YTK|Tek kişilik oda ayır|30;CTM|Özel temizlik ve ekipman|45;SAT|Kişisel koruyucu stok kontrolü|60"],
  ["salgin-suphe", "Salgın şüphesi bildirimi", 4, "Benzer vakalar kümelendi", "EKK|Kümelenmeyi incele|120;EKK|Önlem kararı|240|A;EGT|Personeli bilgilendir|240;KLT|Rapor|1440", "kok-neden?kok_neden"],
  ["atik-tasma", "Tıbbi atık konteyneri doldu", 4, "Atık deposu kapasitesi doldu", "CEV|Toplama çağrısı|30;CTM|Alan temizliği|30;CEV|Lisanslı firma teslim tutanağı|1440"],
  ["kesici-yaralanma", "Personel kesici-delici yaralanması", 4, "Çalışan iğne batması bildirdi", "ISG|Olay kaydı|30;ISG|İş sağlığı hekimine yönlendir|60;LAB|Tetkik randevusu|120", "is-kazasi"],
  ["is-kazasi", "Çalışan iş kazası bildirimi", 4, "Çalışan iş kazası geçirdi", "ISG|Olay ve tanık kaydı|60;ISG|SGK bildirimi (3 iş günü)|4320|A;KLT|Kök neden analizi talebi|60", "kok-neden"],
  ["el-hijyeni", "El hijyeni gözlem turu", 4, "Aylık gözlem planı", "EKK|Servislerde gözlem|240;EGT|Geri bildirim eğitimi|1440"],
  ["su-numunesi", "Su numunesi uygunsuz", 4, "Laboratuvar su sonucu uygunsuz", "TKH|Şok klorlama|240;EKK|Tekrar numune (7 gün sonra)|1440|W10080;KLT|Kayıt|60"],
  // Tedarik ve eczane
  ["stok-kritik", "Kritik malzeme stok alarmı", 5, "Stok emniyet seviyesinin altında", "ECZ|Stok seviyesini doğrula|30;ECZ|Birimler arası transfer|60;SAT|Acil sipariş talebi|240|A", "satinalma-acil?transfer_yetersiz"],
  ["satinalma-acil", "Acil satın alma", 5, "Kritik ihtiyaç doğdu", "SAT|Talep ve gerekçe|60;SAT|Teklif topla|240;SAT|Satın alma onayı|120|A;SAT|Teslim al ve depoya gir|1440"],
  ["geri-cekme", "İlaç veya malzeme geri çekme", 5, "Üretici veya otorite geri çekme duyurdu", "ECZ|Etkilenen partiyi tespit et|60;ECZ|Birimlerden topla|240;SAT|Tedarikçiye iade|1440;HGV|Hasta güvenliği değerlendirmesi|240|A", "kok-neden?kok_neden"],
  ["soguk-zincir", "Soğuk zincir kırılması", 5, "Buzdolabı sıcaklık alarmı", "ECZ|Sıcaklık kaydını al|15;ECZ|Ürünleri karantinaya al|30;ECZ|Kullanılabilirlik kararı (eczacı)|120|A;SAT|Yenisini temin et|1440"],
  ["kan-stok", "Kan ürünü stok azaldı", 5, "Kan merkezi stok uyarısı", "KAN|Stok durumunu bildir|15;KAN|Kızılay'dan talep|60|A;HIL|Bağış duyurusu hazırla|1440"],
  ["miad", "Miadı yaklaşan ürünler", 5, "90 gün içinde miadı dolacak ürünler", "ECZ|Listeyi çıkar|60;ECZ|Kullanım önceliğini birimlere bildir|240;SAT|İade veya değişim|1440"],
  ["diyet-hatasi", "Hasta diyet yemeği hatası", 5, "Yanlış diyet tepsisi tespit edildi", "DYT|Hatayı kaydet|30;DYT|Mutfak sürecini düzelt|60;HGV|Ramak kala bildirimi|60"],
  // Hasta iletişimi ve haklar
  ["sikayet", "Hasta şikâyeti", 6, "Hasta veya yakını şikâyet etti", "HHK|Kaydet ve 24 saatte ilk dönüşü yap|1440;KLT|İlgili birimin görüşünü al|2880;HHK|Hasta hakları kurulu değerlendirmesi|4320|A;HHK|Yazılı yanıt|1440", "kok-neden?kok_neden"],
  ["cimer", "CİMER / SABİM başvurusu", 6, "Resmî kanaldan başvuru geldi", "HHK|Başvuruyu kaydet|60;KLT|Birim görüşünü al|2880;HHK|Yanıtı onayla|1440|A;HHK|Yanıtı gönder|60"],
  ["tesekkur", "Teşekkür bildirimi", 6, "Hasta teşekkür iletti", "HHK|Kaydet|60;EGT|İlgili personele ilet|1440"],
  ["kayip-esya", "Kayıp eşya", 6, "Hasta veya yakını eşyasını kaybetti", "HIL|Kaydet|30;CTM|Alanlarda ara|240;HIL|Teslim tutanağı|60"],
  ["tercuman", "Tercüman ihtiyacı", 6, "Hasta Türkçe konuşmuyor", "UHS|Dil ve saati kaydet|15;UHS|Tercüman veya telefonla tercüme ayarla|60"],
  ["engelli-erisim", "Engelli hasta erişim desteği", 6, "Hasta erişim desteği istedi", "HIL|İhtiyacı kaydet|15;ULS|Tekerlekli sandalye veya refakat|20;KBL|Öncelikli kayıt|10"],
  ["randevu-bekleme", "Randevu bekleme süresi uzadı", 6, "Bir bölümde ilk boş randevu 14 günü geçti", "RND|Bekleme raporunu çıkar|60;RND|Ek slot talebi|240|A;HIL|Bekleme listesindekileri ara|1440"],
  ["cagri-tasma", "Çağrı merkezi kuyruğu taştı", 6, "Bekleyen çağrı sayısı eşiği aştı", "CAG|Kuyruğu bildir|5;CAG|Geri arama moduna geç|10;RND|Web randevuya yönlendirme mesajı|15;CAG|Ek personel|60|A"],
  ["numune-red", "Numune reddi, hastanın tekrar çağrılması", 6, "Laboratuvar numuneyi uygunsuz buldu", "LAB|Red nedenini kaydet|15;RND|Hastaya yeni numune saati ver|60;HIL|Hastayı bilgilendir|30"],
  // Faturalama ve sigorta
  ["provizyon-red", "Provizyon reddi", 7, "SGK veya sigorta provizyon vermedi", "PRV|Red nedenini kaydet|30;PRV|Düzelt ve yeniden gönder|240;VZN|Hastaya ödeme seçeneklerini anlat|60"],
  ["fatura-itiraz", "Fatura itirazı", 7, "Hasta faturaya itiraz etti", "VZN|Kaydet|60;VZN|İncele|1440;VZN|Karar|1440|A;HIL|Hastaya bildir|60"],
  ["sgk-kesinti", "SGK kesinti ve geri ödeme", 7, "Dönem kesinti listesi geldi", "VZN|Kesinti listesini al|1440;ARS|Eksik belgeleri tamamla|2880;VZN|İtiraz dosyası|2880|A"],
  ["sigorta-on-onay", "Özel sigorta ön onayı", 7, "Planlı işlem için sigorta onayı gerekli", "PRV|Talebi aç|60;PRV|Belgeleri gönder|240;PRV|Onayı takip et|1440;RND|Randevuyu teyit et|60"],
  // Bilgi sistemleri ve veri
  ["hbys-kesinti", "HBYS kesintisi", 8, "Hastane bilgi sistemi erişilemiyor", "BTI|Olayı kaydet|5;BTI|Kâğıt prosedüre geçişi duyur|10;ARS|Kâğıt formları dağıt|30;BTI|Sistemi geri getir|240", "veri-giris?kagit_kayit"],
  ["veri-giris", "Kesinti sonrası veri girişi", 8, "HBYS geri geldi", "ARS|Kâğıt formları topla|120;KBL|Kayıtları sisteme gir|480;KLT|Örneklem kontrolü|240"],
  ["siber-olay", "Şüpheli siber olay", 8, "Güvenlik uyarısı veya oltalama bildirimi", "BGV|Olayı kaydet|15;BGV|Etkilenen sistemleri izole et|30|A;BTI|Kurtarma|240;KVT|Kişisel veri etkisini değerlendir|4320|A", "kvkk-ihlal?kisisel_veri"],
  ["kvkk-ihlal", "Kişisel veri ihlali bildirimi", 8, "Kişisel verinin yetkisiz erişime uğradığı anlaşıldı", "KVT|Etki analizi|1440;KVT|Kurula bildirim kararı (72 saat)|1440|A;HIL|İlgili kişilere bildirim|2880;KLT|Düzeltici faaliyet|4320", "kok-neden"],
  ["kvkk-basvuru", "KVKK ilgili kişi başvurusu", 8, "Kişi verisi hakkında başvurdu", "KVT|Başvuruyu ve kimliği doğrula|1440;ARS|Verileri tespit et|4320;KVT|Yanıtı onayla|2880|A;KVT|30 gün içinde yanıtla|1440"],
  ["dosya-talebi", "Hasta dosyası / epikriz talebi", 8, "Hasta dosyasının kopyasını istedi", "ARS|Talebi ve kimliği kaydet|60;ARS|Dosyayı hazırla|1440;KVT|Paylaşım uygunluğu|240|A;ARS|Teslim et|60"],
  ["yetki-acma", "Yeni personel sistem yetkisi", 8, "İşe yeni başlayan personel", "BTI|Hesap aç|240;BGV|Rol onayı|240|A;EGT|KVKK ve sistem eğitimi|1440"],
  ["yetki-kapatma", "Ayrılan personelin yetkilerini kapatma", 8, "Personel ayrıldı", "BTI|Hesapları kapat|60;BGV|Erişim kontrolü|240;ARS|Zimmetleri iade al|1440"],
  ["yazici-ariza", "Etiket/bileklik yazıcısı arızası", 8, "Kabul veya serviste yazıcı çalışmıyor", "BTI|Uzaktan kontrol|30;BTI|Yedek yazıcı|60"],
  ["arsiv-imha", "Saklama süresi dolan dosyalar", 8, "Yıllık arşiv gözden geçirmesi", "ARS|Listeyi çıkar|1440;KVT|İmha onayı|2880|A;ARS|İmha tutanağı|1440"],
  // Kalite ve güvenlik
  ["kok-neden", "Kök neden analizi ve DÖF", 9, "Olay, şikâyet veya denetim bulgusu", "KLT|Ekibi kur|1440;KLT|Analiz|4320;KLT|Eylem planı onayı|1440|A;KLT|Önlemin etkinliğini kontrol et (30 gün sonra)|1440|W43200"],
  ["hasta-dusme", "Hasta düşmesi bildirimi", 9, "Serviste hasta düştü", "HGV|Olay bildirimi|60;HGV|Ortam incelemesi|240;TKH|Ortamı düzelt (zemin, ışık, tutamak)|240;KLT|DÖF kaydı|60", "kok-neden"],
  ["kimlik-hatasi", "Hasta kimlik doğrulama hatası (ramak kala)", 9, "Yanlış hasta riski fark edildi", "HGV|Bildirim|60;KBL|Bileklik sürecini kontrol et|240;EGT|Eğitim|1440", "kok-neden"],
  ["ilac-hatasi", "İlaç hatası bildirimi", 9, "İlaç hatası veya ramak kala", "HGV|Bildirim|60;ECZ|Süreç incelemesi|1440;HGV|Değerlendirme kurulu|2880|A", "kok-neden"],
  ["ic-denetim", "İç denetim (SKS)", 9, "Denetim takvimi", "KLT|Planla|1440;KLT|Saha denetimi|2880;KLT|Rapor onayı|1440|A", "kok-neden?kok_neden"],
  ["oryantasyon", "Yeni personel oryantasyonu", 9, "Yeni personel başladı", "EGT|Programı planla|1440;ISG|İSG eğitimi|1440;KVT|KVKK eğitimi|1440;BTI|Sistem eğitimi|1440"],
  ["tatbikat", "Afet tatbikatı", 9, "Yıllık tatbikat planı", "ISG|Senaryoyu hazırla|4320;ISG|Tatbikatı yap|240;KLT|Rapor|1440", "kok-neden?kok_neden"],
  // Acil durum kodları
  ["afet-kodu", "Kitlesel yaralanma: idari destek", 10, "Yetkili kişi afet kodunu verdi", "ACY|Afet kodunu duyur|5|A;YTK|Boş yatakları çıkar|15;AML|Planlı listeyi durdur|15|A;KAN|Kan stoğunu bildir|15;ULS|Transport havuzunu topla|10;HIL|Yakın bilgi masasını aç|30", "kapasite-kirmizi?yatak_yok,elektif-erteleme?erteleme_gerekli"],
  ["yangin", "Yangın alarmı", 10, "Yangın alarmı çaldı", "ISG|Alarmı doğrula|3;TKH|Bölgeyi kontrol et|10;ULS|Tahliye desteği|15;ISG|Olay raporu|120", "kok-neden?kok_neden"],
  ["kayip-hasta", "Kayıp hasta", 10, "Hasta servisinde bulunamıyor", "ISG|Kodu duyur ve çıkışları kapat|5;TKH|Kamera kayıtlarını kontrol et|15;HIL|Yakınına bilgi ver|30;KLT|Olay raporu|240", "kok-neden?kok_neden"],
  ["beyaz-kod", "Beyaz kod (çalışana şiddet)", 10, "Sağlık çalışanına şiddet", "ISG|Güvenlik ekibini yönlendir|3;ISG|Olayı kaydet|60;ISG|Hukuki destek bildirimi|240|A;EGT|Psikososyal destek yönlendirmesi|1440", "kok-neden"],
];

const UNIT_CODES = new Set(HOSPITAL_UNITS.map((u) => u.code));
const UNIT_KIND = new Map(HOSPITAL_UNITS.map((u) => [u.code, u.kind]));

export const PLAYBOOKS: Playbook[] = ROWS.map(([code, title, cat, trigger, steps, next]) => ({
  code, title, category: C[cat], trigger,
  steps: steps.split(";").map((part) => {
    const [unitCode, task, minutes, flagText = ""] = part.split("|");
    const flags = flagText.split(",").map((f) => f.trim()).filter(Boolean);
    const wait = flags.find((f) => /^W\d+$/.test(f));
    const approval = flags.includes("A");
    return { unitCode, task, minutes: Number(minutes), approval, waitMinutes: wait ? Number(wait.slice(1)) : 0, clinical: approval && UNIT_KIND.get(unitCode) === "clinical" };
  }),
  nextRules: (next ? next.split(",") : []).map((part) => { const [code, when] = part.split("?"); return { code, when: when ?? null }; }),
})).map((p) => ({ ...p, next: p.nextRules.map((r) => r.code) }));

/** Kapanan akışın hangi bağlı akışları açacağı: koşulsuzlar her zaman, koşullular yalnız işaretlenen koşulla. */
export function chainTargets(playbook: Playbook, conditions: readonly string[]) {
  const chosen = new Set(conditions);
  return {
    start: playbook.nextRules.filter((r) => !r.when || chosen.has(r.when)).map((r) => r.code),
    skip: playbook.nextRules.filter((r) => r.when && !chosen.has(r.when)).map((r) => ({ code: r.code, when: r.when as string })),
  };
}

export function playbookOf(code: string) { return PLAYBOOKS.find((p) => p.code === code) ?? null; }

/** Kütüphanenin tutarlılığı: benzersiz kod, bilinen birimler, var olan sonraki akışlar. Testler ve açılış kontrolü için. */
export function validatePlaybooks() {
  const problems: string[] = [];
  const codes = new Set<string>();
  for (const p of PLAYBOOKS) {
    if (codes.has(p.code)) problems.push(`yinelenen kod ${p.code}`);
    codes.add(p.code);
    if (p.steps.length < 2) problems.push(`${p.code}: en az iki adım gerekir`);
    for (const s of p.steps) {
      if (!UNIT_CODES.has(s.unitCode)) problems.push(`${p.code}: bilinmeyen birim ${s.unitCode}`);
      if (!Number.isFinite(s.minutes) || s.minutes <= 0) problems.push(`${p.code}: geçersiz süre`);
    }
  }
  for (const p of PLAYBOOKS) for (const n of p.nextRules) {
    if (!codes.has(n.code)) problems.push(`${p.code}: bilinmeyen sonraki akış ${n.code}`);
    if (n.when && !CHAIN_CONDITIONS[n.when]) problems.push(`${p.code}: bilinmeyen zincir koşulu ${n.when}`);
  }
  return problems;
}

/** Akış ağı: düğümler birimler, kenarlar akışın bir birimden sonrakine geçişi. */
export function playbookNetwork() {
  const units = new Map<string, number>();
  const edges = new Map<string, number>();
  for (const p of PLAYBOOKS) {
    p.steps.forEach((s, i) => {
      units.set(s.unitCode, (units.get(s.unitCode) || 0) + 1);
      const prev = p.steps[i - 1];
      if (prev && prev.unitCode !== s.unitCode) { const k = `${prev.unitCode}>${s.unitCode}`; edges.set(k, (edges.get(k) || 0) + 1); }
    });
  }
  const unitName = (code: string) => HOSPITAL_UNITS.find((u) => u.code === code)?.name ?? code;
  return {
    units: [...units.entries()].map(([code, steps]) => ({ code, name: unitName(code), steps })).sort((a, b) => b.steps - a.steps),
    handoffs: [...edges.entries()].map(([k, count]) => { const [from, to] = k.split(">"); return { from, to, count }; }).sort((a, b) => b.count - a.count),
    chains: PLAYBOOKS.flatMap((p) => p.nextRules.map((n) => ({ from: p.code, to: n.code, when: n.when ? CHAIN_CONDITIONS[n.when] : null }))),
  };
}
