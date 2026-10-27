# Tasarım denetimi uygulaması — 26 Ekim 2026

Main 0da8c15 tabanında, güvenlik PR #19'dan ayrı görsel değişiklikler. Ana dala birleştirme, canlı yayın veya yeni migrasyon yapılmadı. Mevcut 0013/0014 önceki onaylı Sites yayınının parçasıdır; bu PR bunlara dokunmaz.

## Uygulananlar

- L1: “Örnek talep oluştur” tek dolu birincil eylem. Yetkili çalışma alanı girişi ikincil bağlantı; klinik sınır ve demo verileri korunur.
- L2: ayrı sol menü kaldırıldı. Mevcut altı tur sekmesine ikinci sırada “Komuta özeti” eklenerek tek sekme menüsü oluşturuldu. Pano içeriği bu sekmede; kurgusal pano sayılarının tur kayıtlarından bağımsız olduğu belirtilir. h1 en üsttedir.
- L3: telefonda logo + EN + menü tek satır; ürün sayfasına dönme ve yetkili giriş menü içindedir. Tur sekmeleri 44 piksel hedeflerle tek satırda kayar; sayfa yatay taşmaz. Üç adım masaüstünde aynı hizada, mobilde sırayla görünür.
- L4: kaynak birim klavyeyle aranıp seçilebilen combobox oldu. Sık kullanılan beş birim önce gelir; mevcut 98 birimin kodu ve kaynağı değişmedi. Oklar/Enter/Escape/Tab, etiket ve aktif seçenek bağlantıları desteklenir. Serbest metin birim kodu olarak kaydedilemez; geçerli seçim yoksa oluşturma kapalıdır.
- L5: menüde 22 Unicode simge yerine lucide-react 1.24.0 ikonları, aria-hidden=true ve cümle düzeninde etiketler. View anahtarları, ROLE_VIEWS, URL eşlemeleri ve sunucu yetkileri korunur. ROLE_VIEWS metni önceki kaynakla birebir karşılaştırıldı (672 karakter, aynı).
- tokens.css ve yeni demo CSS'i için Stylelint color-no-hex uyarısı eklendi. Toplu renk göçü ve karanlık mod yapılmadı. Arial yedeği sistem sans-serif yedeğiyle değiştirildi; Inter korunur.

## Doğrulama

npm test (doğrulanmış Worker derlemesi dahil): 415/415. tsc ve lint başarılı; değişmeyen dosyalarda altı eski lint uyarısı vardır, hata yok. Yeni CSS renk denetimi temizdir.

Yerel tarayıcıda 1440 ve 375 piksel:

- Arama: “kardiyo” yaz → oklarla seç → Enter → Kardiyoloji için DEMO-004 oluştur.
- DEMO-001: üstlen → Randevu Merkezi'ne aktar → hedef olarak kabul et → tamamla. Kaynak sahipliği kabulden önce korunur; geçmişte bütün adımlar görünür.
- Yeni sekmeler arasında talep durumu korunur; yalnız sayfa yenilenince sıfırlanır. Sıfırlama kontrolünün erişilebilir adı “Demoyu sıfırla” olarak kalır.
- 1440 pikselde üç adım başlığının üst koordinatları aynıdır; 375 pikselde ilk adım ilk ekranda görünür. scrollWidth <= innerWidth, yatay sayfa taşması yoktur.

axe-core 4.14.0 ile /demo 375/1440 genişlikte WCAG 2 A/AA, 2.1 AA ve 2.2 AA etiketlerinde tarandı: ihlal bulunmadı; araç bir görsel inceleme maddesini elle kontrole bıraktı. Bu sonuç Lighthouse puanı veya tam erişilebilirlik uygunluk belgesi değildir. Gerçek ekran okuyucu kullanıcısı/pilot hastane testi yapılmadı.

Yetkili çalışma alanı, /yonlendirme, İngilizce demo bileşenleri, HBYS ve klinik karar mekanizmaları değiştirilmedi. Yeni bağımlılıklar lucide-react (uygulama) ve stylelint (yalnız geliştirme) olup sürümleri sabittir. Renk taraması aşamalı olarak yalnız yeni demo CSS'i ve token dosyasını kapsar. Tarayıcı/axe yardımcıları yalnız çalışma klasöründedir; uygulamaya veya üretim paketine eklenmez.

PR ekran kanıtları docs/design-review/ altında bulunur; yalnız kurgusal yerel önizlemedir.
