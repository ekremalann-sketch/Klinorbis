# KVKK raporu uygulama durumu — 10 Ekim 2026

Yeni rapor eski kaynak sürümlerini inceliyordu. Bu tablo güncel kaynakta gerçekten tamamlanan, önceki yayında olan ve açık kalan işleri ayırır. Raporun 40 maddesinin tamamı bitmiş değildir.

## Önceki uyarlamada tamamlanan temel değişiklikler

- Yönetici MFA, kısa oturum, IP değişimine dayanıklı hesap deneme sınırı ve kullanıcı erişim ekranı.
- Tarama yoksa yükleme yok; PDF indirme; genel API hatalarında iç ayrıntı yok.
- Klinorbis önizleme yetki kestirmesi yok; sahibin personel kaydı var. Gözetim rollerinde serbest metin/transkript gizli. Eski PBX imzası yok.
- Saatlik kapsamlı okuma kaydı; AI aktarım öncesi maskeleme ve bilgilendirme; kayıt aydınlatma sürümü.
- Klinik merkez /merkez; çalışan listesine doğrudan erişim; aktif ekran yüklemesi.
- Büyük Excel/CSV düğmeleri yerine varsayılan kapalı küçük İşlemler menüsü. Ödeme ekranındaki tekrarlanan indirme/yeni kayıt düğmeleri kaldırıldı.

## Ekranlar arası oturum ve dönüş

Teksanor giriş sayfası artık mevcut oturumu kontrol eder. Geçerli oturum varsa yeniden parola formuna ihtiyaç olmadan çalışma alanına döner. Parola/MFA gerektiğinde dönüş adresi ekran, firma ve filtreyi korur; harici adres ve giriş döngüleri reddedilir. Firma seçimi birim/servis ekranından panele taşınır. Aynı oturumla panel → servis → birimler → panel API zinciri davranış testinde doğrulanır. Gerçek tarayıcıdaki bildirilen olay bu ortamda yeniden üretilemedi; bu nedenle tüm olası oturum kaybı nedenleri giderildi denmez.

Klinorbis ekran değişimleri mevcut history/state geçişini korur; merkez dönüşü /merkez adresine gider. Geçerli oturumun varlığı sayfa değiştirmekten bağımsızdır. Gerçek oturum süresi dolması veya erişim iptali yeniden doğrulama gerektirir.

## 40 maddelik durum matrisi

| # | Durum | Uygulama ve sınır |
|---|---|---|
| 1 | Kısmi | KL yayın alan adı izin listesi ve workers.dev reddi eklendi. Platform dağıtım ayarlarının bağımsız denetimi yapılmadı. |
| 2 | Uygulandı | Önizleme sahibi kestirmesi kaldırıldı; doğrulanmış platform sahibine personel kaydı ve ilk erişim güvenlik kaydı. Pasif kayıt yeniden açılmaz. |
| 3 | Önceden/kısmi | Üretimde demo motoru kapalı, eğitim kayıtları ayrılır. Klinik karar personeldedir. Kurumla doğrulanmış gerçek sevk bağlantısı yok. |
| 4 | Uygulandı | KL operasyon merkezi /merkez adresinde; pazarlama sayfası ayrı. |
| 5 | Uygulandı | TK firma sahibi, firma yöneticisi ve platform yöneticisi için MFA kurulmadan firma verisi açılmaz; kurulum ekranı erişilebilir. Üretim şifreleme anahtarı yapılandırılmış. |
| 6 | Uygulandı | TK tarama bağlantısı yokken yükleme durur; PDF zorunlu indirilir. Gerçek tarama servisi bağlı değildir. |
| 7 | Uygulandı | TK genel istisna mesajları API yanıtından çıkarıldı; tipli finans/doğrulama hataları kullanıcıya anlaşılır kalır. |
| 8 | Uygulandı | TK health yalnız kullanılabilirlik döndürür; sürüm/bağımlılık ayrıntısı gizli. Hazırlık API yöneticiye özel; açık sayfa iç risk listesini göstermez. |
| 9 | Uygulandı/kısmi | MFA ve saklama açıklamaları gerçek duruma göre düzeltildi. Otomatik imha veya tam KVKK uyumu iddia edilmez. |
| 10 | Kısmi | KL eski PBX imzası kaldırıldı; yalnız timestamp.eventId.body v2. Log tuzu ayrı. Tüm entegrasyonlar için ayrı anahtar geçişi tamamlanmadı. |
| 11 | Kısmi | Saatlik okuma kayıtları genişletildi: TK müşteri detayı, belge listesi ve servis listesi/özeti; KL koordinasyon detayı ve çağrı/talep ekranında seçilen kayıt için birim kontrollü okuma bildirimi. Tüm veri uçları henüz aynı kapsamda değil. |
| 12 | Kısmi | TK sunucuda 30 dakika istek hareketsizliği ve 12 saat mutlak oturum; tarayıcıda 30 dakika kullanıcı hareketsizliği. Hesap limiti IP değişimiyle aşılamaz. Rol düzenleme modülü yok. |
| 13 | Uygulandı | TK /kullanicilar ve PATCH /api/users/[id]. Firma üyeliği kapatma/açma; açık oturumları iptal etme; kendi hesabı ve son yönetici koruması; denetim kaydı. |
| 14 | Kısmi | TK harici AI öncesi telefon/e-posta/11 haneli kimlik/IBAN maskesi; eski geçmiş de aktarım öncesi maskelenir; bilgilendirme doğrulaması gerekli. Son 90 gün görünür. Otomatik imha ve ad/serbest sağlık metni tespiti yok. |
| 15 | Kısmi | İki üründe /gizlilik /aydinlatma /cerezler. TK kayıt formunda aydınlatma sürümü ve zaman kaydı. Kurum kimliği, hukuki sebep/alıcı/başvuru kanalı içeren nihai metin ve hukuki kontrol gerekli. |
| 16 | Kısmi | KL gözetim rollerine serbest metin, konuşma ve hasta alanları verilmez; yalnız metadata. Ayrıntılı rapor dışa aktarımı kapalı, ağ özeti açık. Gerekçeli istisnai erişim modülü yok. |
| 17 | Bekliyor | Rıza kaydı sürüm/kaynak/geri çekilme genişletmesi tamamlanmadı. |
| 18 | Yeni kayıtlar uygulandı | KL yeni denetim kayıtları ayrı KLINORBIS_AUDIT_HMAC_KEY ile HMAC v2 kullanır. SQLite tetikleyicisi aynı başlıkta iki zincir dalını reddeder. Tekil yazım yeniden dener; birleşik iş/denetim batch eski başlıkta tamamen geri alınır. Eski kayıtlar yeniden imzalanmaz; dış denetim ve anahtar sürümü/rotasyon arşivi ayrı iştir. |
| 19 | Bekliyor | Veri işleme sözleşmesi ve olay müdahale planının kuruma özel hukuk incelemesi gerekli. |
| 20 | Önceden/kısmi | KL değişmeyen veride yeniden çizim azaltıldı; görünür sekmede artan aralıklı yenileme, tek istek, timeout. Otomasyon kalp atışı korunur; bağımsız kapalı-panel zamanlayıcısı yok. Ekran başına dar veri API henüz yok. |
| 21 | Kısmi | TK aktif ekran kaynak yüklemesi korunur; servis belgeleri sunucuda seçilen işe göre süzülür. Akış özeti toplamları sunucuda hesaplanır. Tüm eski listelere sayfalama henüz uygulanmadı. |
| 22 | Kısmi | TK çalışan / birim yöneticisi / finans / İK / BT için homeFor giriş ana ekranı eklendi. Açık dönüş bağlantısı önceliklidir. KL operasyon yöneticisi /merkez ile açılır; mobil alt menü rolün ilk dört ekranından üretilir. TK tüm meslek alt profilleri ve mobil alt çubuklar tamamlanmadı. |
| 23 | Kısmi | TK Departmanlar ve Ar-Ge yinelenen menü girişleri kaldırıldı; tek Birimler ve süreçler bağlantısı korunur. Tüm eski genel bakış kartları ve boş ekran tekrarları henüz görsel taramadan geçmedi. |
| 24 | Uygulandı | TK Çalışan kayıtları menüsü artık İK süreçlerine zorla yönlendirmez; ayrı çalışan listesi açılır. |
| 25 | Kısmi | TK /api/attention ve Dikkat şeridi eklendi: geciken servis, müşteri onayı, süresi geçen görev ve kritik açık risk. Sıfırlar gizlenir; aynı firmada servis atama sınırları korunur. KL eski şerit ve diğer istenen sinyaller mevcut sınırlarla sürer. |
| 26 | Kısmi | TK dikkat bağlantıları görev gecikmesi, kritik risk ve servis onay filtresini taşır. Genel geri al ve tüm bildirim derin bağlantıları hâlâ tamamlanmadı. |
| 27 | Kısmi | İki üründe ortak Field, alanın adını taşıyan Türkçe doğrulama mesajı ve ipucu desteği kullanır; yeni veri yönetimi formları yıldız/required/aria-required ile kuruldu. Eski formların tümü taşınmadı. |
| 28 | Önceden uygulandı | Kısa kullanım kılavuzları varsayılan kapalı. |
| 29 | Uygulandı | KL çekmecesi duruma göre Üstlen → İşleme al → Sonuçlandır düğmesi gösterir. Bekleyen insan onayında işlem durur. |
| 30 | Kısmi | İki üründe saklama politikası, süre, dayanak referansı, hukuki bekletme ve farklı yetkilinin onayı kaydedilir. Otomatik imha/anonimleştirme ve imha tutanağı henüz çalışmaz; hiçbir gerçek kayıt silinmedi. |
| 31 | Kısmi | İki üründe ilgili kişi başvurusu kaydı, teslim tarihinden 30 gün hedefi, kimlik kontrolü referansı, bağımsız gerekçeli karar ve yazılı yanıt belge referansı uygulandı. Kişiye mesaj gönderimi, kişi bazlı tam veri dışa aktarımı ve onaylı anonimleştirme henüz yok. |
| 32 | Bekliyor | MFA anahtarı şifrelemesi mevcut; müşteri/çalışan/transkript alanlarına sürümlü şifreleme ve eski veriyi taşıma tamamlanmadı. |
| 33 | Kısmi | İki kaynakta AES-256-GCM yedek dosyası şifreleme/açma aracı eklendi. Sentetik SQL geri yükleme ve bozuk dosyayı reddetme testleri geçti. Üretim dışa aktarım zamanlayıcısı, anahtar yedeği ve üretim geri dönüş tatbikatı tamamlanmadı. |
| 34 | Harici yapılandırma | KL platform kimliği kullanır; hastane SSO/MFA sağlayıcısı bağlanmadı. |
| 35 | Kısmi | TK servis akış kartı: aşama adetleri, yaklaşık ortalama bekleme, sayı × bekleme ile biriken aşama ve en uzun geciken ilk beş iş. Son güncellemeye göre yaklaşık olduğu ekranda yazılır. Birim performans tablosu ve KL birleşik ekran henüz yok. |
| 36 | Kısmi | TK viewportFit cover; iki üründe mobil 16px form, dokunma boyutu/svh temeli. KL hasta çevrimdışı önbelleği eklenmedi; PWA paketleme tamamlanmadı. |
| 37 | Kısmi | TK servis fotoğrafları tarayıcıda yeni JPEG olarak kodlanır, uzun kenar en fazla 1600 piksel; eski EXIF/GPS metadata taşınmaz. Kamera capture seçeneği korunur. Çevrimdışı kuyruk ve mağaza dağıtımı hâlâ yok. |
| 38 | Önceden/kısmi | Hakkımızda ilkeleri gerçek özelliklere göre güncellendi; gizlilik sayfaları eklendi. Bu durum matrisi kanıt kayıtlarının başlangıcıdır; kurum imzalı iddia envanteri yok. |
| 39 | Harici süreç | KTS kapsamı, kurum sözleşmesi ve Türkiye barındırma doğrulaması kodla tamamlanmış sayılmaz. |
| 40 | Harici süreç | Bağımsız sızma testi veya ISO sertifikasyonu yapılmadı. |

## Güvenlik ve doğrulama sınırları

Alan adı izni platform kimliğinin kriptografik kanıtı değildir. Sites kimlik başlıklarını platform dispatch üretir; Worker alternatif adresleri reddeder. Kontrol düzlemi dağıtım ayarları bağımsız incelenmedi.

Okuma kayıtları içerik/transkript taşımaz. Saatlik kayıt, her satırın her görüntülenmesini ayrı ayrı kanıtlama garantisi değildir. Yeni kayıtların zincir başlığı ve HMAC koruması eklenmiştir; tarihsel kayıtların tamamı için bağımsız bütünlük denetimi yapılmış değildir.

Üretim verisinden satır silinmedi. Otomatik imha, alan şifreleme ve yedek taşıma, doğrulanmış saklama politikası ve geri yükleme planı olmadan eklenmedi. Maskeleme anonimleştirme değildir. Genel hukuk sayfaları sözleşme veya tam aydınlatma metni yerine geçmez.

Gerçek tarayıcı kontrolü bu ortamda desteklenmediği için ekran görüntüsü, mobil tıklama taraması ve FPS/kasma ölçümü yapılmadı. Sunucu davranış testleri, TypeScript kontrolü ve üretim derlemesi kullanılır.

## Kaynaklar

- KVKK 2018/10: https://www.kvkk.gov.tr/Icerik/4110/2018-10
- İlgili kişi başvuru yanıtı: https://www.kvkk.gov.tr/Icerik/2046/Ilgili-Kisiler-Tarafindan-Yapilan-Basvurularin-Cevaplanmasi-Yukumlulugu
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

## Yayın ve kaynak

Değişiklikler Sites kaynak deposunda tutulur. GitHub main dalının bu turda değiştirildiği iddia edilmez. Kaynak ZIP içinde üretim parolası veya gizli anahtar bulunmaz.

## Ek uyarlama — 10 Ekim 2026

Yeni ekranlar: TK `/veri-yonetimi`; KL `/data-governance`. Yönetici / KVKK görevlisi rolü API tarafından kontrol edilir. TK firma ayrımı korunur; KL bu sürümde tek kurum kapsamındadır. Başvurular 50 kayıtlık sayfalar halinde alınır. Bu ekranlar kişi kimliğini kendiliğinden doğrulamaz; kurum prosedürü sonucunun referansını kaydeder. Gönderildi kaydı bir SMS/e-posta entegrasyonu kanıtı değildir; kurumun yazılı yanıt belge referansıdır.

Saklama politikası kaydetmek imha yapmak değildir. Süreler kurumun onaylı hukuki dayanağına göre girilir; sistem bütün veri türlerine tek bir yasal süre uydurmaz. Gerçek finans/hasta verisi otomatik silinmedi.

Klinorbis denetim zincirindeki yeni kayıtlar HMAC v2 ile yazılır. Mevcut SHA/LEGACY kayıtlar tarihsel biçimleriyle kalır. Veritabanı yöneticisine karşı mutlak değişmezlik garantisi verilmez; bağımsız zincir doğrulaması ve anahtar rotasyon arşivi ayrıca gerekir. Tetikleyici şema kurulumu ekleyicidir.

Kaynak rapor eski commitleri analiz ediyordu; başlangıç bulguları güncel kod için yeniden doğrulandı. Hukuki süre ve yanıt usulü birincil KVKK kaynaklarından kontrol edildi; report içindeki bütün dış pazar/tarih iddiaları doğrulanmış sayılmaz.

Birincil kaynaklar:
- https://www.kvkk.gov.tr/Icerik/2046/Ilgili-Kisiler-Tarafindan-Yapilan-Basvurularin-Cevaplanmasi-Yukumlulugu
- https://www.kvkk.gov.tr/Icerik/9024/ilgili-kisilerin-basvurularina-verilecek-cevabin-bildirim-usulune-iliskin-kamuoyu-duyurusu
- https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK
