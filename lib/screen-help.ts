// Ekran içi yardım: her ekranın üstündeki "Bu ekranda ne yapılır?" kutusu ve kullanım kılavuzunun kaynağı.
// Metinler görev odaklıdır: ne işe yarar → adım adım → dikkat. Klinik karar verilmez; klinik adımlar yetkili personeldedir.
export type ScreenHelp = { purpose: string; who: string; steps: string[]; tip?: string };

export const SCREEN_HELP: Record<string, ScreenHelp> = {
  dashboard: {
    purpose: "Hastanenin o anki operasyon durumunu tek bakışta gösterir: açık talepler, onay bekleyenler, kapasite, canlı görüşmeler ve otomasyonun son çalışması.",
    who: "Operasyon yöneticisi, birim sorumluları",
    steps: [
      "Üst şeritteki kutulara tıklayın; her kutu ilgili ekranı açar (ör. Sevk / Transfer → Kapasite ve Transfer).",
      "\"İnsan onayı bekleyen\" sayısı sıfır değilse önce İnsan Onayları ekranına geçin.",
      "Süresi geçen kayıtlar kırmızı görünür; kaydı açıp sorumluyu görün.",
      "Sağ üstteki zil, sizden işlem bekleyen kayıtları listeler; bildirime tıklamak doğrudan kayda götürür.",
    ],
    tip: "Ekran her 5 saniyede kendini tazeler. Sol alttaki \"Sunucu akışı bağlı\" yazısı yeşilse veri canlıdır.",
  },
  inbox: {
    purpose: "Birimlere düşen bütün işler (talep, görüşme, akış adımı, hasta arama görevi) tek kuyrukta.",
    who: "Birim görevlileri, çağrı merkezi",
    steps: [
      "Üstteki filtrelerle \"Açık\", \"Benim üstlendiklerim\", \"Acil / yüksek\" veya \"Tümü\"nü seçin.",
      "Bir satıra tıklayınca ilgili kayıt, görüşme veya akış ekranı açılır.",
      "İşi üstlenmek için kayıtta \"Görevi üstlen\", çalışmaya başlayınca \"İşleme al\" deyin; kim, ne zaman aldı kayda geçer.",
      "Bitirdiğiniz işi kapatın; süre hedefi içinde kapanan işler raporlarda yeşil görünür.",
    ],
    tip: "\"Otomatik planlandı\" görünen akış görevleri zamanı gelince kuyruğa düşer; o zamana kadar işlem gerekmez.",
  },
  flow: {
    purpose: "Bir başvurunun gelişinden kapanışına kadar geçtiği durakları uçtan uca gösterir: başvuru, acil kontrolü, sınıflandırma, işleme alma, onay, bilgilendirme, kapanış.",
    who: "Yöneticiler, yeni başlayan personelin eğitimi",
    steps: [
      "Durakları sırayla okuyun; her durakta işi kimin yaptığı yazar.",
      "Bir kayda ait gerçek ilerlemeyi görmek için o kaydı Hasta Talepleri veya Ortak İş Kutusu'ndan açın.",
    ],
  },
  requests: {
    purpose: "Hastaların web, WhatsApp, SMS veya danışmadan gelen talepleri. Telefon numarası ve TCKN metinden otomatik maskelenir.",
    who: "Hasta iletişim, birim görevlileri",
    steps: [
      "\"Yeni talep\" ile hasta takma adı ve konuyu girin; sistem uygun birimi önerir.",
      "\"Göğsüm ağrıyor\" gibi acil ifadelerde otomasyon durur, kayıt Acil Yönlendirme'ye geçer ve hekim onayı açılır.",
      "Talebi açıp \"Görevi üstlen\", \"İşleme al\", \"Başka birime aktar\" veya \"Çözüldü\" ile ilerletin.",
      "Şikâyet türündeki talepler \"Hasta şikâyeti\" akışını kendiliğinden başlatır.",
    ],
    tip: "Hasta adını değil takma adı (ör. HST-...) yazın; gerçek kimlik HBYS'de kalır.",
  },
  appointments: {
    purpose: "Randevu alma, değiştirme ve iptal talepleri; slot doğrulaması ve süre hedefi.",
    who: "Randevu merkezi",
    steps: [
      "Talebi açın, tercih edilen tarihi ve birimi kontrol edin.",
      "Uygun slotu HBYS/MHRS'de açıp talebi \"Kabul edildi\" yapın.",
      "Bilgilendirme kuyruğunu kontrol edin. Gerçek gönderim mesaj sağlayıcısı bağlantısını gerektirir; randevu kurum takviminde teyit edilir.",
    ],
  },
  access: {
    purpose: "Hekim o gün gelemiyorsa etkilenen randevuları planlar, birim onayından sonra hastaları bilgilendirir.",
    who: "Birim sorumlusu, hekim, çağrı merkezi",
    steps: [
      "\"Hekim yokluğu bildir\" ile hekimi, günü ve nedeni seçin.",
      "Sistem her hasta için öneri çıkarır: klinik öncelikli hasta hekime, izin veren hasta aynı saatte başka hekime, diğerleri ilk uygun güne.",
      "Plan İnsan Onayları'na düşer. Yokluğu bildiren kişi planı onaylayamaz; birimden başka bir yetkili onaylar.",
      "Onaydan sonra mesajlar kuyruğa girer; hastanın EVET / ARA / İPTAL yanıtını görevli buradan da işleyebilir.",
    ],
    tip: "Aynı hekimin aynı saati iki farklı plana önerilemez; çakışma olursa sistem planı yeniden hesaplamanızı ister.",
  },
  playbooks: {
    purpose: "81 hazır operasyon akışı: yatak hazırlığı, cihaz arızası, HBYS kesintisi, şikâyet… Her adım ilgili birimin iş kutusuna görev olarak düşer.",
    who: "Tüm birimler; onay adımlarında birim/operasyon yöneticisi, klinik onaylarda klinisyen",
    steps: [
      "Kütüphaneden akışı seçin, adımları ve birimleri okuyun, \"Akışı başlat\"a basın.",
      "Etkin akışlar sekmesinde sıradaki birim \"Adımı tamamla\" der; görev bir sonraki birime geçer.",
      "Onay adımını akışı başlatan kişi geçemez; başka bir yetkili onaylar.",
      "Olay tetikleyicileri sekmesi hangi sistem olayının hangi akışı kendiliğinden açtığını gösterir.",
      "Darboğaz ve performans sekmesi hangi birimin işi beklettiğini ve hedef süreye uyumu gösterir.",
      "İş yükü sekmesi kişi başı açık işi ve \"işi kime verelim\" önerisini gösterir; Haftalık rapor zaman ve para kaybını özetler (yöneticiler).",
      "Son adımda bağlı akışlar için soru çıkar (ör. \"Uygun yatak bulunamadı\"); işaretlenmeyen akış açılmaz.",
      "Hedef süresi geçen iş önce birim sorumlusuna, 30 dk sonra operasyon yöneticisine bildirilir.",
    ],
    tip: "Hasta alanına yalnız kısa kod yazın (ör. P-1042); ad-soyad kabul edilmez. Notlarda telefon ve TCKN otomatik maskelenir.",
  },
  simulation: {
    purpose: "Pilot öncesi deneme: kurgusal bir hastanede aynı olayları önce telefon ve kâğıtla, sonra Klinorbis ile oynatır; harcanan personel zamanını ve TL karşılığını karşılaştırır.",
    who: "Operasyon yöneticisi",
    steps: [
      "Yatak sayısını, gün sayısını ve personel saatlik maliyetini kendi hastanenize göre girin.",
      "Varsayımları (görüşme süresi, ulaşamama oranı…) gerekirse değiştirin; aynı tohum her zaman aynı sonucu verir.",
      "\"Simülasyonu çalıştır\" deyin; sonuç kaydedilir, yazdırılabilir.",
      "\"Kayıtları temizle\" tüm simülasyon kayıtlarını siler; canlı verilere dokunmaz.",
    ],
    tip: "Sonuçlar kurgusaldır ve varsayımlara dayanır; gerçek kazanç ancak pilotta ölçülür. Gerçek veri kullanılmaz, dışarı veri gönderilmez.",
  },
  calls: {
    purpose: "Canlı ve geçmiş görüşmeler: konuşma dökümü, birim yönlendirmesi ve insan devri.",
    who: "Çağrı merkezi, klinik triyaj rolü",
    steps: [
      "Soldaki listeden görüşmeyi seçin; sağda konuşma ve yönlendirme bilgisi açılır. Liste yerinde kalır.",
      "Acil sinyal varsa görüşme kırmızı görünür; insan devri onayı gerekir.",
      "\"Gelen çağrı kaydı\" ile telefonla gelen başvuruyu kaydedin.",
    ],
    tip: "\"EĞİTİM\" etiketli görüşmeler gerçek hasta değildir.",
  },
  approvals: {
    purpose: "İnsan kararı gereken işler: klinik devir, hekim yokluğu planı, toplu değişiklik.",
    who: "Birim sorumlusu, hekim, operasyon yöneticisi",
    steps: [
      "Bekleyen onayı açın, \"Kaydı aç\" ile ayrıntıya bakın.",
      "Not yazıp \"Onayla\" veya \"Reddet\" deyin; karar denetim izine yazılır.",
      "Kendi açtığınız talebi onaylayamazsınız; sistem bunu engeller.",
    ],
  },
  automation: {
    purpose: "Otomasyon motorunun canlı durumu: son çalışma, kuyruk, yeniden deneme ve karantina.",
    who: "Operasyon ve bilgi güvenliği yöneticisi",
    steps: [
      "\"Son çalışma\" 3 dakikadan eskiyse zamanlayıcı durmuş olabilir; operasyon yöneticisinin paneli görünürken sistem otomatik döngü dener. Panel kapalıyken düzenli zamanlayıcı gerekir.",
      "Karantinaya düşen iş, deneme sınırında başarısız olmuştur; nedenini okuyup bilgi işleme iletin.",
      "Kural motorunun her kararı \"Karar kaydını aç\" ile gerekçesiyle görülebilir.",
    ],
  },
  capacity: {
    purpose: "Kampüs ve birim bazında yatak/kaynak doluluğu, sevk talepleri ve taburculuk beklentisi.",
    who: "Yatak ve kapasite yönetimi, transfer merkezi",
    steps: [
      "Üstten kampüs seçin; dolu, rezerve, bloke ve temizlikteki kaynaklar görünür.",
      "Sevk talebinde kural motorunun önerisini (kabul, bekleme, alternatif kampüs) okuyun.",
      "Doluluk %95'i geçerse \"Kapasite kırmızı alarm\" akışını başlatın.",
    ],
  },
  integrations: {
    purpose: "HBYS, santral, mesaj sağlayıcısı ve olay uçlarının sağlık durumu.",
    who: "Bilgi işlem",
    steps: [
      "Her bağlantının son başarılı mesajını ve hata sayısını kontrol edin.",
      "İmzasız veya zaman aşımına uğramış istekler Siber Güvenlik ekranına düşer.",
      "n8n akış paketini indirip kurumun zamanlayıcısına yükleyebilirsiniz.",
    ],
  },
  units: {
    purpose: "Her birimin kendi çalışma masası: kuyruğu, görevleri, onayları ve kapasitesi.",
    who: "Birim sorumluları",
    steps: ["Birimi seçin.", "Açık görevleri ve süresi geçenleri görün; satıra tıklayıp kayda gidin.", "Birimin onay bekleyenlerini buradan karara bağlayın."],
  },
  staff: {
    purpose: "Personel, rol ve birim yetkileri; vardiya ve devir.",
    who: "Operasyon yöneticisi",
    steps: [
      "\"Personel ekle\" ile e-posta, rol ve birim(ler)i girin.",
      "Rol, hangi ekranları gördüğünü; birim, hangi kayıtları gördüğünü belirler.",
      "Tek yetkilisi olan birimde onay adımları bekler; her birime en az iki onaycı atayın.",
    ],
  },
  reports: {
    purpose: "Operasyon göstergeleri ve yetkili CSV dışa aktarımı.",
    who: "Yöneticiler",
    steps: ["Raporu seçin.", "\"Yetkili CSV indir\" ile dosyayı alın; dosya yalnız yetkinizdeki birimleri içerir."],
  },
  privacy: { purpose: "KVKK ve etik ilkeler, maskeleme ve saklama kuralları.", who: "KVKK sorumlusu", steps: ["Politika metinlerini inceleyin; değişiklikleri kurumun yetkili birimiyle yönetin.", "Maskeleme örneklerini kontrol edin."] },
  security: { purpose: "Güvenlik olayları, imza hataları, hız sınırı aşımları.", who: "Bilgi güvenliği", steps: ["Kritik olayları inceleyin.", "Tekrar eden kaynakları bilgi işlem ekibine bildirin; engelleme kurum altyapısında yapılır."] },
  audit: { purpose: "Zincirli denetim izi: kim, ne zaman, ne yaptı.", who: "Denetim, kalite", steps: ["Kayıt veya kişi adıyla arayın.", "Zincirli geçmişi inceleyin. Eş zamanlı yazımda zincir çatallanması uyarısı oluşabilir; bu bir uygunluk belgesi değildir."] },
};
