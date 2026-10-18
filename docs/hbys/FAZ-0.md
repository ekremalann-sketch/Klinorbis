# Faz 0 — kaynak ve ürün sınırı (19 Ekim 2026)

Yayımdaki başlangıç: bf9310579eb7411dcf3eb298e8d5b94fef918433 (v53 birleştirmesi). GitHub main: 98e62bdfb37ae2f4488122a6089188390c19f274. GitHub geride: simülasyon, bildirim, iş yükü ve haftalık rapor dosyaları eksik. Son yüklenen ZIP v53 referanstır; kaynak ZIP değişmedi. Çalışma alanında ayrı bir önceki Faz 0 raporu bulunamadı; eski faz kabulü varsayılmadı.

Başlangıçta yeniden çalıştırılan test: 372/372. Faz 0 sonrası: 372/372; tsc ve üretim derlemesi geçti. Klinik belirti tespitini bekleyen eski testler yeni ürün sınırını doğrulayacak şekilde değiştirildi; onay/kapalı kaydı geri açmama testleri açık yetkili karar fikstürleriyle korunuyor.

Belirtiden klinik puan ve klinik birime yönlendirme kaldırıldı. urgencyLevel=2 eski şema için nötr uyumluluk değeridir, klinik puan değildir. Operasyon birimi açık personel seçimi veya idari talep türünden gelir. Eski onaylar ve tamamlanmış kayıtlar değiştirilmedi. Teşhis/tedavi/tri­yaj kararı yok. Çağrı görevlisi sağlık sorularını yetkili sağlık personeline kendi prosedürüyle devretmelidir; sistem metinden klinik uygunluk çıkarmaz.

Bildirim yanıtında patientNotified=false; notificationQueued ayrı gösterilir. Kuyruk kaydı teslim kanıtı değildir.

## Çakışma haritası
|Mevcut özellik|Kullanılacak modül|Değişiklik|Tablo/API|Geriye uyumluluk|
|---|---|---|---|---|
|81 playbook / gecikme|playbook-store, escalation|Yeni koordinasyon kaydına referans, mevcut sayacı kirletmeden sentetik kabul|playbook_runs, operational_tasks|Mevcut tüm akış testleri|
|Kapasite/transfer|Yeni ayrıntılı sentetik kapasite kaydı; mevcut transfer ekranı korunur|Fiziksel/HBYS/temizlik/personel durumlarını ayır|Sıralı 0012 sim koordinasyon tabloları|Eski 0011 verisi değişmez|
|Vardiya ve iş yükü|workload / staff / shifts|Sentetik görevlendirmede vardiya uygunluğu ve devralma|Mevcut üyelikler + sim görevler|Birim sınırı/çakışma|
|Bildirimler|patient_notifications/staff_notifications|Kuyruk/teslim ayrımı, klinik içeriksiz mesaj|tickets POST|Kuyruk testi|
|HBYS olay alımı|Mevcut events API korunur; ayrı sentetik kabul köprüsü|Sıra, tekrar, karantina, iptal/düzeltme|sim koordinasyon mesajları|HMAC ve tekrar testleri|
|Sanal hastane|/simulation, /simulasyon|Yeni koordinasyon kabul ekranına link|Mevcut sim tabloları|Gerçek sayaç ayrımı|
|Teknik/kalite/stok|Mevcut playbook ve bakım akışları|Gerçek üretici arayüzü olmadan bağlantı açılmaz|Mevcut akışlar|81 akış doğrulaması|

Her faz ayrı GitHub dalı/PR; ana dal zorlanmaz. Yeni kaynak, eski main üzerine PR ile taşınır. Hastane anahtarı/üretici sözleşmesi/kurum yetkisi bulunmadığından gerçek HBYS kapalı kalır. Yeni bulut kabulü yalnız açık SIM verisini işler. Eski verilerin Türkiye çekirdeğine geçişi henüz tamamlanmış sayılmaz.
