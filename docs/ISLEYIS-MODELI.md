# Klinorbis işleyiş modeli

## Sistem neyi hedefliyor?

Hasta hangi kanaldan ulaşırsa ulaşsın başvurusunun kaybolmaması, doğru birime gitmesi, süresinde karşılanması ve sonucun hastaya anlaşılır biçimde bildirilmesi. Klinorbis tıbbi karar vermez. Acil olasılık sinyalinde otomasyonu durdurur ve kaydı sağlık personeline devreder.

## Uçtan uca akış

| Adım | Ne olur | Kim | Kod |
|---|---|---|---|
| 1. Başvuru | Telefon (santral webhook'u), WhatsApp/SMS (mesaj sağlayıcısı), web formu, e-posta veya danışma. Kanal ne olursa olsun tek kayıt açılır. Telefon numarası, TCKN, kart ve IBAN metinden maskelenir. | Çağrı merkezi / hasta iletişim | `app/api/tickets`, `app/api/integrations/calls`, `lib/privacy.ts` |
| 2. Acil kontrolü | "Göğüs ağrısı", "nefes alamıyorum" gibi ifadelerde kayıt Acil Yönlendirme'ye gider ve klinik onay açılır. Hastaya mesaj gönderilmez; görevli 112'yi veya acil servisi söyler. | Sistem + klinik rol | `urgencySignal` |
| 3. Sınıflandırma | Randevu, değişiklik, iptal, sonuç, fatura, şikâyet, klinik soru veya genel bilgi. Her tür bir birime ve süre hedefine bağlanır. | Sistem | `lib/patient-access.ts → classifyRequest` |
| 4. Alındı bilgisi | Hasta bir kanala izin verdiyse "Başvurunuz alındı, referans …" mesajı kuyruğa alınır. | Sistem | `tickets POST notifyChannel` |
| 5. İşleme alma | Birim görevlisi kaydı "kabul et" ile üstlenir. Süre hedefi aşılırsa kayıt kırmızıya döner. | Birim görevlisi | `tickets PATCH accept/start/resolve/transfer` |
| 6. Onay | Klinik devir, hekim yokluğunda toplu randevu değişikliği ve klinik öncelikli hastanın ertelenmesi onaya gider. Onayı, talebi açandan farklı bir yetkili verir. | Birim sorumlusu / hekim | `app/api/approvals` |
| 7. Bilgilendirme | Mesaj, hastanın izin verdiği kanaldan gönderilir; tanı ve yokluk nedeni yazılmaz. 21:00–09:00 arasında mesaj gönderilmez. Randevuya 24 saatten az kaldıysa hasta telefonla aranır. | Sistem + çağrı merkezi | `queueNotification`, `dispatchNotifications` |
| 8. Yanıt ve kapanış | Hasta EVET, ARA veya İPTAL yazar ya da görevli telefonda yanıtı kaydeder. Randevu taşınır veya geri arama görevi açılır. Üç denemede ulaşılamayan hasta takibe düşer. | Görevli / mesaj sağlayıcısı | `recordResponse`, `app/api/integrations/messages` |

## O gün doktor yoksa

1. **Bildirim:** Birim sorumlusu, hekimin kendisi veya operasyon yöneticisi yokluğu gün ve nedenle kaydeder. Neden yalnızca iç kayıtta tutulur. Çağrı görevlisi yokluk bildiremez.
2. **Plan:** O günkü randevular bulunur ve her biri için tek bir öneri üretilir:
   - Klinik öncelikli hasta → **hekim değerlendirmesi.** Otomatik öneri yapılmaz; birim hekimi karar verir.
   - Hasta başka hekime izin verdiyse → **aynı gün, aynı saat, aynı branştan boş kapasitesi olan hekim.**
   - Değilse → **aynı hekimin 14 gün içindeki ilk uygun iş günü** (hafta sonu ve hekimin diğer yokluk günleri atlanır).
   - O da yoksa → **başka kampüs, aynı branş.**
   - Hiçbiri yoksa → **çağrı merkezi arar** ve hastayla birlikte planlar.
   Aynı plan içinde iki hastaya aynı boşluk önerilmez; kapasite plan sırasında ayrılır. Bir hekime, o saatte başka randevusu veya başka bir planın önerisi varsa aynı saat önerilmez. Eşzamanlı iki plan aynı saati yazmaya çalışırsa veritabanındaki tekil indeks (`appointment_changes_slot_once`) ikincisini reddeder ve plan yeniden hesaplanır.
3. **Onay:** Plan `ONAY-YOK-…` kaydı olarak İnsan Onayları ekranına düşer. Yokluğu bildiren kişi, rolü ne olursa olsun, bu planı onaylayamaz. Onay verilene kadar hastaya hiçbir şey gönderilmez. Plan reddedilirse randevular eski durumuna döner.
4. **Bilgilendirme:** Onayla birlikte her hasta için kısa bir mesaj kuyruğa girer. Klinik öncelikli hastalar için birim hekimine 4 saatlik görev açılır. İletişim izni olmayan veya randevusuna 24 saatten az kalmış hastalar için çağrı merkezinde görev açılır.
5. **Yanıt:** EVET gelirse randevu yeni hekime ve saate taşınır, onay mesajı gider. ARA gelirse geri arama görevi açılır. İPTAL gelirse randevu iptal edilir. Üç kez ulaşılamayan hasta "işlem gerekli" durumuna düşer. Tüm öneriler sonuçlanınca yokluk kaydı kapanır.

## Kanal kuralları

`lib/patient-access.ts → CHANNELS` her kanal için şunları tanımlar: ilk karşılayan birim, ilk yanıt süresi, kimlik doğrulama yöntemi, paylaşılabilecek bilgi ve asla paylaşılmayacak bilgi. Örneğin telefonda kimlik ad-soyad, doğum yılı ve kayıtlı telefonun son dört hanesiyle doğrulanır. WhatsApp'ta tahlil sonucu ya da belge gönderilmez.

## Gerçek veriye geçiş

- **Hekim ve randevu verisi:** Kurumun HBYS'sinden veya MHRS cetvelinden imzalı entegrasyonla gelmelidir. Şu anki satırlar `training = true` olarak işaretli eğitim kayıtlarıdır ve ekranda "EĞİTİM VERİSİ" etiketiyle görünür.
- **Mesaj sağlayıcısı:** SMS veya WhatsApp Business sağlayıcısı bağlanana kadar gerçek kayıtlar "telefonla aranacak" durumuna düşer. Hiçbir mesaj gönderilmemişken "gönderildi" görünmez. Sağlayıcı bağlandığında `dispatchNotifications` içindeki adaptör noktası kullanılır. Ücretli bir servis olduğu için sağlayıcıyı kurum seçer.
- **Hasta yanıtı:** Sağlayıcı, yanıtı `/api/integrations/messages` adresine v2 HMAC imzasıyla gönderir. Serbest metin işlenmez; yalnızca EVET, ARA ve İPTAL kabul edilir.
- **Mevzuat:** Bilgilendirme mesajları ticari ileti sayılmaz. Yine de iletişim izni kanal bazında tutulur. Sağlık verisinin yurt içinde barındırılması ve hasta haklarına ilişkin kurallar için kurumun hukuk birimiyle teyit edilmelidir. Bu belge hukuki görüş değildir.

## Tutarlılık: yarım kayıt kalmaz

Yokluk bildirimi, onay kararı, hekim değerlendirmesi ve hasta yanıtı her biri **tek bir veritabanı işlemidir** (D1 batch). Onay kaydı, yokluk durumu, öneriler, randevular, bildirim kuyruğu, arama görevleri ve denetim izi birlikte yazılır ya da hiçbiri yazılmaz. Her işlemin başında bir kilit satırı bulunur; aynı karar veya aynı hasta yanıtı iki kanaldan aynı anda gelirse ikincisi geri alınır ve 409 döner.

## Operasyon akışları

`lib/playbooks.ts` 81 çok birimli operasyon akışı tanımlar (yatak hazırlığı, cihaz arızası, HBYS kesintisi, şikâyet, kök neden analizi…). İşleyiş:

- **Başlatma:** Elle (ilk adımın birimi veya operasyon yöneticisi), olaydan (`/api/integrations/events`, imzalı v2; `lib/playbook-triggers.ts` eşlemesi) veya Klinorbis'in kendi kaydından (şikâyet türündeki talep "Hasta şikâyeti" akışını açar). Aynı olay kimliği ikinci kez akış açmaz. Gerçek bağlantı kurulana kadar operasyon yöneticisi olayı simüle edebilir; simülasyon olarak işaretlenir.
- **Devir:** Her adım ilgili birimin iş kutusuna görev olarak düşer; adım yalnız o birimde tamamlanır ve görev sıradaki birime geçer.
- **Gecikmeli adım:** "Taburcudan 48 saat sonra ara" gibi adımlar zamanı gelene kadar "planlandı" durumunda bekler, iş kutusu sayısına girmez ve tamamlanamaz. Zamanı gelince otomasyon döngüsü veya ekranın açılması görevi kuyruğa alır.
- **Onay:** Akışı başlatan kişi, rolü ne olursa olsun, onay adımını geçiremez. Klinik birimdeki onay adımlarını yalnız o birimin klinisyeni geçirir; diğer onayları birim yöneticisi veya operasyon yöneticisi verir. Tek yetkili olan birimde onay adımı ikinci yetkili atanana kadar bekler.
- **İptal:** Akışı başlatan kişi, akışta görevi olan birimin yöneticisi veya operasyon yöneticisi iptal eder; neden zorunludur.
- **Zincir:** Akış kapanınca bağlı akışlar aynı işlemde başlar (32 bağlantı; zincir derinliği 4 ile sınırlı).
- **Tek işlem:** Adım tamamlama, sonraki görev, zincir ve denetim izi tek batch'tir; "akış + okunan sürüm" kilidiyle aynı adımı iki kişi tamamlayamaz, tamamlama ile iptal yarışamaz.
- **Performans:** Akış ekranının "Performans" sekmesi akış başına ortalama süreyi, birim başına ortalama beklemeyi, hedef süreye uyumu ve şu an geciken adımları gösterir.

Klinik karar vermez: klinik karar gerektiren adımlar "yetkili hekim karar verir" diye yazılır ve klinisyen onayına bağlanır.
