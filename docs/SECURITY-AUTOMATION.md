# Klinorbis otomatik güvenlik izlemesi

23 Ekim 2026. GitHub main: 33cb1962d4f13cad17dc6061280dba3e7e861e83 tabanından hazırlanmıştır.

## Ne çalışır?

PR ve her dala push: CodeQL, npm kilit dosyası güvenlik taraması (dev dahil, kurulum/yaşam döngüsü betiği yok), geçmişte gizli bilgi arama. Pazartesi aynı taramalar tekrar çalışır. Elle başlatma desteklenir. Dependabot paket ve Actions güncelleme PR'ları önerir; otomatik birleştirme yoktur.

Gitleaks CLI MIT lisanslıdır; sürüm ve SHA-256 sabittir. Tarama runner içinde olur; ticari Gitleaks Action/lisans servisi kullanılmaz. Actions commit SHA'ları sabittir. PR kodu yazma tokenı veya üretim sırrı almaz; pull_request_target kullanılmaz. npm audit kilitteki paket meta verilerini npm kayıt servisine iletir, uygulama verisini göndermez.

Bu taramalar yapay zekâ değildir. AGENTS.md güvenlik incelemesi için hazırlanmıştır. Hesabın destekliyorsa Codex ayarlarında bu depo için Code review ve Automatic reviews açılmalı; sonraki commit inceleme tetikleyicileri kontrol edilmelidir. Security Review erişimi varsa ayrıca kapsam ve eşik ayarlanır. Bu ayarın mevcut durumu bu PR'da doğrulanmadı. Ücretli API anahtarı eklenmedi; hesap kullanım limitleri ve plan şartları geçerlidir.

Resmî rehber: https://learn.chatgpt.com/docs/third-party/github

## Bildirim ve kabul

GitHub'ın başarısız Actions bildirimleri kullanıcının kendi bildirim ayarlarına bağlıdır; e-posta garantisi yoktur. Sonuçlar Actions ve Security ekranında görülür. Ham gizli bilgi raporu yüklenmez. Tarama hatası veya ağ sorunu temiz sonuç sayılmaz.

PR birleşmeden yeni schedule/Dependabot yapılandırması ana dalda etkin değildir. İlk çalıştırmayı kontrol et; CodeQL default setup açıksa advanced workflow ile çakışmayı ayarlardan çöz. CodeQL çalışması yüklediği uyarıların sıfır olduğu anlamına gelmez; Security bulguları ayrıca değerlendirilir.

Secret scanning, push protection, Dependabot alerts ve zorunlu PR durum kontrolleri yönetici ayarlarıdır; dosya eklemek bunları açmaz. Secret scanning durumu bu kurulumda doğrulanmadı. Depo gizli hale getirilirse CodeQL lisans/plan uygunluğunu tekrar değerlendir; ücretli hizmeti onaysız açma.

Kabul: üç workflow çalışır; hata ve atlanma görünürdür; test/derleme hattı korunur; ilk bulgular incelenir; Codex ayarı ayrıca kanıtlanır. Geri alma: bu PR'ın yapılandırma değişikliklerini ayrı PR ile geri al. Canlı uygulama/veritabanı değişikliği yoktur.

## AI/veri risk kataloğu eki — 23 Ekim 2026

.security/ai-data-controls.json ve docs/AI-DATA-SECURITY.md 50 risk başlığını, önlemini ve doğrulamasını içerir. AI and data review inventory görev özeti bunların tamamını gösterir. Başlangıçta 50/50 KANIT YOK; rapor üretimi korumaların uygulanmış olduğu anlamına gelmez. Yedi sentetik test yalnız rapor güvenilirliğini denetler. Günlük yapay zekâ inceleme takibi de bu kataloğa genişletilmiştir.
