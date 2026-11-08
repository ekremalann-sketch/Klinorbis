# Klinorbis — işlem zinciri ve eksik analizi

9 Kasım 2026 · Kaynak: canlı Sites sürümü. Üç ürünlük ortak analizin yalnız Klinorbis bölümü.

**Okuma kılavuzu.** Mevcut = kod veya davranış testi var. Kısmi = temel adım var, zincir tamamlanmıyor. Eksik = incelenen ilgili akışta gerekli işlem bulunamadı. Kapalı = kod veya altyapı temeli var, canlı yapılandırma kullanıma açmıyor. Doğrulanmadı = kuruma veya oturuma bağlı çalışma kontrol edilmedi. P0 pilotun önünü açar, P1 günlük kullanımı tamamlar, P2 ölçek ve entegrasyon işidir. Eski yayın testleri yeniden çalıştırılmadı.

Simülasyonda fiziksel ayrılışın tek temizlik görevi üretmesi, bağımsız temizlik kontrolü, çifte rezervasyonun önlenmesi, transfer teslim doğrulaması, karantina ve görev devri test edilmiş. Ayrı çekirdekte FHIR ve HL7 v2 köprü kodu da var. Pilot ortamda gerçek üretici bağlantısı ve gerçek vardiya işleyişi doğrulanmış değil.

| Öncelik ve işlem | Durum ve kanıt | Tamamlanma ölçütü |
|---|---|---|
| P0 · Rezervasyon süresi ve serbest bırakma | Kısmi. `simops_reservations` şemasında süre alanı yok. İncelenen koordinasyon kodunda kayıt teslimde siliniyor, ayrı zaman aşımı veya iptal yolu bulunmadı. | Ayrılan yatak süre dolumu ve yetkili iptalde serbest kalır. Talep gerekçeyle kuyruğa döner. Yarışan teslim/iptalden yalnız biri uygulanır. |
| P0 · Transfer karar ve teklif kaydı | Kısmi. Hedef rezervasyonu ve yetkili kaydı var. Hedef birimin kabul/ret, alternatif ve süre döngüsü bu koordinasyon akışında bağımsız adımlar olarak doğrulanmadı. | Hedef kabulü veya gerekçeli ret, alternatif yatak, yeniden teklif ve bildirim aynı transfer dosyasından izlenir. |
| P0 · Fiziksel ayrılış ve temizlik | Mevcut, simülasyon. Fiziksel ayrılış, tek görev, işin üstlenilmesi, bitiş ve bağımsız kontrol testli. | Mevcut testleri koruyarak yanlış oda, temizlik reddi ve kaynağın gecikmesi gerçek pilot prosedürleriyle eşleştirilir. |
| P0 · Kaynak mutabakatı | Kısmi. Eski mesaj, karantina, yeniden deneme ve yetkili mutabakat var. İncelenen bağlantı sentetik. | Gerçek olay sözleşmesi, kaynak kimliği, mesaj tekrarı ve sıra bozulması sınanır. Sistem bağlantısı kesilince ekran verinin yaşını ve karantina nedenini gösterir. |
| P0 · Vardiya ve sahiplik | Mevcut, simülasyon. Teklif edilen devir kabul edilene kadar mevcut sahip korunuyor. | Gerçek ekip pilotunda kabul edilmemiş devir, vardiya bitişi, yokluk ve sorumluya eskalasyon provası yapılır. |
| P1 · Görev kuyruğu kapsamı | Kısmi. Koordinasyon görünümü son 200 görevi getiriyor, birim süzmesini daha sonra uyguluyor. | Yoğun kurumda eski açık görev ve az hacimli birimin işleri görünmeye devam eder. Süzme sorguda uygulanır ve liste sayfalanır. |
| P1 · Taşıma ara adımları | Kısmi. `accept → start → deliver` ve teslim doğrulaması var. Ara gecikme, hedef değişikliği ve başarısız alım ayrı durumlar olarak görünmüyor. | Görevli alım ve varış anını kaydeder. Gecikme veya hedef değişikliğinde rezervasyon ve alıcı bildirimleri tutarlı kalır. |
| P1 · Teknik/personel engeli | Kısmi. Sürüm ve yönetici yetkisiyle iki bayrak güncelleniyor. Bu kayıtta engel gerekçesi, sahibi ve gözden geçirme zamanı ayrı alanlar olarak görünmüyor. | Her engel, kimin ne zaman kaldıracağını gösterir. Süresi geçen engel güvenli biçimde incelemeye taşınır. |
| P1 · Süreler ve operasyon raporu | Kısmi. Haftalık rapor ve dışa aktarma uçları var. Gerçek vaka boyunca olay süreleri ve alarm eşiği kabulü doğrulanmadı. | Talep–atama, ayrılış–temizlik, temizlik–hazır süreleri birim bazında ölçülür. Gecikme gerekçeleri sayılabilir. |
| P2 · Canlı kurum entegrasyonu | Doğrulanmadı. Köprü ve çekirdek kodu var. Üretici ve kurum bağlantısı demo yayınından ayrı. | Klinik karar kaynağı kurumda kalır. İmzalı olay, asgari veri, erişim kapsamı, kesinti ve geri dönüş gerçek pilotta doğrulanır. |

**İnceleme dayanakları:** `lib/hospital-coordination.ts`, `drizzle/0012_sim_hospital_coordination.sql`, `tests/hospital-coordination.test.mjs`, `core/src/bridge`, `app/api/weekly-report/route.ts`. Rezervasyon bulgusu simülasyon koordinasyonuna aittir. Çekirdekteki her aktarım yolunun aynı eksikliği taşıdığı sonucuna varılmadı.

## Uygulama sırası

**Klinorbis:** önce rezervasyon süresi/iptal ve görev kuyruğu, sonra kurum pilotu. Yanlış sıra, yinelenen mesaj ve vardiya değişiminde tek vaka tutarlı kalır.

## 9 Kasım yayın durumu

| Ürün | Sites sürümü | Kaynak | Test | Canlı doğrulama |
|---|---:|---|---:|---|
| Klinorbis | 75 | `590eeec` | 425/425 | `/demo` HTTP 200, CSP mevcut. |

| İş | Durum |
|---|---|
| Klinorbis rezervasyon iptali ve süre | Yetkili ve gerekçeli iptal tek veritabanı işlemi. Taşıma başlamadıysa simülasyon rezervasyonu 30 dakikada sona eriyor. Görünüm süresi dolan ayırmayı kapasiteden düşmüyor. Sonraki başarılı rezervasyon eski kaydı kapatıyor ve denetim kaydı yazıyor. Başlamış taşıma için yatak korunuyor. |
| Klinorbis görev kuyruğu | Birim kapsamı sorguda uygulanıyor. Açık görevler kapanmış kayıtların 200 kayıt sınırından ayrıldı. Büyük açık kuyruk için sayfalama ayrı iş. |
| Klinorbis süresi dolan görevin devri | Süresi dolan ayırma açık görev devrinde gösterilmiyor ve sunucu bu devri reddediyor. |

## Karşılaştırma kaynakları

- [TeleTracking yatak yönetimi](https://www.teletracking.com/wp-content/uploads/2023/09/electronic-bed-management-whitepaper.pdf)
