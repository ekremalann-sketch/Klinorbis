# Klinorbis hastane işleyişi

Hasta ekranı mobilde aktif başvuruyu, sıradaki adımı, birimi ve zamanı gösterir. Geçmiş başvurular ve yayımlanmış belgeler ayrı sekmelerdir. Hastane kimliği, HBYS hasta kimliğiyle eşlenir. Her okuma hastanın kendi başvurusuyla sınırlanır. Veli, vasi ve vekil erişiminde kayıtlı kapsam ve sona erme tarihi aranır.

| Başvuru aşaması | Hastanın gördüğü | İş sahibi |
|---|---|---|
| Randevu veya doğrudan başvuru | Saat ve kampüs | Randevu ve kayıt |
| Kabul ve bekleme | Kayıt durumu ve yönlendirme | Kayıt, acil veya poliklinik |
| Değerlendirme | Bekliyor, çağrıldı, işlemde | Hemşire ve hekim |
| İstem ve sonuç | Numune ve görüntüleme durumu, yayımlanan sonuç | Laboratuvar, radyoloji, klinik |
| Gözlem, yatış veya girişim | Yerleşim ve operasyonel bilgilendirme | Servis, ameliyathane, yoğun bakım |
| Taburcu veya sevk | Özet, kontrol randevusu ve sevk durumu | Klinik, yatak yönetimi, hasta işleri |

Personel arayüzünde birim dizini, rol bazlı iş kuyruğu ve devir geçmişi bulunur. Dizin klinik birimlerle birlikte eczane, sterilizasyon, enfeksiyon kontrolü, temizlik, taşıma, biyomedikal, teknik bakım, güvenlik, santral, finans ve kaliteyi kapsar. Birim görünürlüğü hasta dosyasına erişimden ayrı yetkidir. Acil klinik önceliği sağlık personeli belirler.

Devir kayıtları kaynak birim, hedef, gerekçe ve sürüm taşır. Kabul hedef kuyruğuna geçirir. Ret gerekçesiyle kaynak kuyruğuna döner. Süre aşımı vardiya sorumlusuna gider. Karar, durum ve olay tek veritabanı işlemiyle yazılır. HBYS, PBX ve n8n aktarımlarında gönderim ve hedef sistemin teyidi ayrı zaman damgaları taşır. Başarısızlar yeniden deneme veya elle müdahale kuyruğuna düşer.

Sağlık verisinde işleme şartı, en az ayrıcalık, saklama süresi, acil erişim, denetim kaydı ve yurt dışı aktarımı hastane bazında belgelenir. Takma adla izlenen ve kişiye bağlanabilen kayıtlar da bu kapsamdadır. Bildirimde sağlık verisi taşınmaz.

Kabul testleri rutin başvuru, acil, sevk reddi, vardiya devri, entegrasyon kesintisi, tekrarlanan olay, sonuç yayımlama ve yalnız kendi başvurusunu görmeyi kapsar.

- [NHS App hastane randevuları](https://digital.nhs.uk/services/nhs-app/nhs-app-features/hospital-referrals-and-appointments-in-the-nhs-app)
- [KVKK özel nitelikli veri rehberi](https://www.kvkk.gov.tr/SharedFolderServer/CMSFiles/ca752cda-c3df-4645-8d5e-e2a507e63200.pdf)
