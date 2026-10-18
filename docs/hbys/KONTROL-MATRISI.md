# Veri ve kabul kontrol matrisi

Bu bir hukuki uygunluk veya KTS sertifika belgesi değildir. Sentetik prototipte hasta verisi yoktur. Gerçek kullanımda hastane veri sorumlusu, hizmet sağlayıcı sözleşme kapsamına göre veri işleyen olabilir; roller kurum sözleşmesiyle doğrulanmalıdır. Sağlık verisi, takma adla bile kişiyle ilişkilendirilebiliyorsa anonim değildir.

|Modül|Amaç/veri|Erişim|Saklama/aktarım|Yazılım kontrolü|Gerçek kullanım engeli|
|---|---|---|---|---|---|
|Yatak/temizlik|Yer/varlık, durum, görev|Yetkili birim, operasyon yöneticisi|SIM D1; gerçek veri Türkiye çekirdeği|Kurum kapsamı, sürüm, hazır kontrolü|Kurum dayanağı ve saklama politikası|
|Transport/taburcu|Karar kaynağı/zamanı, operasyon adımları|ULS/TBR ve yetkili klinisyen; destek yalnız işi|Hasta referansları gerçek kullanımda TR|Çift doğrulama beyanı, teslim, ayrı ayrılış|HBYS üretici sözleşmesi ve hasta güvenliği prosedürü|
|Teknik cihaz|Varlık/bakım bilgisi|BMD/TKH|Kurum bakım politikasına göre|Bakım kapanış kontrolü|Üretici talimatı; kalibrasyon belgesi üretmez|
|Vardiya|Üyelik, görev sahipliği|Birim sorumlusu ve çalışan|Personel politikasıyla süre belirlenir|Birim/etkinlik/vardiya doğrulama|İK yetkisi ve çalışma uygunluğu|
|Hasta iletişimi|İletişim ref ve hizmet bildirimi|Çağrı görevlisi|İletişim/kimlik çözümü TR|Bağlı değilse teslim yok|Hizmet, ticari izin ve KVKK sebebi ayrı|
|Yönetim|Toplamlar, görev gecikmesi|Birim yöneticisi kapsamı|Anonim toplu veri dışında buluta çıkarılmaz|Kaynak ve güncellik gösterimi|Anonimlik ve toplulaştırma değerlendirmesi|
|Köprü/log/yedek|Mesaj ref, sonuç, hata kodu|Teknik yönetici, kapsamlı denetim|Ham sağlık kaydı buluta/loga yazılmaz|İzinli alanlar; SIM kontrolü; imza|CDN, hata izleme, destek erişimi ve yedekler dahil kurum veri akışı|

## Resmî kaynak doğrulaması (19.10.2026)
- KVKK m.6 değişikliklerinin temel tarihi 2024'tür; 2025/2026 metni diye eski işleme koşulları kullanılmaz: https://www.kvkk.gov.tr/Icerik/8184/Ozel-Nitelikli-Kisisel-Verilerin-Islenmesine-Iliskin-Rehber
- m.9 yeni rejimi ve 10.07.2024 standart sözleşmeleri: https://www.kvkk.gov.tr/Icerik/7998/Standart-Sozlesme-Metinlerinin-Ingilizce-Cevirisine-Iliskin-Duyuru ; güncel bildirim uyarıları: https://www.kvkk.gov.tr/Icerik/8170/Yurt-Disina-Kisisel-Veri-Aktariminda-Kullanilacak-Standart-Sozlesmelerde-Dikkat-Edilmesi-Gereken-Hususlara-Iliskin-Kamuoyu-Duyurusu
- SBYS/KTS 13.08.2026 değişiklik duyurusu: https://kayittescil.saglik.gov.tr/TR-119564/13082026-saglik-bilgi-yonetim-sistemleri-hakkinda-yonetmelikte-degisiklik-yapilmasina-dair-yonetmelik-hk.html . Ürünün tescil kategorisi/yetki kapsamı henüz doğrulanmadı.
- Kişisel sağlık verisi 03.12.2025/33096 değişikliği için Resmî Gazete erişimi zaman aşımına uğradı; konsolide resmî metin kontrolü AÇIK kabul maddesidir. 2019 metni tek başına yeterli sayılmadı.
- 12.11.2025 sağlık tanıtım düzenlemesi resmî il müdürlüğü metni: https://antalyaism.saglik.gov.tr/TR-366500/saglik-hizmetlerinde-tanitim-ve-bilgilendirme--faaliyetleri-hakkinda-yonetmelik.html . Hizmet bildirimi ticari tanıtım izni sayılmaz.

Açık: kurumsal hukuki sebep, sözleşmeler, saklama ve imha süreleri, gerçek TR sunucu/DB, RLS/bağlantı havuzu yük testi, SBYS kapsam kararı. Bunlar tamamlanmadan gerçek verili entegrasyon açılmaz.

## Yaklaşım uyarlaması (rakip kopyası değildir)
|İşlev|Operasyon sorunu|Türkiye birimi|Veri|Dayanak/yetki|Teknik/kabul|
|---|---|---|---|---|---|
|Tek koordinasyon|Sahipsiz iş|Operasyon merkezi|Görev|Kurum yetki matrisi|Sorumlu ve sonraki adım|
|Ortak taburcu listesi|Ayrılış karışıklığı|TBR/YTK/CTM|Karar kaynağı, durum|Yetkili karar|Taburcu tek başına hazır yapmaz|
|Çift taraflı teslim|Yanlış hedef|ULS ve alıcı birim|Teslim beyanı|Hasta güvenliği prosedürü|Hedef+iki doğrulama beyanı|
|Fiziksel/kullanılabilir yatak|Sahte kapasite|YTK/CTM/TKH|Yatak durumu|Yetki/sözleşme|Personel ve teknik engel hazır sayılmaz|
|Vardiya sahipliği|Devirde kayıp|Birim sorumlusu|Görev/personel|İK politikası|Devralana kadar sahip korunur|

Yabancı kurum adı, klinik karar kuralı, finansman modeli veya ekran metni kopyalanmadı; belirli rakip ürüne ilişkin doğrulanmamış sonuç üretilmedi.


19.10.2026 Faz 2 güncellemesi: v54 core/ birleştirildi; 388 uygulama ve 33 gömülü PostgreSQL testi geçti. Kaynak kasası/rotasyon/kalıcı nonce güvenliği testlerle güçlendirildi. Bu sonuç gerçek Türkiye çekirdeği kurulumu veya canlı hastane bağlantısı değildir. Ayrıntılı açık maddeler FAZ-2-V54-KABUL.md içindedir.
