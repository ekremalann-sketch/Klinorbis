# KLINORBIS ürün karşılaştırma matrisi

Bu matris, prototipte görünür bir özelliğin yalnız arayüz değil; sunucu işlemi,
kalıcı kayıt, yetki, hata durumu ve denetim iziyle birlikte ele alınması için
kullanılan resmî ürün ve standart kaynaklarını kaydeder.

| # | Kaynak | İncelenen desen | KLINORBIS karşılığı |
|---:|---|---|---|
| 1 | [Epic Hospital Patient Flow](https://www.epic.com/software/hospital-patient-flow/) | Kapasite komuta merkezi, yatak ve hasta akışı | Kapasite ve Transfer ekranı; YTK, TRF, TBR, YOG, AML, ULS ve CTM masaları |
| 2 | [Oracle Health Clinical Operations](https://www.oracle.com/health/clinical-operations/) | Transfer, taburculuk, transport ve çevre hizmetleri otomasyonu | Birim görevleri, aktarım geçmişi ve SLA görünümü |
| 3 | [Microsoft for Healthcare](https://learn.microsoft.com/en-us/industry/healthcare/overview) | Hasta iletişimi, bakım ekibi ve operasyonel içgörü ayrımı | Hasta talebi, personel operasyonu ve entegrasyon ekranlarının ayrılması |
| 4 | [ServiceNow Healthcare Operations](https://www.servicenow.com/products/healthcare-life-sciences.html) | Vaka, görev, playbook, ekip devri ve yönlendirme | Talep–görev–birim–onay yaşam döngüsü |
| 5 | [TeleTracking Hospital Command Centre](https://www.teletracking.com/resources/hospital-command-centre-united-kingdom/) | Gerçek zamanlı komuta merkezi ve akış darboğazı | Canlı olay akışı, kapasite görevleri ve SLA riski |
| 6 | [Qventus Automation Platform](https://www.qventus.com/solutions/healthcare-automation-platform/) | Gerçek zamanlı olaylardan eylem üretme | Olay güdümlü worker, birim görevi ve insan kapısı |
| 7 | [LeanTaaS iQueue for Inpatient Flow](https://leantaas.com/products/inpatient-flow/) | Kapasite, talep ve iş gücü hizalama | Kapasite masaları ve gerçek açık görev sayaçları |
| 8 | [NHS App](https://www.nhs.uk/nhs-app/) | Hasta tarafında mesaj, randevu, sonuç ve kişisel işlemler | Hasta işlemlerinin personel operasyon ekranından ayrılması |
| 9 | [Genesys Healthcare](https://www.genesys.com/solutions/healthcare) | Çok kanallı hasta iletişimi ve yönlendirme | Çağrı oturumu, canlı konuşma, birime aktarım ve geri arama görevi |
| 10 | [NiCE CXone Healthcare](https://www.nice.com/industries/healthcare) | Self servis, akıllı yönlendirme, temsilci yardımı ve analiz | Çağrı kuyruğu, sahiplenme, aktarım ve konuşma zaman çizelgesi |
| 11 | [Twilio Flex](https://www.twilio.com/en-us/flex) | Kanallar arası bağlamın korunması ve görev yönlendirme | Görüşme–talep–görev korelasyonu ve santral adaptörü |
| 12 | [Salesforce Health Cloud](https://www.salesforce.com/healthcare/cloud/) | Sağlık iletişim merkezi ve randevu hizmetleri | Ortak iş kutusu, randevu talebi ve görevli görünürlüğü |
| 13 | [Stryker Clinical Communication](https://www.stryker.com/gb/en/portfolios/medical-surgical-equipment/clinical-communication-and-workflow.html) | Kapalı döngü iletişim, alarm önceliği ve doğru kişiye yönlendirme | Hedef rol, birim üyeliği, acil insan devri ve bildirim hedefi |
| 14 | [n8n Queue Mode](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode) | Worker kuyruğu ve ölçeklenebilir self-hosted orkestrasyon | İçe aktarılabilir n8n paketi, imzalı callback, retry ve karantina sözleşmesi |
| 15 | [HL7 FHIR Task](https://hl7.org/fhir/R5/task.html) | İsteklerin yerine getirilmesini görev durumu üzerinden izleme | Kalıcı operational_tasks ve durum geçişleri |
| 16 | [Redox Platform](https://redoxengine.com/platform-overview/) | EHR bağlantısı, normalizasyon ve iş akışı orkestrasyonu | HBYS/FHIR/HL7 adaptör sınırı ve kimliksiz olay sözleşmesi |
| 17 | [InterSystems HealthShare](https://www.intersystems.com/products/healthshare/unified-care-record/) | Birleşik kayıt, gerçek zamanlı entegrasyon ve sıkı erişim kontrolü | HBYS ana kayıt ilkesi, sunucu yetkisi ve birim izolasyonu |
| 18 | [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Web uygulaması güvenlik gereksinimleri ve doğrulama | Kimlik, sunucu yetkisi, girdi doğrulama, güvenlik başlıkları ve audit |
| 19 | [OWASP API Security](https://owasp.org/www-project-api-security/) | Nesne seviyesinde yetki ve API kötüye kullanım savunması | Kayıt bazlı birim kontrolü, hız sınırlama ve güvenlik olay kaydı |
| 20 | [KVKK Kişisel Veri Güvenliği Rehberi](https://kvkk.gov.tr/SharedFolderServer/CMSFiles/7512d0d4-f345-41cb-bc5b-8d5cf125e3a1.pdf) | Teknik ve idari veri güvenliği tedbirleri | Veri minimizasyonu, maskeleme, aktarım sınırı, saklama ilkesi ve denetim izi |

## Ürün kararı

- KLINORBIS, HBYS'nin yerine geçmez; operasyon ve iletişim katmanıdır.
- Personelli kapasite uygunsa sistemler arası talebe operasyonel ön kabul ve
  kaynak rezervasyonu otomatik verilir; kapasite yoksa gerekçeli ret üretilir ve
  uygun alternatif kampüs otomatik aranır.
- Kapasite, taburculuk, sevk, vardiya/devir ve otomasyon raporları zamanlanmış
  görevlerle yenilenir; personel yalnız sunucu üyeliğindeki birim kapsamını görür.
- Gerçek klinik karar, acil yönlendirme, veri aktarımı ve hak doğuran işlemler
  insan onayı olmadan tamamlanmaz.
- Gerçek santral, HBYS veya n8n bağlantısı kurulmamışsa arayüz bunu “bağlı”
  göstermez.
- Canlılık demonstrasyonu yalnız açıkça etiketlenmiş kimliksiz pilot kayıtlarla
  yapılır; bu kayıtlar da D1 üzerinde gerçek görev, konuşma, aktarım ve audit izi
  üretir.
