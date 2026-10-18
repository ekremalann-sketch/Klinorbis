# HBYS koordinasyonu — Faz 1 kullanım ve kabul

Tarih: 19.10.2026. Bu faz yalnız `/hbys` sentetik kabul alanını açar; gerçek hastane bağlantısını açmaz.

## Kullanım
1. Operasyon yöneticisi `/hbys` adresinde kurgusal hastaneyi kurar. Sekiz yatak ve yalnız kendisi için sekiz saatlik sentetik vardiya oluşturulur.
2. Personel dizinindeki etkin CTM/ULS/YTK üyeleri için Vardiya ve devir sekmesinde vardiya planlanır. Bu işlem gerçek personel yetkisini değiştirmez; yeni hesap açmaz.
3. Bir yatakta yetkili taburcu kaydı gönderilir. Yatak hazır olmaz.
4. Fiziksel ayrılış gönderilir. CTM temizlik görevi oluşur; aynı olay kimliği ikinci iş açmaz.
5. Görevli kabul eder, başlatır ve temizlik tamamlandı der. İş `check` durumuna gelir.
6. İşi yapan kişiden farklı yetkili kontrol eder. Kaynak güncel, HBYS boş, fiziksel ayrılış doğrulanmış, teknik/personel engeli ve mutabakat sorunu yoksa yatak Hazır olur.
7. Yetkili transfer isteği hedefi ayırır. İkinci rezervasyon ve aynı kaynak için ikinci açık transport reddedilir.
8. ULS personeli kabul/başlat/teslim adımlarını yürütür. Doğru hedef ve iki kimlik unsurunun kurum prosedürüne göre doğrulandığı beyanı ile alıcı onayı gerekir. Bu prototip gerçek kimlik doğrulama sistemi değildir; kısa kod tek başına doğrulama sayılmaz.
9. Teslimde fiziksel kaynak/hedef değişir; HBYS durumu bilinmeyen ve mutabakat bekleyen olur. Güncel kaynak doğrulaması ve yetkili karşılaştırma olmadan hazır kapasite oluşmaz.
10. İptal/düzeltme inceleme görevi oluşturur, tamamlanmış işi açmaz. Karantinada yalnız güvenli alanlar/hata kodları tutulur; ham mesaj tutulmaz. En fazla beş deneme.

## Durum modeli
- Veri kaynağı/sürümü ve alım zamanı farklıdır. 15 dakikadan eski veri yeni rezervasyonu engeller.
- D1 batch içinde sürüm kontrolü, durum değişimi ve sentetik denetim kaydı birlikte yazılır. CHECK/UNIQUE kısıtları ikinci kabul/rezervasyonu reddeder.
- Kurum üyeliği sunucuda simops_members üzerinden zorlanır. Tarayıcıdaki kurum başlığı yetki vermez. SIM-KURUM-B kayıtları A kullanıcısına görünmez.
- İşin sahibi devralan onayına kadar korunur. Devralanın etkin üyeliği, vardiyası ve uygunluğu kontrol edilir.
- Fiziksel durum, HBYS durumu, temizlik, teknik engel ve personel engeli ayrı tutulur. Rezervasyon hazır kapasiteden düşer.
- Kurgusal izolasyon/özel temizlik ihtiyacı belirtilerden üretilmez. Bu fazda klinik temizlik talimatı alanı açılmadı.

## Migrasyon
0012_sim_hospital_coordination.sql yalnız yeni `simops_*` tablolarını ekler. Önceki 0000–0011 SQL dosyaları değişmedi. D1 gerçek kayıtlarına, playbook sayaçlarına ve bildirim kutusuna yazılmaz. Yetkilendirilmiş hesabın e-postası aktör kaydında tutulur; anonim denmez.

## Doğrulama
14 yeni kabul testi: giriş/yetki, kurum ayrımı, gerçek veri reddi, taburcu-ayrılış ayrımı, tekrar, iki kabul yarışı, bağımsız kontrol, teknik/personel engeli, çift rezervasyon, teslim, iptal/düzeltme, eski sıra, karantina, acil durdurma, vardiya ve sahiplik, mutabakat. Mevcut testler de her teslimde yeniden çalıştırılır. PostgreSQL veya gerçek HBYS performansı bu testlerden çıkarılamaz.

## Sonraki fazların açık maddeleri
- Gerçek TR PostgreSQL çekirdeği ve RLS/havuz izolasyonu; kurumsal doğrulama ve 500 bin kayıt ölçek kabulü.
- Üreticiye özel belgeli HBYS adaptörü, bağlantı/sözleşme ve salt okunur mutabakat.
- Tam taburcu kontrol listesi ile teknik cihaz/varlık/bakım takvimi veri modeli.
- Hasta iletişimi gerçek sağlayıcı teslim makbuzu, ayrı hizmet/ticari izin politikası.
- Mevcut eski D1 girişlerinin gerçek veriye kapatılması ve TR geçişi ayrıca tamamlanmadan bütün sistem için veri yerleşimi uygunluğu iddia edilmez.

Yarım gerçek adaptörler kullanıcıya etkin bağlantı diye sunulmaz. Gerçek HBYS bağlantısı bu fazda koddan etkinleştirilemez. Teknik, hukuki ve kurum kabulü tamamlanana kadar kapalıdır.

Faz 1 yerel son doğrulama: 386/386 test, tsc ve derleme geçti; lint hatası yok. GitHub kontrolü ayrıca beklenir.
