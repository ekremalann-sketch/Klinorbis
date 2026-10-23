# Klinorbis: 50 kontrol için kanıt durumu

23 Ekim 2026. Esas: ayrı bağımlılık PR adayının mevcut kaynakları ve bu oturumda geçen testler. Önceki katalog salt okunur referanstır.

**"Kodda doğrulandı" yalnız aşağıda yazılı dar davranışın doğrulandığını belirtir; tüm riskin kapandığı, sertifikasyon veya gerçek hastanede üretim güvenliği anlamına gelmez.** Dosya incelemesi ve davranış testi kanıtı ayrı açıklanır. Kod bulunması gerçek hesap ayarını kanıtlamaz. Tüm uygulama için saldırı testi yapılmadı.

Durum toplamları: {"kodda doğrulandı (dosya/test)":13,"yalnız belgelendi":24,"doğrulanamadı (hesap/sözleşme gerekiyor)":13}.

| Madde | Kanıt durumu | Dosya/test | Kapsam ve açık kalan doğrulama |
|---|---|---|---|
| LLM01 — Prompt Injection | yalnız belgelendi | Önceki kontrol katalogu / LLM01 | Talimat ayrımı açıklamaları var; kötü niyetli belgeyle model/araç saldırı testi bulunmadı. |
| LLM02 — Sensitive Information Disclosure | kodda doğrulandı (dosya/test) | tests/ai-monitor.test.mjs:21 | Yakalanan sağlayıcı isteği yalnız sayısal toplamlar içerir; sentetik kişi, takma ad, referans ve e-posta dışlanır. Tüm entegrasyonlar için genel kanıt sayılmaz. |
| LLM03 — AI Supply Chain Compromise | yalnız belgelendi | Önceki kontrol katalogu / LLM03 | Sabit sürümler/kilit dosyası var; model veya eklenti hash değişiminde otomatik ret testi yok. |
| LLM04 — Data and Model Poisoning | yalnız belgelendi | Önceki kontrol katalogu / LLM04 | Veri/model eğitim hattına yönelik zehirleme testi bulunmadı. Eğitim özelliği bulunduğu iddia edilmiyor. |
| LLM05 — Improper Output Handling | yalnız belgelendi | Önceki kontrol katalogu / LLM05 | Girdi bağlama ve metin gösterimi var; zararlı model SQL/script çıktısı için özel uçtan uca test yok. |
| LLM06 — Excessive Agency | kodda doğrulandı (dosya/test) | lib/ai-monitor.ts:70 | AI yanıtı yalnız öneri kaydına yazılır; araç yürütme arayüzü yok. Genel amaçlı ajan veya ek araçların güvenliği kanıtlanmadı. |
| LLM07 — System Prompt Leakage | yalnız belgelendi | Önceki kontrol katalogu / LLM07 | Sistem istemi sızsa da yetki korunmasına özel saldırı testi yok. |
| LLM08 — Vector and Embedding Weaknesses | yalnız belgelendi | Önceki kontrol katalogu / LLM08 | Vektör/embedding tenant saldırı testi yok; uygulanmış bir vektör özelliğinin güvenliği iddia edilmiyor. |
| LLM09 — Misinformation / Hallucination | kodda doğrulandı (dosya/test) | lib/ai-monitor.ts:108; tests/behavior-playbooks.test.mjs:96 | AI önerisi otomatik klinik karar yürütmez; klinik onay adımı birim klinisyeniyle sınırlı. Modelin olgusal doğruluğu ölçülmedi. |
| LLM10 — Unbounded Consumption / Denial of Wallet | yalnız belgelendi | Önceki kontrol katalogu / LLM10 | İstek/yanıt sınırları ve zaman aşımı kodu var; toplam maliyet/eşzamanlılık kotası stres testi eksik. |
| ASI01 — Agent Goal Hijack | yalnız belgelendi | Önceki kontrol katalogu / ASI01 | Harici belgeyle hedef kaçırma senaryosu için özel test yok. |
| ASI02 — Tool Misuse and Exploitation | yalnız belgelendi | Önceki kontrol katalogu / ASI02 | Dosya/URL araç kötüye kullanımını bütün hedeflerde kapsayan test yok. |
| ASI03 — Identity and Privilege Abuse | kodda doğrulandı (dosya/test) | tests/behavior-flow.test.mjs:54; tests/behavior-staff-shifts.test.mjs:56 | Birim dışı ve gözetim rolü işlem yapamaz; rol/birim değişikliği eski yetkiyi kaldırır. |
| ASI04 — Agentic Supply Chain Vulnerabilities | yalnız belgelendi | Önceki kontrol katalogu / ASI04 | Araç tanımı değişikliğinde yetki genişlememe testi yok. |
| ASI05 — Unexpected Code Execution | yalnız belgelendi | Önceki kontrol katalogu / ASI05 | Belge kaynaklı kod çalıştırma saldırısı için özel test yok. |
| ASI06 — Memory and Context Poisoning | yalnız belgelendi | Önceki kontrol katalogu / ASI06 | Risk katalogda tanımlı; özel uygulanmış kontrol/negatif test kanıtı bulunmadı. |
| ASI07 — Insecure Inter-Agent Communication | yalnız belgelendi | Önceki kontrol katalogu / ASI07 | Ajanlar arası sahte gönderici/yanlış alıcı testi yok. |
| ASI08 — Cascading Failures | kodda doğrulandı (dosya/test) | tests/behavior-approvals-webhook.test.mjs:128; tests/behavior-patient-access.test.mjs:228 | Eşzamanlı olay tek kez işlenir; onay zincirinde hata olursa işlem geri alınır. Dış sistem kesintilerinin tamamı sınanmadı. |
| ASI09 — Human-Agent Trust Exploitation | yalnız belgelendi | Önceki kontrol katalogu / ASI09 | İnsan onay özetinin bütün gerçek işlem parametrelerine kriptografik/işlemsel bağlanması için tam test yok. |
| ASI10 — Rogue Agents | kodda doğrulandı (dosya/test) | tests/production-automation.test.mjs:11; tests/virtual-hospital-store.test.mjs:29 | Yetkisiz durdurma reddedilir; kalıcı acil durdurma iş döngüsü ve simülasyonu durdurur. Harici n8n işçisinin fiilen durması ayrıca doğrulanmalı. |
| DATA01 — SQL / NoSQL Injection | yalnız belgelendi | Önceki kontrol katalogu / DATA01 | Parametreli sorgular kullanılıyor; bu incelemede bütün veri erişim katmanını kapsayan enjeksiyon saldırı testi yapılmadı. |
| DATA02 — BOLA / IDOR / Broken Tenant Isolation | yalnız belgelendi | Önceki kontrol katalogu / DATA02 | Risk katalogda tanımlı; özel uygulanmış kontrol/negatif test kanıtı bulunmadı. |
| DATA03 — RLS Bypass | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA03 | Gerçek PostgreSQL sahibi/BYPASSRLS rolleri, bağlantı havuzu ve tenant ayarları. Yerel SQLite testleri RLS kanıtı değildir. |
| DATA04 — Public Database / Bucket Exposure | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA04 | Cloudflare DB/bucket erişim politikaları, kamuya açıklık ve gerçek ağ erişim testi. |
| DATA05 — Exposed Snapshots and Backups | yalnız belgelendi | Önceki kontrol katalogu / DATA05 | Yedekleme yardımcıları mevcut; anonim yedek indirme uçları ve tüm depolar için penetrasyon kanıtı yok. |
| DATA06 — Overprivileged IAM / Service Accounts | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA06 | GitHub/Cloudflare/Sites/çekirdek IAM yetki kapsamları ve erişim envanteri. |
| DATA07 — Token Leakage and OAuth Consent Abuse | kodda doğrulandı (dosya/test) | tests/oversight-security.test.mjs:5; tests/behavior-approvals-webhook.test.mjs:115 | Pasifleştirilmiş personel ve bozuk/eski imza reddedilir. Gerçek OAuth sağlayıcı token iptali hesap düzeyinde ayrıca test edilmeli. |
| DATA08 — SSRF / Metadata Credential Theft | yalnız belgelendi | Önceki kontrol katalogu / DATA08 | HTTPS ve bazı redirect kısıtları var; özel IP/metadata/DNS rebinding engelinin kapsamlı testi yok. |
| DATA09 — Bulk Exfiltration / Excessive Data Exposure | kodda doğrulandı (dosya/test) | tests/behavior-flow.test.mjs:115; tests/modern-security.test.mjs:16 | Ağ geneli raporu birim kullanıcısına kapalı; üretim raporu eğitim verisini içermez. |
| DATA10 — Encryption / Key Management Failure | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA10 | Üretim TLS/KMS anahtar sahipliği, bölge ve rotasyon kaydı. Şifreli yedek yerel testi bu hesabı kanıtlamaz. |
| DATA11 — Logs, Telemetry and Prompt Trace Leakage | kodda doğrulandı (dosya/test) | tests/modern-security.test.mjs:5; tests/oversight-security.test.mjs:6 | Güvenlik loglarında iletişim/kimlik maskesi; gözetim rolü serbest görüşme metnini alamaz. Harici izleme deposu doğrulanmadı. |
| DATA12 — Training Opt-in / Secondary Use Drift | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA12 | Kullanılan AI sağlayıcısının hesapta eğitim tercihi ve kurum sözleşmesi. |
| DATA13 — Retention / Zero-Retention Misconfiguration | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA13 | Gerçek sağlayıcı endpoint/hesap saklama süresi, ZDR uygunluğu ve sözleşmesi. |
| DATA14 — Unlawful Acquisition / Data Provenance Gap | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA14 | Kurum veri kaynağı, lisans, kullanım amacı ve yetkilendirme belgeleri. |
| DATA15 — Re-identification / Linkage Attack | yalnız belgelendi | Önceki kontrol katalogu / DATA15 | Toplam/pseudonim veri tek başına anonimlik kanıtı değil; küçük grup yeniden tanımlama testi yok. |
| DATA16 — Model Inversion / Data Reconstruction | yalnız belgelendi | Önceki kontrol katalogu / DATA16 | Model inversion değerlendirmesi uygulanmadı; özel model eğitildiği iddia edilmiyor. |
| DATA17 — Membership Inference | yalnız belgelendi | Önceki kontrol katalogu / DATA17 | Membership inference değerlendirmesi uygulanmadı. |
| DATA18 — Embedding Inversion / Vector Leakage | yalnız belgelendi | Önceki kontrol katalogu / DATA18 | Embedding inversion değerlendirmesi uygulanmadı. |
| DATA19 — Cross-Border / Subprocessor Drift | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA19 | Veri işleme bölgesi, alt işleyen listesi, aktarım mekanizması ve sözleşmeler. |
| DATA20 — Migration / CDC / ETL Exposure | kodda doğrulandı (dosya/test) | tests/behavior-approvals-webhook.test.mjs:93; tests/behavior-patient-access.test.mjs:178 | İmzalı olaylar tekrar işlenmez; takvim aktarımı aktif planı ezmez. Gerçek HBYS/CDC uçtan uca bağlantısı kanıtlanmadı. |
| DATA21 — Deletion Gaps in Derived Data | yalnız belgelendi | Önceki kontrol katalogu / DATA21 | Saklama/başvuru akışı var; türetilmiş veri, cache ve bütün yedeklerden silme kanıtı yok. |
| DATA22 — Production Data in Test / Demo | kodda doğrulandı (dosya/test) | tests/production-automation.test.mjs:6; tests/virtual-hospital-store.test.mjs:13 | Eğitim/simülasyon gerçek iş tablolarından ayrılır, üretim döngüsü eğitim kaydı üretmez. Gerçek veritabanı içerik denetimi yapılmadı. |
| DATA23 — Ransomware / Destructive Agent Action | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA23 | Gerçek yedek deposunun değiştirilemezliği ve ayrı hesapta geri yükleme tatbikatı. Sentetik yerel geri dönüş testi bunun yerine geçmez. |
| DATA24 — TOCTOU / Duplicate Financial or Task Action | kodda doğrulandı (dosya/test) | tests/behavior-playbooks.test.mjs:112; tests/behavior-approvals-webhook.test.mjs:60 | Eşzamanlı iki kararın yalnız biri uygulanır, yeni görev bir kez açılır. |
| DATA25 — Insider / Vendor Support Abuse | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA25 | Destek personelinin gerçek IAM yetkileri, süreli erişim ve kurum onay kayıtları. |
| DATA26 — Shared Responsibility Gap | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA26 | Hastane/kurucu/barındırıcı/entegratör için imzalı sorumluluk ve olay müdahale sahipleri. |
| DATA27 — Unverified Certifications / Banking Claims | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA27 | Geçerli sertifika kapsamları, sözleşme ve hukuki uygulanabilirlik. Uygulama testi sertifikasyon kanıtı değildir. |
| DATA28 — Uncontrolled Agent Egress | kodda doğrulandı (dosya/test) | tests/ai-monitor.test.mjs:21; tests/security-hardening.test.mjs:9 | AI çıkışı sabit hedefte sayısal veri; n8n yasak sağlık alanı kontrolü kodda. Tüm ağ çıkışlarını kapsayan egress politikası kanıtlanmadı. |
| DATA29 — Model / Provider Change Drift | doğrulanamadı (hesap/sözleşme gerekiyor) | Önceki kontrol katalogu / DATA29 | Üretimde sağlayıcı/model değişiklik onay süreci ve hesap değişiklik kayıtları. |
| DATA30 — Unverified Automated Security Findings | yalnız belgelendi | Önceki kontrol katalogu / DATA30 | #25/#19 güvenlik PR raporları mevcut fakat ana dala birleşmedi. Tüm tarama hatalarının başarıdan ayrıldığına dair bu adaylarda bağımsız davranış testi yok. |

## Hesap / sözleşme gerekenler

- **DATA03 RLS Bypass:** Gerçek PostgreSQL sahibi/BYPASSRLS rolleri, bağlantı havuzu ve tenant ayarları. Yerel SQLite testleri RLS kanıtı değildir.
- **DATA04 Public Database / Bucket Exposure:** Cloudflare DB/bucket erişim politikaları, kamuya açıklık ve gerçek ağ erişim testi.
- **DATA06 Overprivileged IAM / Service Accounts:** GitHub/Cloudflare/Sites/çekirdek IAM yetki kapsamları ve erişim envanteri.
- **DATA10 Encryption / Key Management Failure:** Üretim TLS/KMS anahtar sahipliği, bölge ve rotasyon kaydı. Şifreli yedek yerel testi bu hesabı kanıtlamaz.
- **DATA12 Training Opt-in / Secondary Use Drift:** Kullanılan AI sağlayıcısının hesapta eğitim tercihi ve kurum sözleşmesi.
- **DATA13 Retention / Zero-Retention Misconfiguration:** Gerçek sağlayıcı endpoint/hesap saklama süresi, ZDR uygunluğu ve sözleşmesi.
- **DATA14 Unlawful Acquisition / Data Provenance Gap:** Kurum veri kaynağı, lisans, kullanım amacı ve yetkilendirme belgeleri.
- **DATA19 Cross-Border / Subprocessor Drift:** Veri işleme bölgesi, alt işleyen listesi, aktarım mekanizması ve sözleşmeler.
- **DATA23 Ransomware / Destructive Agent Action:** Gerçek yedek deposunun değiştirilemezliği ve ayrı hesapta geri yükleme tatbikatı. Sentetik yerel geri dönüş testi bunun yerine geçmez.
- **DATA25 Insider / Vendor Support Abuse:** Destek personelinin gerçek IAM yetkileri, süreli erişim ve kurum onay kayıtları.
- **DATA26 Shared Responsibility Gap:** Hastane/kurucu/barındırıcı/entegratör için imzalı sorumluluk ve olay müdahale sahipleri.
- **DATA27 Unverified Certifications / Banking Claims:** Geçerli sertifika kapsamları, sözleşme ve hukuki uygulanabilirlik. Uygulama testi sertifikasyon kanıtı değildir.
- **DATA29 Model / Provider Change Drift:** Üretimde sağlayıcı/model değişiklik onay süreci ve hesap değişiklik kayıtları.

Ek not: Gerçek OAuth, HBYS/n8n/SMS sağlayıcısı ve destek erişimi kod testinden bağımsız kurum hesabı doğrulaması gerektirir. Kaynakta bulunmayan model/vektör özellikleri güvenli kabul edilmedi; yalnız belgelenmiş risk olarak bırakıldı.
