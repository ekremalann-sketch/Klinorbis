# Sanal Hastane Simülasyonu

SİMÜLASYON · Kurgusal hastane · Rakamlar varsayımlara dayanır, gerçek pilot sonucu değildir.

Giriş: `/merkez` üst çubuğundaki **Sanal Hastane** veya `/simulasyon`.
Yalnız operasyon yöneticisi görüntüleyebilir, başlatabilir, durdurabilir ve temizleyebilir.

## Kullanım

1. Senaryo tohumunu, 24/72 saat süresini ve hızını seçin. Varsayılan 72 saat ve 60 kat hızdır.
2. **Sanal pilotu başlat**. Hekim yokluğu için 30 sentetik randevu planlanır.
3. Kurgusal gün kendiliğinden ilerler. İsterseniz **2 sanal saat ilerlet** ile hızlandırın.
4. Akışları, iki kampüsü, 23 birimi, personeli, yatakları, bildirimleri ve işlem izini inceleyin.
5. Etiketli JSON raporunu indirin. **Durdur** saati dondurur. Yeni senaryo için **Simülasyonu temizle** gerekir.

## Ayrım ve hesap yöntemi

Tüm kurgusal durum `sim_hospital_state`, kontrol izi `sim_hospital_audit` tablolarındadır.
Canlı hasta, talep, görev, onay, randevu, kapasite ve rapor tablolarına yazılmaz.
Temizleme yalnız simülasyon durumunu kaldırır; kontrol izi saklanır.
600 olay ve 72 saat sınırı kalıcı kayıt büyümesini sınırlar.

Mevcut `recommendUnit`, `triggerFor`, `playbookOf` ve `planAbsence` kuralları yeniden kullanılır.
İnsan onayı kurgusal, başlatandan farklı personelle canlandırılır; gerçek klinik onay verilmez.
Gecikme iki eşikte bildirilir. Hasta dışı işlerde hasta takma adı istenmez.
Koşulsuz bağlı akışlar simülasyonda engellenir; bu, canlı akış motorunun değiştirildiği anlamına gelmez.

Yalnız tamamlanan olaylar karşılaştırılır. Her olayın telefon/işlem baz çizgisi model varsayımıdır.
Süre = telefon sayısı × telefon dakika varsayımı + işlem sayısı × işlem saniye varsayımı / 60.
Negatif kazanım saklanmaz. Açık olaylar ve kalan işler ayrıca gösterilir.
Entegrasyonlu senaryo gerçek SMS/HBYS bağlantısı kurmaz; sentetik sonuçları canlandırır.

## Otomatik çalışma

Mevcut otomasyon ajanı ve Worker scheduled işleyicisi simülasyon turunu da çağırır.
Ekran açıkken dört saniyede bir tur istenir; eşzamanlı turlar sürüm kontrolüyle tek kez kaydedilir.
Ekran kapalıyken çalışma için üretim zamanlayıcısının gerçekten tetiklenmesi gerekir.
Yalnız cron tanımı bulunması çalışmanın kanıtı değildir; son ilerleme ve sunucu kayıtları doğrulanmalıdır.
Gecikmiş turlar zamanı en fazla 240 sanal dakikalık parçalarla işler; kayıp süre sonraki turlara kalır.
Mevcut acil durdurma anahtarı simülasyonu da durdurur; kaldırılması simülasyonu kendiliğinden yeniden başlatmaz.

## Gerçek hastaneye geçişte kalan bağlantılar

SMS/WhatsApp sağlayıcısı ve teslimat teyidi, HBYS yazma API'si, canlı yatak akışı,
kurumsal SSO ve hastaneler arası kiracı ayrımı bu simülasyonla kurulmuş sayılmaz.
Simülasyon bunların etkisini gösterir; gerçek hasta verisi veya dış bağlantı kullanmaz.
