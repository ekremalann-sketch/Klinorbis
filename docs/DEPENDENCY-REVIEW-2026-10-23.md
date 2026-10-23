# Bağımlılık yükseltmesi — 23 Ekim 2026

Bu PR yalnız bağımlılık ve yeni Worker çalışma ortamına gerekli doğrulama uyarlamaları içindir. v56 ürün arayüzü paketi ve ayrı güvenlik kurulum PR'ı dahil değildir.

## Güncellemeler

- vinext 0.0.50 → 1.3.0 (npm registry latest kararlı).
- next → 16.4.2, react/react-dom/react-server-dom-webpack → 19.3.1.
- eslint-config-next → 16.4.2; @vitejs/plugin-rsc → 0.5.38.
- @cloudflare/vite-plugin → 1.65.0, wrangler → 4.152.0, vite → 8.3.5; workers-types sürümü uyumlandı.
- Miniflare, stable Wrangler'ın kullandığı **5.20261019.2-beta** sürümüne sabitlendi. Bu sürüm doğrudan yalnız doğrulama ortamını çalıştırmak için eklenmiştir; kendisi kararlı sürüm olarak sunulmamaktadır.

Yeni derlenmiş Worker `cloudflare:` modüllerini içeriyor. Eski Node `import()` testi `ERR_UNSUPPORTED_ESM_URL_SCHEME` ile çalışamıyordu. Derlenmiş Worker artık gerçek workerd/Miniflare içinde çalıştırılıyor; güvenlik başlığı, yetkisiz yönlendirme ve SEO beklentileri korunuyor. ASSETS taklidi yalnız sunucu HTML testlerinde 404 döner; gerçek CSS/JS ayrıca yerel Wrangler sunucusu ve tarayıcıyla kontrol edildi.

## Sürüm düşürmeden düzeltmeler

Dar overrides: `@esbuild-kit/core-utils` altındaki esbuild 0.28.2; satori altındaki fflate 0.7.5. Babel, fast-uri, js-yaml, brace-expansion ve browserslist mevcut üst paket aralıkları içinde yamalandı. `npm audit fix --force` kullanılmadı; drizzle-kit/eslint-config-next/vinext geriye alınmadı.

`node scripts/check-dependency-overrides.mjs`: gzip aç/kapat, gerçek Satori SVG üretimi ve geçici TypeScript Drizzle şemasından SQL migration üretimi başarılı. Geçici şema gerçek veritabanına bağlanmaz; üretim migration'ları değişmez.

## Doğrulama

- `npm test`: 388/388 (önce doğrulanmış build ve artifact kontrolü çalışır).
- `tsc --noEmit`: başarılı.
- `npm run lint`: 0 hata; mevcut 6 uyarı (hook bağımlılığı/kullanılmayan değişken).
- Tarayıcı, yerel derlenmiş uygulama `/demo`: talebi üstlen → birime devir öner → hedef birim kabul et → operasyon görevini tamamla. Durum ve geçmiş doğru. Bu sentetik bellek demosudur; gerçek hastane entegrasyon testi değildir. Yetkili sunucu API akışları davranış testlerinde SQLite üzerinden sınanır.

## Kalan risk

Tam audit temiz değildir: **braces ≤3.0.3** için GHSA-vfj7-8cjw-p6xm; registry'de yayımlanmış güvenli sürüm bulunamadı. Bir savunmasız alt paketin üst paketlere etkisi audit'te birden fazla satırdır. `braces` zinciri build/lint araçlarındadır; tam tarama kapısını sessizce geçme yok. İşletim/üretim taraması ayrıca raporlanır.

Yeni güvenli braces/üst paket yayımlandığında testle yükseltilmeli; kullanıcı kontrollü glob ifadeleri bu araçlara verilmemeli. Tam audit uyarıları varken bütün CI'nın yeşil olduğu iddia edilmez.

Ana dala birleştirme, üretim yayını, gerçek hesap veya sır değişikliği yapılmadı.

Kaynak sürümler: https://registry.npmjs.org/vinext/latest — https://registry.npmjs.org/next/latest — https://registry.npmjs.org/react-server-dom-webpack/latest
