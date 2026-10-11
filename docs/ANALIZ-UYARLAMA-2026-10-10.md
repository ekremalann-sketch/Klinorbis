# Güncel analiz uyarlaması — 10 Ekim 2026

Bu değişiklik güvenlik ve arayüzdeki öncelikli bulguları uygular. Raporun aylar sürecek tüm yol haritası tamamlanmış değildir.

## Uygulanan
- Her iki uygulamada yardım kutuları varsayılan kapalı.
- Teksanor müşteri menüsünden ürün yol haritası kaldırıldı; üst başlık açıklaması tekrarları azaltıldı. Taslak yardımcısında yanıltıcı onay etiketi düzeltildi.
- Klinorbis eğitim/pilot ve kapasite simülasyonları `KLINORBIS_DEMO_ENABLED=1` verilmedikçe üretimde çalışmaz. Gerçek klinik sevk kabul/ret motoru yoktur; simülasyon gerçek işlemlerden ayrıdır.
- Mevcut eğitim çağrıları, pilot talepleri, bağlantılı görev/onay/olaylar ve kapasite verileri üretim çalışma alanından SQL sorgusu aşamasında, liste limitinden önce ayrılır. Kayıtlar silinmez; açık eğitim ortamında erişilebilir.
- Klinorbis operasyon yöneticisi ve güvenlik yetkilisi otomasyonu durdurabilir/başlatabilir. Yetki/CSRF/rate-limit sunucuda uygulanır, kontrol ve audit aynı veritabanı batch'inde yazılır. Durdurma sonraki döngülere uygulanır; çalışan işlem güvenli tamamlanır. Düğme operasyon ve güvenlik ekranlarında bulunur.
- Klinik karar veriyormuş gibi görünen dil düzeltildi. Ekran okuyucuya sürekli kontrol şeridi duyurusu kaldırıldı. Teknik kurallar isteğe bağlı açılır.
- Klinorbis veri yenileme 5 yerine 15 saniye; görünür yönetici heartbeat 30 saniye ve ortak kilit korunur.
- Acil sinyal sözlüğü kalp krizi, zehirlenme, anafilaksi, havale ve ağır/ciddi yanık ifadeleriyle genişletildi. Bu klinik teşhis veya klinisyen doğrulaması değildir.
- Mobil otomasyon bağlantısı rolün görünür ekranlarına uyar. Çalışma alanı girişinde sunucudan okunan rolün ana ekranına yönlendirme yapılır.

## Korunan
Kendi akışını onaylama engeli, klinisyene özel karar sınırı, HBYS teyidi olmadan kesin randevu iddiası üretmeme, SMS sağlayıcısı bağlı değilken gönderildi dememe, firma ve birim yetki sınırları korunur. Teksanor süreç sonucu önizlemesi zaten bulunduğu için korunmuştur. Önceki istenen İK/Ar-Ge/birimler kaldırılmaz.

## Henüz uygulanmayan
Tek servis kayıt modeli ve eski departman verilerinin birleşmesi veri eşleştirme/göç tasarımı gerektirir. Seçmeli süreç takipleri ve toplu geri alma, 6/10 öğelik birleşik navigasyon, tam koyu tema/tasarım sistemi, kalemli teklif/stok, müşteri portalı, çevrimdışı kuyruk, duvar ekranı ve SSO henüz yoktur. Gerçek SMS/WhatsApp, e-Fatura ve HBYS sağlayıcı/kurum erişimleri olmadan bağlı değildir. Eğitim kayıtları arşivlenmiş/silinmiş değildir; ayrı tutulur. Eğitim işaretleri mevcut eğitim alanları ve kesin sistem kaynaklarıyla belirlenir; yeni training sütunu göçü bu değişiklikte yapılmaz. Denetim hash zincirinin eşzamanlı yazım sınırlaması çözülmüş sayılmaz. Klinisyenle acil sözlük doğrulaması yapılmadı. Tüm ekran bazlı/delta uçları henüz yapılmadı.
