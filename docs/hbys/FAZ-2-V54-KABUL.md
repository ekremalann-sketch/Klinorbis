# Faz 2 — v54 çekirdeği ve birleştirilmiş kabul (19.10.2026)

## Kaynak ve yeniden ölçüm
v54 ZIP, v53 referansı ile karşılaştırıldı. Önceki Faz 0/1 kodu ve yeni /hbys kabul ekranı korundu. v54 ile aynı işlevi yapan ikinci kimlik kasası, PostgreSQL şeması veya HL7 ayrıştırıcı oluşturulmadı. Mevcut core/ kullanıldı. Gerçek HBYS/SSO/MFA bağlantısı eklenmedi; zorunlu iki aşamalı doğrulama getirilmedi.

Güncel sonuçlar: uygulama 388/388; çekirdek 33/33; her iki tip kontrolü, üretim derlemesi ve uygulama lint'i geçti (önceden kalan lint uyarıları var). Çekirdek test ortamı PGlite/gömülü PostgreSQL'dir. Normal PostgreSQL servisi, Türkiye sunucusu veya gerçek hastane pilotu test edildi iddiası yoktur. Önceki rapordaki 27 test sayısı yeni sonuç gibi kullanılmadı.

## v54 üzerine yapılan düzeltmeler
- Kuyruğa alınan bildirim gönderildi sayılmaz: patientNotified=false; notificationQueued ayrı.
- Belirti sınıflandırması ve klinik puan yok. v54'ün sabit kanal/112 bilgilendirmesi ve otomatik mesajı görevliye bırakma davranışı kullanılır; klinik birim veya öncelik değiştirilmez.
- Başarısız HBYS mesajı aynı kimlikle yeniden işlenebilir. Aynı kimlik farklı içerikle kullanılamaz. Sonradan gelen hata, başarıyla işlenmiş mesajı failed durumuna düşüremez.
- Kaynak olay zamanı yatış üzerinde saklanır; daha eski veya kapalı yatışı açmaya çalışan mesaj inceleme görevi açar, kapasiteyi değiştirmez.
- İmza için kalıcı PostgreSQL nonce deposu eklendi; yeni işçi örneği aynı nonce'u tekrar kabul etmez. Bellek içi depo yalnız test içindir.
- Anahtar rotasyonu tek işlemde yapılır. KMS wrap hatası eski aktif anahtarı kapatmaz. Eski anahtar sürümleriyle şifrelenmiş kimlikler rotasyondan sonra çözülebilir.
- Keyfi break_glass kimliği normal yetkiyi atlatamaz. Üretim acil erişim arayüzü kapalıdır.
- Core migrasyon 0013 sıralı eklendi; v54'ün 0001–0012 dosyaları düzenlenmedi. D1 tarafında Faz 1'in 0012 simops migrasyonu dışında eski zincire dokunulmadı.
- CI Node 24'te hem uygulama hem çekirdek tip/test kontrollerini çalıştıracak şekilde genişletildi.

## Yeni kontrol matrisi durumu
|Kontrol|Yazılım kanıtı|Açık kalan|
|---|---|---|
|Kurum/birim kapsamı|D1 sentetik kapsam + gömülü PG RLS testleri|Gerçek PG havuzu/SSO bağlamı|
|Anahtar/kasa|AES-GCM, eski sürüm çözümü, rotasyon hatası testi|Üretim KMS/HSM sağlayıcısı ve ayrıcalıklı servis kurulumu|
|Mesaj tekrar/sıra|Aynı kimlik ve hash, kalıcı nonce, kapalı yatış testi|Üretici sözleşmesi, gerçek uç nokta ve mutabakat|
|Yatak/temizlik/transport|Faz 1 API/UI ve 14 davranış kabul testi|Gerçek kimlik/prosedür entegrasyonu|
|Veri yerleşimi|Bulut demo uyarısı; yeni /hbys yalnız SIM verisi kabul eder|Tüm eski D1 girişlerinin TR veri katmanına geçişi|
|Denetim|Mevcut zincir ve yeni olay kaydı testleri|Reddedilen bütün kasa denemelerinin dış işlemde kalıcı kaydı ve üretim operasyon politikası|
|KVKK süreleri|Kodlanmış sayaç ve tarih testleri|Kurum hukukçusunun somut yükümlülük ve başlangıç anı teyidi|
|Ölçek|Standart davranış testleri|500 bin kayıt gerçek şemada yük testi henüz yapılmadı|

## Kabul sınırı
Çekirdek kaynakları ZIP/PR içindedir fakat Cloudflare Worker'a PostgreSQL/kimlik kasası çalıştıran servis olarak bağlanmaz. Ekranlar D1 sentetik profilde kalır. Gerçek veriyle üretime hazır/sertifikalı/tam uyumlu sonucu çıkarılamaz. Gerçek çekirdeğe geçiş; Türkiye'de servis ve veritabanı, üretici adaptörü, kurum kimlik sistemi, hukuk/KTS ve erişim sözleşmeleriyle ayrı kabul gerektirir.
