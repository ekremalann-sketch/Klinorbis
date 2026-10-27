# Güvenlik raporunun güncel değerlendirmesi — 27 Ekim 2026

## Uygulanan değişiklikler

- Güvenlik dalı güncel main `9cd7d9c` ile birleştirildi; birim yönlendirmesi ve tasarım değişiklikleri korundu.
- Miniflare altındaki `undici` 7.29.1 → 7.30.1, eslint-plugin-react-hooks altındaki `zod` 4.4.3 → 4.6.7 yükseltildi. Override'lar ilgili üst paketle sınırlıdır. Framework, ESLint veya Cloudflare paketleri eski sürüme döndürülmedi.
- Mevcut CI'daki checkout ve setup-node tam commit SHA'larına sabitlendi; yayın veya erişim yetkileri genişletilmedi.
- Yeni sentetik HTTP istemcisi ve izole Worker POST/JSON testleri çalışır. Zod kullanan ESLint eklentisi ayrıca gerçek lint çalışmasıyla doğrulanır.

## Doğrulama

- `npm test`: 417/417; envanter testleri ayrıca 7/7.
- TypeScript ve doğrulanmış Worker derlemesi başarılı; lint 0 hata, değişiklik dışındaki mevcut 6 uyarı devam eder.
- Geliştirme bağımlılıkları dahil kök kilit dosyası için `npm audit --package-lock-only --ignore-scripts`: 0 bulgu. Çekirdeğin ayrı kilidi ve testleri ayrıca kontrol edilir. Tarama sonucu tam güvenlik sertifikası değildir.

## Kimlik doğrulama güven sınırı

`lib/security.ts` içindeki `requireActor`, Sites dispatch katmanının sağladığı `oai-authenticated-user-email` ve `oai-authenticated-user-id` başlıklarını kullanır; aktif personel ve birim yetkisini veritabanından ayrıca denetler. `.workers.dev` doğrudan erişimi reddedilir. Bu mevcut Sites barındırma sözleşmesine bağlı bir mimaridir; başka barındırmaya taşınacaksa doğrudan origin kapatılmalı ve kullanıcı başlıkları güvenilir ağ geçidinde silinip doğrulanmış kimlikle yeniden üretilmeli veya bağımsız oturum doğrulaması kurulmalıdır. Sadece alan adı kontrolü kimlik doğrulama sayılmaz.

Mevcut Sites giriş/rol politikasını değiştirmek bu PR'ın kapsamı değildir. Başka sunucuda güvenilir ağ geçidi olmadan çalıştırılması desteklenmiş veya test edilmiş sayılmaz.

## Sınırlar ve geri alma

“SQL enjeksiyonu yok”, “gerçek kişi verisi yok”, “A+” ve “hiç açık yok” iddiaları tüm sistem için yeniden doğrulanmış değildir. GitHub gizli bilgi taraması ayrı kontrol, hesap ve sözleşme ayarları ayrı kanıt gerektirir. Zamanlanmış görev hesabının çalıştığı veya silindiği bu kod incelemesiyle doğrulanamaz.

Ana dala birleştirme ve bu güvenlik PR'ının canlı yayını yapılmadı. Önceden açıkça onaylanan #23 tasarım yayını ayrıdır. Geri alma: yalnız override, kilit, uyumluluk testi ve CI sabitleme commit'i geri alınır; yeni migrasyon yoktur.

Çekirdek doğrulaması da tamamlandı: 49/49 test ve typecheck başarılı; çekirdek kilidinin geliştirme bağımlılıkları dahil audit sonucu 0 bulgu.
