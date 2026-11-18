# Tasarım belgesi (11 Kasım 2026, derin araştırma)

## Bu belge nasıl okunur ve neye dayanır

**Kaynak ve öneri ayrımı.** Belgede iki tür bilgi var. **Kaynaklı bulgu**, yanında bağlantısı olan bilgidir. **Öneri** ise kaynaklardan çıkarılmış tasarım kararıdır: süre hedefleri, aşama listeleri, sektör şablonları, veri modelleri, ekran adları gibi. Tablolarda öneriler **[Öneri]** etiketiyle gösterildi. Bir bilgi kaynakla teyit edilemediyse **"doğrulanamadı"** yazıldı. Bunlar "yok" anlamına gelmez, "bakıldı, gösterilemedi" anlamına gelir.

**Erişim tarihi.** Bağlantılara 10 ve 11 Kasım 2026'da erişildi. İşaretsiz bağlantıların erişim tarihi **11.11.2026**. Yanında **(10.11)** yazanlar bir önceki araştırma turundan, **10.11.2026** tarihli. Mevzuat bağlantılarının çoğu ikincil kaynaktır: avukat yazıları, mali siteler, hastane prosedürleri. Resmî Gazete metni açılamadığı yerde bu belirtildi. **Uygulamadan önce mevzuat metni Resmî Gazete'den kontrol edilmeli.**

**Özellik tablolarındaki sütunlar.** **Öncelik:** 1 = satış için şart, 2 = kullanımı kolaylaştırır, 3 = sonra. **Zorluk:** kolay / orta / zor. **Tür:** "kod" geliştiricinin yazacağı iştir. "Tasarım" ekran, metin ve akış kararıdır. "Karar-sözleşme" ise avukat, mali müşavir, hastane ya da ödeme kuruluşu ile verilecek karar ya da imzalanacak sözleşmedir, kodla çözülmez. Gerçek hasta verisi, gerçek para akışı ya da klinik karar içeren her madde "karar-sözleşme" sayıldı.

**Ürünler ayrı tutuldu.** Üç ürün birbirinden bağımsız bölümlerde ele alındı. Bir ürün için önerilen özellik başka ürüne taşınmadı.


# ÜRÜN 1 — KLINORBIS: hastane operasyon otomasyonu

## Klinorbis kararı değil, kararın ardından gelen işi yönetir

Bir hastanede günün büyük kısmı iki ayrı sistemde akıyor. **HBYS** (Hastane Bilgi Yönetim Sistemi: hastanın kaydını, muayenesini, istemlerini ve faturasını tutan ana hastane yazılımı) "kim nerede, ne yapıldı" sorusunu cevaplıyor. Birimler arasındaki iş ise büyük ölçüde **form, telefon ve sözlü haberle** yürüyor. İncelenen prosedürlerde taburcudan sonra "temizlik personeline haber verilir" deniyor, sistemsel bir iş emri tarif edilmiyor ([YDÜ BHK_P_01](https://jci.med.neu.edu.tr/TEMOS/08_BASHEKIMLIK/PROSEDURLER/BHK_P_01_RV00_HASTA_TABURCULUK_SEVK_TAKIP_PROSEDURU.pdf)). Acilden servise geçiş "Hasta Transfer Formu" ve dosyayla yapılıyor. Yatağın "temiz, çarşafları değişmiş" olması şart koşuluyor, ama bunun kimin işi olduğu ve ne kadar sürdüğü kayda geçmiyor ([KSÜ HB.PR.25](https://hastane.ksu.edu.tr/depo/belgeler/HB.PR.25%20YATAN%20HASTA%20PROSED%C3%9CR%C3%9C_2209011139491563.pdf)). Klinorbis'in yeri bu boşluk. HBYS kayıt sistemi olarak kalır. Klinorbis **iş sistemi** olur: bir olay (hasta odadan çıktı) bir iş emri üretir (yatağı temizle), iş bir kişiye düşer, süre sayılır, gecikirse üst kişiye çıkar.

**Bugünkü koddan tasarımı etkileyen 5 gerçek (önceki inceleme, 10.11):**

1. Kod yoğun bakım ve yenidoğan yoğun bakım transfer taleplerine **otomatik ön kabul, otomatik ret ve otomatik alternatif kampüse yönlendirme** kararı veriyor ([lib/control-tower.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/lib/control-tower.ts)).
2. Kod "Göğsüm ağrıyor" gibi serbest metinden acil yönlendirme yapıyor. Ayrıca "Klinik triyaj rolü" adlı bir persona var ([lib/screen-help.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/lib/screen-help.ts)).
3. Kodda **temizlik ve hasta taşıma personeli için rol yok**. Bu personel "Çağrı Merkezi Görevlisi" rolüyle açılıyor ([lib/role-map.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/lib/role-map.ts)).
4. Yatak, temizlik ve taşıma ekranları yönetici menüsünde, kapalı bir "Sentetik çekirdek ekranları" kutusunun içinde duruyor. Zincirde iki hata var: hazır yatak 15 dakika sonra kendiliğinden "hazır değil"e düşüyor, transferden sonra boşalan yatak için temizlik işi açılmıyor ([app/dashboard.tsx](https://github.com/ekremalann-sketch/Klinorbis/blob/main/app/dashboard.tsx), [lib/hospital-coordination.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/lib/hospital-coordination.ts)).
5. Kodda 22 menü maddesi var. Bunların bir kısmı ürün tanımının dışında kalıyor: çağrı merkezi, randevu, hekim yokluğu, hasta talepleri. Veri yurt dışı bulutta duruyor, giriş ChatGPT hesabıyla yapılıyor ([app/chatgpt-auth.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/app/chatgpt-auth.ts)).

Bu belgedeki tasarım bu beş noktayı düzeltecek şekilde kuruldu. Hedef müşteri önceki araştırmadaki gibi **50–150 yataklı özel hastane**. İlk kullanım biçimi ise **hasta verisi olmadan yürüyen bir pilot**.

## Klinik sınır: yapılır / yapılmaz tablosu

Avrupa Komisyonu'nun yazılım rehberi **MDCG 2019-11**'in Haziran 2025 tarihli 1. revizyonu iki şeyi açıkça söylüyor. Birincisi: HBYS'ler hasta kabulü, randevu ve faturalama amaçlıdır ve **"kendi başlarına tıbbi cihaz değildir"**, ama içlerindeki bazı modüller tıbbi cihaz olabilir. İkincisi: yazılım yalnızca saklama, arşivleme, iletme ve "basit arama" yapıyorsa tıbbi cihaz yazılımı (MDSW: kendi başına tıbbi amaca hizmet ettiği için tıbbi cihaz sayılan yazılım) sayılmaz ([MDCG 2019-11 Rev.1, §3.3 ve Ek I(a)](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf)). Aynı metin iki örneği ise açıkça tıbbi cihaz sayıyor. Birincisi **hastanın fizyolojik parametrelerini izleyip analiz ederek alarm üreten modül** (Ek I(d)). İkincisi **testin kritikliğini değerlendirip istemi otomatik olarak yeniden önceliklendiren** laboratuvar modülü (Ek I(f.1)). "Hastane yönetimi amaçlı, tıbbi olmayan performansın idari izlenmesi" yapan modüller ise kapsam dışında kalabiliyor (Ek I(e)). Metinde "yatak", "iş akışı" ya da "kaynak yönetimi" için doğrudan bir örnek yok. Bu yüzden aşağıdaki sınıflandırmalar **çıkarım**. Bunlar TİTCK'nın resmî görüşü değil, tablonun tamamı **karar-sözleşme** niteliğinde. Rehber ayrıca modül sınırlarını açıkça çizme sorumluluğunu üreticiye veriyor (§7).

Kural 11'e göre tanı ya da tedavi kararına bilgi veren yazılım Sınıf IIa'dan başlıyor. Yanlış kararın ciddi kötüleşmeye yol açabildiği durumda IIb, ölüm ya da geri dönüşsüz zarar riskinde III oluyor. Acil ya da yoğun bakımda hayati parametreleri izleyen yazılım IIb sayılıyor ([MDCG §4.2.1 ve Ek IV](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf)). Bu sınıflarda onaylanmış kuruluş, ISO 13485, IEC 62304 ve klinik değerlendirme gerekir. Bu yol tek kişilik bir girişim için gerçekçi değil ([OpenRegulatory (10.11)](https://openregulatory.com/mdcg/mdcg-2019-11)). Türkiye Tıbbi Cihaz Yönetmeliği'nin RG tarihi ve sayısı bu araştırmada **doğrulanamadı**. Önceki araştırmaya göre yönetmelik MDR'ye (AB Tıbbi Cihaz Tüzüğü) uyumlu.

| Özellik | Klinorbis'te | Dayanak (MDCG 2019-11 Rev.1) |
|---|---|---|
| Kuyruk ekranı: geliş saati, yatak/iş kodu, bekleme süresi | **Yapılır** | Saklama, iletme ve basit gösterim (§3.3 adım 3) |
| Sağlık personelinin verdiği triyaj alanını (kırmızı/sarı/yeşil) kaydetmek ve göstermek | **Yapılır.** Alanın adı "personelin girdiği alan" olur, sistem değeri değiştirmez. | Veri kaydı ve iletim, karar insanda (§3.3, Ek I(c)) |
| Triyaj rengini ya da puanını sistemin hesaplaması (şikâyet, vital bulgu, yaş vb.) | **Yapılmaz** | Tanı ve tedavi kararına bilgi verir: Kural 11a. Acilde yanlış negatif ölüm riski taşır, IIb–III. |
| Vital bulguya dayalı uyarı ya da alarm | **Yapılmaz** | Ek I(d): metindeki açık MDSW örneği |
| Laboratuvar ve görüntülemede **durum** takibi (istendi / numune alındı / sonuç hazır / hekim gördü) | **Yapılır** | İş süreci durumu, tıbbi yorum yok |
| Anormal laboratuvar değerini işaretlemek ya da işi öne almak | **Yapılmaz** | Ek I(f.1). LIS'in kendi bayrağını aynen göstermek gri alan, tercih edilen yol göstermemek. |
| İdari hatırlatma (temizlik bekliyor, taşıma kabul edilmedi, epikriz dosyası eksik) | **Yapılır** | İdari performans izleme, Ek I(e) |
| Klinik hatırlatma (ilaç saati, pozisyon değişimi, erken uyarı skoru tekrarı) | **Yapılmaz** | Tedavi ve takip bilgisi, Ek I(c.1.1) |
| Yatak önerisi: boş, temiz, izolasyona uygun yatakları listelemek, **seçimi insan yapar** | **Yapılır** | Planlama ve basit arama, Ek I(a) |
| Hastanın klinik durumuna göre yatağı ya da servisi sistemin seçmesi | **Yapılmaz** | Bireysel hasta için bakım düzeyi kararı, Kural 11a |
| Servisler arası ve yoğun bakım transfer talebi: oluştur, ilet, **insan kabul eder ya da reddeder**, süre say | **Yapılır** | İletişim ve kayıt |
| **Yoğun bakım transferini otomatik kabul/ret ve otomatik kampüs yönlendirmesi (bugünkü kod)** | **Yapılmaz — kaldırılmalı** | Bireysel hastada tedavi düzeyi kararı. Yanlış ret ölüm riski taşır: Kural 11a IIb–III (çıkarım). |
| Hekimin girdiği "planlanan taburcu tarihi" ve yarın boşalacak yatak sayısı | **Yapılır** | Hekim girdisini taşıma ve sayım |
| Klinik veriden hasta bazında taburcu ya da kötüleşme tahmini (yapay zekâ) | **Yapılmaz** | Rev.1, Kural 11'i tahmin bilgisine genişletti ([Emergo (10.11)](https://www.emergobyul.com/news/european-revision-primary-software-guidance-mdcg-2019-11-revision-1-small-changes-meaningful)) |
| Eczane: stok, son kullanma tarihi, sipariş, servise teslim durumu | **Yapılır** | Lojistik, hastaya özel tedavi bilgisi yok |
| İlaç dozu hesabı, etkileşim kontrolü | **Yapılmaz** | Bireysel tedavi parametresi |
| İş yükü sayımı (vardiya başına iş, doluluk) | **Yapılır** | İdari izleme, Ek I(e) |
| Personel planında hasta ağırlığı ya da akuite skoru kullanmak | **Gri — yapılmaz** | Akuite (hastanın bakım ihtiyacı düzeyi) klinik değerlendirmedir |
| Kurum düzeyinde istatistik (doluluk, ortalama temizlik süresi, cihaz duruşu) | **Yapılır** | Bireysel hasta yararı yok (§3.3 adım 4) |
| **Serbest metin şikâyetten acil ya da öncelik çıkarmak (bugünkü kod)** | **Yapılmaz — kaldırılmalı** | Belirtiden aciliyet çıkarmak triyajdır. Ek I(c.1.2) ve (f.1) ile aynı mantık (çıkarım). |
| Serbest metni olduğu gibi ilgili birime iletmek, insanın okuyup yönlendirmesi | **Yapılır** | İletişim (§3.3 adım 3) |
| Cihaz arızasında etkilenen birimlere idari bildirim | **Yapılır** | Tesis yönetimi, klinik yorum yok |

**İki özelliğin dönüşümü (karar-sözleşme):**

- **Yoğun bakım transferi:** Otomatik karar kaldırılır. Yerine "Transfer talebi" kaydı gelir: talep eden hekim, talep saati, alıcı birim. Alıcı birimdeki yetkili hekim "Kabul / Ret (gerekçe)" düğmesine basar. Sistem kararı, saatini ve kararı vereni kaydeder. Kabulden sonra taşıma işi açılır. Cevap gelmezse süre sayılır ve idari eskalasyon başlar: önce nöbetçi idari uzmana, sonra başhekim yardımcısına. Alternatif kampüs önerisi tamamen kalkar.
- **Serbest metin:** Ekran metni yorumlamaz. Metin, gönderen kişinin seçtiği birime **olduğu gibi** gider. Öncelik alanının kaynağı her zaman "talep eden personel" olur. Sistem içindeki sıralama yalnız idari ölçütlerle yapılır: bekleme süresi, talep saati, ekip uygunluğu.

**Dil kuralı:** Arayüzde, demoda ve pazarlama metinlerinde "triyaj (sistem)", "erken uyarı", "kötüleşme", "klinik öneri", "Klinik Rol" ifadeleri kullanılmaz. Her modülün başına tek cümlelik bir kullanım amacı beyanı yazılır: "Bu modül yatak, temizlik, taşıma ve cihaz işlerinin idari koordinasyonu içindir. Tanı, tedavi, triyaj veya klinik önceliklendirme amacı taşımaz."

## A) Uçtan uca hasta yolculuğu: 12 adım, mevzuatın sayıyla verdiği iki süre

Türkiye'de akışın birkaç adımı mevzuatla sabitlenmiş. **Triyajı eğitimli sağlık personeli yapar.** Acilde hasta takibinin **8 saati geçmemesi** esastır. Yatışı yapılan hasta, uygun yatak varsa **en geç 2 saat** içinde kliniğe nakledilir. Acil hastaya, sağlık güvencesi ya da kimliği eksik olsa bile müdahale edilir, işlemler sonra tamamlanır ([2022 Tebliği, md. 4, 8, 11](https://www.alomaliye.com/2022/09/13/yatakli-saglik-tesisleri-acil-servis-hizmetleri-uygulama-usul-ve-esaslari/)). Tasarım için sonucu şu: Klinorbis'te acil başvurusu **provizyon ya da kimlik eksikliği yüzünden asla durdurulmaz**. "Kayıt eksik" yalnızca vezneye düşen bir iş olur. (Provizyon: hastanın başvurusunda hastane yazılımının SGK'nın MEDULA sistemine sorarak aldığı muayene ön izni; [Hukuki Haber](https://www.hukukihaber.net/sosyal-guvenlikte-medula-sistemi-uygulamasi).)

Hastalar arası sevkler 2025'ten beri yalnız Bakanlığın **ASOS** sistemi (Acil Sağlık Otomasyon Sistemi) üzerinden, Sağlık Komuta Kontrol Merkezi koordinasyonunda yürüyor. Genelgeye göre "onaysız sevkler sistemden kabul edilmeyecek" ve vaka kapanınca ASOS'ta güncellenmeli ([Genelge 2025/5](https://www.lexpera.com.tr/mevzuat/genelgeler/hasta-sevk-sureclerinin-koordinasyonu-genelgesi-2025-5-1)). Bu yüzden Klinorbis ASOS'un yerine geçmez. Yalnız iç takibi yapar: "ASOS'a girildi mi, onaylandı mı, ambulans geldi mi, kayıt kapandı mı". Özel hastanelerin ASOS'u hangi ölçüde kullandığı **doğrulanamadı**.

Bakanlığın kamu hastanelerinde ölçtüğü operasyon göstergeleri de akışın sayaçlarını belirliyor: acilde kayıttan muayeneye ortalama bekleme süresi, acilde 8 saat ve üzeri kalan hasta oranı, servis ve yoğun bakım yatak devir hızı ile doluluğu, BT/MR sonuç süresi (3 günü aşan oran), MHRS doluluğu ([KHGM Ek-2](https://khgm.saglik.gov.tr/Eklenti/45303/0/ek-2-saglik-tesisleri-kurum-hedef-gostergeleri-gosterge-verileri-hesaplama-yontem-ve-aciklamalaripdf.pdf)). Bu set kamu hastaneleri için hazırlanmış. Özel hastaneler için zorunlu olup olmadığı **doğrulanamadı**. Laboratuvar sonuç süresi, taburcu saati ve "kirli yataktan temiz yatağa geçiş süresi" için Türk kaynaklı bir gösterge ya da ölçüm **bulunamadı**. Bunlar özel hastanede bir fark yaratma alanı olabilir.

Aşağıdaki tabloda **kalın** yazılan süreler mevzuattan ya da kaynaktan geliyor. Ekran adları, durum adları ve bildirimler **[Öneri]**. "KLİNİK" yazan hücrelerde kararı insan verir, Klinorbis yalnızca kararın verildiğini ve saatini kaydeder.

| # | Adım | Kim başlatır | Sorumlu | Klinorbis ekranı [Öneri] | Durumlar [Öneri] | İzlenen süre | Bildirim [Öneri] |
|---|---|---|---|---|---|---|---|
| 1 | Randevu (MHRS ya da çağrı merkezi) | Hasta / çağrı merkezi | Poliklinik sekreteri | Günlük poliklinik özeti (yalnız sayılar) | planlandı → geldi → gelmedi | Randevu doluluğu (KHGM A.1.3–A.1.4) | Gelmeyen sayısı eşiği aşınca sekretere |
| 2 | Başvuru, kayıt, provizyon | Hasta kayıt görevlisi | Hasta kabul / vezne | Kayıt kuyruğu | kayıtta → provizyon alındı / provizyon sorunu → kayıt tamam | Kayıt bekleme süresi | Provizyon sorunu vezneye gider, **acilde hastayı durdurmaz** |
| 3 | Acil triyaj kuyruğu | Hastanın acile gelişi | **Triyajı yapan sağlık personeli** | Acil akış panosu | geldi → alan girildi (personel girer) → muayenede | **Kayıttan muayeneye bekleme (KHGM A.2.2)** | Eşik aşılınca acil sorumlu hemşiresine. KLİNİK: triyaj kararı personelde. |
| 4 | Poliklinik ya da acil muayenesi | Hekim | Hekim | Ekran yok, yalnız zaman damgası (HBYS'den ya da tek tuşla) | muayenede → muayene bitti | Kapıdan hekime süre | — |
| 5 | Tetkik istemi ve sonuç takibi (laboratuvar, görüntüleme) | Hekim (HBYS'de) | Laboratuvar / radyoloji | Tetkik takip panosu (**yalnız entegrasyon varsa**) | istendi → numune alındı → laba ulaştı → sonuç hazır → hekim gördü | Laboratuvar sonuç süresi, **BT/MR sonucu >3 gün oranı (KHGM A.6.x)** | "Sonuç hazır, X dakikadır görülmedi" birim sorumlusuna gider (içerik değil, durum) |
| 6 | Konsültasyon | İsteyen hekim | Konsültan hekim | Konsültasyon kuyruğu | istendi → kabul → hasta başında → yanıtlandı | İstemden yanıta süre. 2022 Tebliği'nde "en kısa sürede", KSÜ prosedüründe "aynı gün". 2009'daki 30 dakika kuralı yürürlükten kalktı. | Hastanenin girdiği eşik aşılınca nöbetçi idari uzmana |
| 7 | Yatış kararı → yatak | Hekim karar verir (KLİNİK) | Servis sorumlu hemşiresi / yatış birimi | **Yatak panosu** | karar verildi → yatak atandı → yatak hazır → taşıma istendi → serviste | **Karardan servise ≤2 saat, acilde ≤8 saat** | 90. dakikada uyarı, 120. dakikada eskalasyon [Öneri] |
| 8 | Servis içi takip | Servis hemşiresi | Sorumlu hemşire | Servis panosu (yatak kartları) | yatıyor / planlanan taburcu tarihi var / izinli | Doluluk, devir hızı (KHGM A.3.1–3.2) | Yarın boşalacak yataklar listesi, vardiya başında |
| 9 | Transfer (servis ↔ yoğun bakım, başka hastane) | Hekim karar verir (KLİNİK) | Gönderen ve alan birimin sorumlu hemşiresi. Dış sevkte ASOS. | Transfer ve taşıma ekranı | talep → alıcı kabul/ret (insan) → taşıyıcı atandı → yolda → teslim edildi | Talepten teslime süre | Alıcı cevap vermezse X dakika sonra nöbetçi idari uzmana |
| 10 | Taburcu | Hekimin taburcu istemi (KLİNİK) | Hemşire, hasta danışmanı, hasta kayıt | Taburcu takip | istem → epikriz hazır → kayıt/fatura onayı → hasta ayrıldı → oda kontrol | İstemden fiziksel çıkışa süre, taburcu saati | "Hasta ayrıldı" girilince temizlik işi **otomatik** açılır |
| 11 | Yatak temizliği ve kontrolü | "Hasta ayrıldı" olayı | Temizlik ekibi. Kontrolü temizliği yapan değil, başka biri yapar. | Temizlik iş listesi (telefon) | kirli → atandı → başladı → bitti → kontrol edildi = hazır | Kirliden hazıra süre | Kabul edilmeyen iş temizlik şefine gider |
| 12 | Çıkış ve faturalama devri | Hasta kayıt | Faturalama | Fatura devri listesi | dosya eksik → dosya tamam → MEDULA'ya gönderildi | Taburcudan fatura kapanışına gün sayısı | Eksik dosya servis sekreterine gider |

YDÜ taburcu prosedüründe, ödeme sorunu çıkmaması için hasta servisten ayrılmadan hasta kayıt biriminin taburcu onayını ekrandan teyit ettiği ve hemşirenin bir sonraki hasta alınmadan önce odayı kontrol edip temizliğe haber verdiği yazıyor ([YDÜ BHK_P_01](https://jci.med.neu.edu.tr/TEMOS/08_BASHEKIMLIK/PROSEDURLER/BHK_P_01_RV00_HASTA_TABURCULUK_SEVK_TAKIP_PROSEDURU.pdf)). Bu hastane KKTC'de ve JCI akreditasyonlu. Türk pratiğine benzese de birebir Türk mevzuatı değil. KSÜ prosedürüne göre mesai dışında yatış ve taburcu işlemlerini acil sekreteri yürütüyor ([KSÜ HB.PR.25](https://hastane.ksu.edu.tr/depo/belgeler/HB.PR.25%20YATAN%20HASTA%20PROSED%C3%9CR%C3%9C_2209011139491563.pdf)). Klinorbis'te "hasta ayrıldı" ve "yatış kararı saati" olaylarını mesai dışında girebilecek rol bu yüzden **acil sekreteri** olmalı.

**Demo için sonuç:** Kaynaklı ve sayısal iki süre var: "yatış kararından servise 2 saat" ve "acilde 8 saat". İlk demo bu iki sayacı göstermeli. Satış konuşmasının başlığı da bu olmalı: "2 saat kuralını kaçırdığınız hastaları ve nedenini (yatak kirli mi, taşıma mı gelmedi, alıcı mı cevap vermedi) görün." 4. ve 5. adımlar entegrasyonsuz bir pilotta gerçekçi değil. Laboratuvar durumlarının elle girilmesi kimsenin yapmayacağı ek iş olur. Bu adımlar yalnız HBYS bağlantısı kurulduktan sonra açılmalı.

## Birimler: 15 birimin günlük iş listesi, ilk sürümde 5'i yeterli

SKS (Sağlıkta Kalite Standartları: Sağlık Bakanlığı'nın hastanelerin kalite ve güvenlik düzeyini ölçtüğü standart seti) birimlerden yazılı düzen istiyor. Bölüm bazında temizlik planı, tıbbi cihaz yönetimi ve kalibrasyon etiketi, en az 3 ayda bir bina turu, hasta hakları birimi ve güvenli hasta transferi bunlardan bazıları ([SHKS Hastane seti](https://www.saglikaktuel.com/d/file/ek1shkshastane.pdf)). Bu belge eski SHKS setidir. Güncel **SKS Hastane Sürüm 6**'nın madde numaraları **doğrulanamadı**. Aynı sette mavi kod (kalp ya da solunum durması acil çağrısı) ekibinin **en geç 3 dakikada** olay yerine ulaşması isteniyor. Bakanlığın gösterge rehberi ise hedef değerlerin çoğunu kurumun kendisine bırakıyor ([SKS Gösterge Rehberi 2.3](https://cdn.comu.edu.tr/cms/dismer/files/118-sks-gosterge-yonetimi-rehberi-23.pdf)). Mavi kod klinik bir acil durum çağrısıdır. Klinorbis bu çağrıyı yönetmez, yalnız hastanenin mevcut sisteminin tuttuğu süreyi raporda gösterebilir.

Kamu hastanelerinde temizlik ve teknik arıza bildirimi QR kodla yapılıyor. Sağlık Bakanlığı'nın QR Temizlik uygulaması ve İstanbul'daki "Hastanem Temiz" bunun örnekleri. İkincisinde süresinde çözülmeyen talep üst yönetime otomatik iletiliyor ([AA, QR temizlik (10.11)](https://www.aa.com.tr/tr/saglik/hastanelerde-hijyen-icin-qr-kodlu-yeni-donem/3663590), [AA, Hastanem Temiz (10.11)](https://www.aa.com.tr/tr/saglik/istanbulda-hastanelerde-temizlik-veya-teknik-sorunlar-qr-kodla-bildirilecek/3900210)). Kamu hastanesine ayrı bir temizlik modülü satmak bu yüzden zor. Özel hastanede ise boşluk daha büyük olabilir. Bu bir çıkarım, özel hastane kullanım verisi yok.

Aşağıdaki tabloda birim adları kaynaklı, iş listelerinin içeriği **[Öneri]**.

| Birim | Klinorbis'teki günlük iş listesi | En sık konuştuğu birimler | İlk sürümde |
|---|---|---|---|
| Acil | Alan başına bekleyen hasta sayısı. Yatış kararı verilmiş ama yatağı olmayanlar (2 saat sayacı). 8 saate yaklaşanlar. Bekleyen konsültasyonlar. Sevk takibi. | Servis, taşıma, ASOS | **Var** (yalnız sayaçlar) |
| Poliklinikler | Slot doluluğu, gelmeyen hasta, bekleyen sayısı, hekim gecikmesi | Hasta kabul, çağrı merkezi | Sonra |
| Servisler | Yatak kartları (dolu / kirli / temizlikte / kontrol bekliyor / hazır / bloke). Beklenen taburcular, gelen yatışlar, açık temizlik, taşıma ve teknik işleri. Devir notu. | Acil, temizlik, taşıma, teknik, eczane, faturalama | **Var** |
| Yoğun bakım | Yatak durumu. Çıkışa hazır olup servis yatağı bekleyenler. Gelen transfer talepleri (kabul ya da ret insanda). | Servis, acil, ameliyathane | **Var** (yatak + transfer talebi) |
| Ameliyathane | Günlük liste sırası (hazırlık / salonda / derlenmede / servise), salon temizliği, steril set hazır mı | Sterilizasyon, taşıma, servis | Sonra |
| Laboratuvar | Numune bekleyenler, geciken istemler, "sonuç hazır, görülmedi" sayısı | Servis, acil (numune taşıma) | Entegrasyonla |
| Radyoloji | Çekim kuyruğu, rapor bekleyenler, randevu süresi | Taşıma, servis | Entegrasyonla |
| Eczane | Servis ilaç taleplerinin teslim durumu (içerik değil: "beklemede / teslim edildi") | Servis, taşıma | Sonra |
| Sterilizasyon (MSÜ) | Kirli set teslim alındı → yıkama → paketleme → sterilize → teslim | Ameliyathane, servisler | Sonra |
| Temizlik | Kirli oda ve yatak işleri, QR çağrıları, kontrol bekleyen işler | Servis, ameliyathane | **Var** |
| Hasta taşıma | Taşıma işleri: nereden-nereye, sedye ya da tekerlekli sandalye, öncelik (talep eden seçer) | Bütün birimler | **Var** |
| Teknik servis ve biyomedikal | Arıza iş emirleri, planlı bakım ve kalibrasyon takvimi, bloke edilen yatak ve odalar | Servis, yoğun bakım, ameliyathane | **Var** |
| Bilgi işlem | Arıza talepleri, kullanıcı ve yetki talepleri, ortalama müdahale süresi (SKS göstergesi) | Bütün birimler | Sonra |
| Hasta hakları | Başvuru listesi, ilgili birime yönlendirme, kapanış süresi | Bütün birimler | Sonra |
| Vezne / faturalama | Provizyon sorunları, taburcu sonrası eksik dosyalar, fatura kapanışı | Hasta kabul, servis sekreteri | Sonra |

**İlk sürümün kapsamı:** servis, temizlik, taşıma, teknik servis/biyomedikal ve yoğun bakım transfer talebi. Acil tarafında yalnız yatak bekleyen hastanın sayacı. Yatağın ne zaman hazır olacağını bu birimlerin işi belirliyor ve hepsi bugün telefonla yürüyor. Diğer birimler aynı "iş emri + durum + süre" altyapısını kullanarak sonra eklenir. Yeni bir kavram gerekmez.

## Birimler arası yönlendirme: tek iş emri modeli ve kural tablosu

Kaynaklardaki ortak yönlendirme kalıbı dört adımlı. Önce bir olay otomatik iş emri üretir. Epic'in Rover uygulamasında taburcu olayı HBYS'de "yatak temizle" isteği açıyor ve bu istek o bölgede vardiyada olan temizlik personeline atanıyor. Liderler eskalasyon bildirimi alıyor ve atamayı elle değiştirebiliyor ([VUMC Rover](https://healthit.vumc.org/sites/default/files/2021-06/Powering%20Excellence_Using%20Epic%E2%80%99s%20Rover%20Solution%20to%20Improve%20EVS%20Productivity.pdf)). Sonra iş bölgeye, yakınlığa ya da uygunluğa göre atanır. Kabul edilmezse sıradaki kişiye ya da ekip liderine gider. Hindistan'daki bir hastanede telefonla istenen taşıma çağrılarının **%62'si cevapsız** kalıyordu. Konum ve iş yüküne göre otomatik atama ve cevapsız isteği yeniden yönlendirme gelince toplam süre **28 dakikadan yaklaşık 20 dakikaya** indi ([Kataria ve ark., Cureus 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11495421/)). Son olarak süresinde çözülmeyen iş üst yönetime çıkar.

Türkiye'de bu kalıbın son halkası doğal olarak **nöbetçi idari uzman** (mesai dışında hastaneyi idari olarak yöneten nöbetçi uzman hekim). Bu rol sevk onaylarında mevzuatta da geçiyor ([Genelge 2025/5](https://www.lexpera.com.tr/mevzuat/genelgeler/hasta-sevk-sureclerinin-koordinasyonu-genelgesi-2025-5-1)). **SLA** (hizmet seviyesi hedefi: bir işin en geç ne kadar sürede kabul edilip bitirileceği sözü) için Türk hastanelerinin yazılı temizlik ve taşıma hedefleri **bulunamadı**. Bu yüzden aşağıdaki dakikalar yalnız başlangıç varsayılanıdır. Hastane kendi değerlerini girer. Kaynaklı tek süreler kalın yazılanlar.

**Kural tablosu [Öneri]**

| İstek tipi | Tetikleyici olay | Hedef birim | Öncelik | Kabul hedefi | Bitirme hedefi | Eskalasyon zinciri |
|---|---|---|---|---|---|---|
| Taburcu sonrası yatak temizliği | "Hasta odadan ayrıldı" | Temizlik (servisin bölgesi) | Yüksek. Acilde yatak bekleyen varsa Acil. | 10 dk | 45 dk (izolasyon temizliği: hastane belirler) | Temizlik ekip lideri → destek hizmetleri müdürü → nöbetçi idari sorumlu |
| Temizlik kontrolü | "Temizlik bitti" | Servis sorumlu hemşiresi ya da temizlik şefi. **Temizliği yapan kontrol edemez.** | Yüksek | — | 15 dk | Sorumlu hemşire → sağlık bakım hizmetleri müdürü |
| Acilden servise taşıma | "Yatak hazır" ve yatış kararı kayıtlı | Hasta taşıma | Acil | 5 dk | **Karardan servise toplam ≤120 dk** | Taşıma lideri → acil sorumlu hemşiresi → nöbetçi idari uzman |
| Servisler arası ya da yoğun bakım taşıması | Transfer talebi **ve** alıcının insan onayı | Hasta taşıma | Yüksek | 10 dk | 30 dk | Taşıma lideri → gönderen ve alan sorumlu hemşire |
| Tetkik için taşıma | Tetkik randevu saati | Hasta taşıma | Normal | 15 dk | Randevudan 10 dk önce kapıda | Taşıma lideri |
| Numune taşıma | "Numune alındı" | Taşıma / laboratuvar | Talep edenin seçimi | 5 dk | 15 dk | Laboratuvar sorumlusu |
| Yatağı etkileyen teknik arıza | Arıza bildirimi ve yatak "bloke" | Teknik servis | Yüksek | 15 dk | 4 saat | Teknik şef → destek hizmetleri müdürü |
| Biyomedikal cihaz arızası | Arıza bildirimi (QR) | Biyomedikal | Yüksek. Yoğun bakım ve ameliyathanede Acil. | 15 dk | Hastane ve servis sözleşmesi belirler | Biyomedikal sorumlusu → idari müdür |
| Bilgi işlem arızası | Bildirim | Bilgi işlem | Normal. Sistem kesintisinde Acil. | 15 dk | Hastane belirler | BT sorumlusu → hastane müdürü |
| Konsültasyon (yalnız saat takibi) | HBYS istemi | Konsültan branş | Hekim seçer | — | **"En kısa sürede"** (mevzuat), hastane hedef girer | Branş sorumlusu → nöbetçi idari uzman |
| Dış sevk takibi | ASOS'a giriş | Acil sorumlusu / nöbetçi idari uzman | Acil | — | ASOS'ta kapatıldı | Başhekim yardımcısı |
| Hasta hakları başvurusu | Başvuru kaydı | Hasta hakları → ilgili birim | Normal | 1 iş günü | Hastane belirler | Hasta hakları sorumlusu → kalite → başhekim |
| Ameliyathane salon temizliği | "Hasta salondan çıktı" | Ameliyathane temizlik ekibi | Yüksek | 5 dk | Hastane belirler | Ameliyathane sorumlu hemşiresi |
| Steril set isteği | Ameliyat listesi | Sterilizasyon | Yüksek | — | Ameliyattan önce | MSÜ sorumlusu → ameliyathane sorumlusu |

**Kural ekranının alanları [Öneri]:** istek tipi, tetikleyici olay, hedef birim, bölge ya da kat, öncelik (Acil / Yüksek / Normal), kabul hedefi (dk), bitirme hedefi (dk), eskalasyon basamakları (dk + rol), mesai dışı hedef (nöbetçi), bildirim birleştirme. Mesai dışının varsayılanı **17:00–08:00**. Bakanlık poliklinik göstergesinde bu aralığı kullanıyor ([KHGM Ek-2](https://khgm.saglik.gov.tr/Eklenti/45303/0/ek-2-saglik-tesisleri-kurum-hedef-gostergeleri-gosterge-verileri-hesaplama-yontem-ve-aciklamalaripdf.pdf)). Hastane bu aralığı değiştirebilmeli.

**Alarm yorgunluğuna karşı üç kural [Öneri]:** Eskalasyon her zaman önce işi yapan kişiye, sonra lidere, en son yönetime gider. Aynı yatak için açık birden çok uyarı tek bildirimde birleşir. Yönetici yalnız kendi biriminin eskalasyonlarını görür. Önceki incelemede TeleTracking'in uyarı sistemi kullanıcılar tarafından eleştirildiği için bu kurallar baştan konmalı ([IntuitionLabs (10.11)](https://intuitionlabs.ai/software/emergency-department-operations/ed-tracking-boards-and-patient-flow/teletracking)). Bir eksik daha var: bugünkü kodda bildirimler yalnız sekme açıkken çalışıyor ve yatak/temizlik ekranı eskalasyon modülünü hiç çağırmıyor ([lib/escalation.ts](https://github.com/ekremalann-sketch/Klinorbis/blob/main/lib/escalation.ts)). Kural tablosu yazılmadan önce bu bağlantı kurulmalı.

## Tıbbi cihaz ve biyomedikal: yasal etiket rengi cihazın durumunu belirler

Türkiye'de cihaz bakım ve kalibrasyon kuralları açık ve sade. (Kalibrasyon: cihazın ölçtüğü değerin bilinen bir referansla karşılaştırılıp doğruluğunun belgelenmesi.) Test, kontrol ve kalibrasyonu yalnız TİTCK'dan yetki almış kuruluşlar yapabiliyor. Üretici ya da standart bir süre belirtmemişse test **yılda en az bir kez** yapılıyor. Sonuç cihaza etiketle yapıştırılıyor: **yeşil** = uygun, **sarı** = sınırlı kullanım (uygun olmayan fonksiyonlar etikete yazılır), **kırmızı** = uygun değil, düzeltilene kadar kullanılamaz. Sınırlı kullanımlı cihazda düzeltici işlem **6 ay** içinde yapılmalı ya da uygun olmayan fonksiyon kapatılmalı. Yeri değişen sabit cihaz yeniden test ediliyor. Raporlar basılı olarak en az 5, elektronik olarak en az 10 yıl saklanıyor ([Tıbbi Cihazların Test, Kontrol ve Kalibrasyonu Hakkında Yönetmelik, RG 25.06.2015/29397, md. 10, 12, 24](https://www.lexpera.com.tr/resmi-gazete/metin/tibbi-cihazlarin-test-kontrol-ve-kalibrasyonu-hakkinda-yonetmelik-29397)). Yönetmelik 2021'de değişti. Değişikliğin içeriği **doğrulanamadı** ([alomaliye](https://www.alomaliye.com/2021/12/10/tibbi-cihazlarin-test-kontrol-ve-kalibrasyonu-hakkinda-yonetmelikte-degisiklik-yapilmasina-dair-yonetmelik/)).

**ÜTS** (Ürün Takip Sistemi: TİTCK'nın tıbbi cihazları seri ya da lot numarasıyla tek tek izlediği devlet sistemi), bakım, onarım ve kalibrasyona tabi demirbaş cihazlar için hastaneden **envanter bildirimi** istiyor. Ekonomik ömrünü dolduran ya da kaybolan cihaz için de ayrı bir bildirim (HEK/zayiat) var ([TİTCK Tekil Hareket Bildirimleri Kılavuzu, md. 8, 15](https://titck.gov.tr/storage/Archive/2022/legislation/HAREKETKILAVUZUimzal_9f4df8fa-1a58-4b4c-84ca-66da9e70cf41.pdf)). Bu bildirimleri HBYS ya da malzeme yönetimi yazılımı yapıyor. **Klinorbis ÜTS'ye bildirim yapmaz**. Yalnız "ÜTS bildirimi yapıldı mı" bayrağını tutar.

İncelenen iki hastane prosedüründe de aynı açık var. Erciyes'te arıza HBYS'deki "Arıza Bildirim Formu" ile biyomedikale açılıyor. Biyomedikal çözemezse dış servis isteği başhekimlik onayına gidiyor, garanti tarihleri izleniyor. Ama **yedek cihaz ve etkilenen birimlere haber verme adımı tarif edilmemiş** ([Erciyes MC.PR.02](https://hastaneler.erciyes.edu.tr/Files/procedure/fdab7f6f-8b7c-41dd-91c4-a399ae4172e9.pdf)). Yakın Doğu'nun prosedürü daha ayrıntılı: QR kodlu cihaz etiketi; cihazların "servis sözleşmeli / garantili / konsinye / sözleşmesiz" diye gruplanıp tamir sorumlusunun buna göre belirlenmesi; geri çağırmada kullanıcılara bildirim. Ama bu prosedürde de **müdahale süresi (SLA), yedek cihaz, sıradan arızada birimlere haber verme ve sözleşme bitiş uyarısı yok** ([YDÜ BIO_P_01](https://jci.med.neu.edu.tr/TEMOS/09_BIYOMEDIKAL/PROSEDURLER/BIO_P_01_BIYOMEDIKAL_TIBBI_CIHAZ_YONETIM_PROSEDURU.pdf)). Global bakım yazılımlarında ise bunlar standart. Brightly'de "alternatif cihaz planlaması" ve geri çağırma durumu, TRIMEDX'te geri çağırma için otomatik iş emri, Accruent'te cihaz duruş süresi raporu var ([IntuitionLabs CMMS karşılaştırması](https://intuitionlabs.ai/articles/healthcare-cmms-platform-comparison)). Klinorbis'in biyomedikal tarafındaki farkı bu açığı kapatmak olmalı: **cihaz kullanılamaz hale gelince kimin haberdar olacağı**.

**Cihaz durum modeli [Öneri, renkler yönetmelikten]:**

- **Kayıtlı:** kabul bekliyor.
- **Kullanımda – yeşil.**
- **Sınırlı kullanım – sarı:** kısıtlı fonksiyonlar listelenir ve 6 aylık sayaç başlar.
- **Arızalı, kullanım dışı – kırmızı.**
- **Serviste:** iç ya da dış servis.
- **Test bekliyor**, ardından tekrar **kullanımda**.
- Yan durumlar: **planlı bakımda**, **geri çağrıldı**, **ödünç verildi**, **hurdaya ayrıldı** (ÜTS bildirimi yapıldı mı?).

**Arıza iş emri durumları [Öneri]:** açıldı (birim, QR ile) → biyomedikal kabul etti → atandı (iç teknisyen ya da servis firması) → inceleniyor → bekliyor (parça / firma / başhekimlik onayı) → çözüldü, test gerekli → kapatıldı (rapor eklendi) ya da iptal. Her geçişte zaman damgası tutulur. Duruş süresi ve servis firmasının SLA'sı bu damgalardan hesaplanır.

**Cihaz kullanılamaz olunca [Öneri]:** Cihaz kırmızıya ya da "serviste" durumuna geçince sistem, cihazı kullanan birimlere **idari bildirim** gönderir. Örnek: "MR-1 tahminen 16:00'ya kadar kapalı. Servis firması X, sözleşmeli müdahale süresi 8 saat. Yedek cihaz: yok." Bildirimin alıcıları cihaz kaydında tanımlıdır: radyoloji sekreterliği, acil sorumlu hemşiresi, randevu birimi gibi. Randevuları kaydırmak ya da hastayı başka kuruma yönlendirmek **insanın kararıdır**. Klinorbis bu kararın verildiğini kaydeder. **Hangi hastanın randevusunun kaydırılacağını sistemin seçmesi yapılmaz.** Bu hem gerçek hasta verisi hem hasta yönlendirmesi demektir (karar-sözleşme). Kritik bir cihazın yedeği yoksa ve sözleşme bitişine 60 gün kaldıysa, bu bilgi biyomedikal sorumlusunun listesinin başına çıkar.

**Cihaz kaydının asgari alanları [Öneri]:** cihaz kodu, cihaz adı (GMDN: uluslararası genel cihaz adlandırma kodu, isteğe bağlı), marka, model, seri no, ÜTS kimliği (isteğe bağlı), konum (oda ya da birim kodu), sahiplik (demirbaş / konsinye / kiralık), servis firması, sözleşme ya da garanti bitişi, sözleşmeli müdahale süresi (saat), son ve sonraki bakım tarihi, son ve sonraki kalibrasyon tarihi, etiket rengi, kritik mi, yedeği var mı, etkilenen birimler listesi.

## Personel, vardiya ve görev devri: klinik devir HBYS'de kalır, operasyon devri Klinorbis'te

Nöbet devri hekim ile hemşire ya da hemşireler arasında, önce hemşire masasında, sonra hasta başında, birime özgü bir formla yapılıyor. Formun içeriği büyük ölçüde klinik: yatış nedeni, tedavi, bakım planı. Ama operasyonel kalemler de var: demirbaş takibi, acil arabası kontrolü, sıcaklık-nem-temizlik formu ([YDÜ BHK_P_15](https://jci.med.neu.edu.tr/TEMOS/08_BASHEKIMLIK/PROSEDURLER/BHK_P_15_RV00_NOBET_DEGISIMLERINDE_HASTA_TESLIM_PROSEDURU.pdf)). SKS de hemşire nöbet teslimi için yazılı düzenleme istiyor ([SHKS 01.02.04](https://www.saglikaktuel.com/d/file/ek1shkshastane.pdf)). **SBAR** (Durum–Geçmiş–Değerlendirme–Öneri; hasta hakkında klinik bilgiyi yapılandırılmış biçimde aktarma formatı) klinik içerik taşır ve kapsam dışıdır. SBAR tanımı bu araştırmada birincil kaynaktan alınmadı, genel bilgidir.

**Operasyon devri [Öneri].** Sistem vardiya bitiminden 30 dakika önce devri otomatik olarak hazırlar. Devralan kişi "okudum, devraldım" der ve bu zaman damgasıyla kaydedilir. Devrin içeriği:

1. Birimin yatak özeti: dolu, hazır, kirli, temizlikte, bloke (nedeniyle: arıza ya da izolasyon temizliği).
2. Gelenler: bu birime yönlendirilmiş, yatış kararı verilmiş hasta sayısı ve 2 saat sayaçları.
3. Gidenler: beklenen taburcu ve transferler (yatak koduyla, tanı olmadan).
4. Açık işler: temizlik, taşıma, teknik, bilgi işlem. Gecikenler kırmızı gösterilir.
5. Eskalasyondaki işler ve şu an kimde oldukları.
6. Ekipman notları: arızalı cihaz var mı, acil arabası kontrolü yapıldı mı (yalnız evet/hayır).
7. Serbest not **kapalıdır**. Açılırsa üstünde "hasta bilgisi yazmayın" uyarısı durur (KVKK).

Önceki incelemeye (10.11) göre bugünkü kodda **üç ayrı vardiya devri modeli** var. Bunlar tek modele indirilmeli.

**Vardiya saatleri.** Türk özel hastanelerindeki hemşire ve hekim vardiya düzeni (08–16 / 16–08, 08–20 / 20–08 gibi) için birincil kaynak **bulunamadı**. Bu yüzden vardiya saatlerini **hastane tanımlar**, ürün sabit bir düzen dayatmaz. KSÜ prosedürüne göre servis hemşiresi, birim sorumlu hemşiresinin aylık çalışma listesine göre atanıyor ([KSÜ HB.PR.25](https://hastane.ksu.edu.tr/depo/belgeler/HB.PR.25%20YATAN%20HASTA%20PROSED%C3%9CR%C3%9C_2209011139491563.pdf)). Klinorbis aylık listeyi yalnız içe alır (Excel). Vardiya planlama motoru ilk sürümde yapılmaz.

**Roller ve yetkiler [Öneri].** Bugünkü 6 rolün yerine hastanenin kendi dilini kullanan 9 rol önerilir. "Klinik Rol" adı kalkar.

| Rol | Görür | Yapar | Göremez |
|---|---|---|---|
| Hekim | Kendi hastalarının operasyon durumu (yatak bekliyor mu, transfer nerede), konsültasyon kuyruğu | HBYS'den gelmiyorsa olay girişi: yatış kararı saati, taburcu istemi saati. Transfer talebine kabul/ret. | Personel performansı |
| Servis sorumlu hemşiresi | Birimin yatak panosu, açık işler, devir | Taşıma, temizlik ve teknik istek açar. "Hasta ayrıldı" girer. Temizlik kontrolünü onaylar. Devri imzalar. | Başka birimlerin listeleri |
| Servis hemşiresi | Birimin yatak panosu, kendi açtığı işler | İstek açar, "hasta ayrıldı" girer | Kontrol onayı |
| Sekreter / hasta kabul (mesai dışında acil sekreteri) | Kayıt kuyruğu, eksik taburcu dosyaları | Kayıt durumu, fatura devri, mesai dışında olay girişi | Klinik içerik |
| **Temizlik personeli** (yeni) | Yalnız kendi işleri: oda/yatak kodu, "özel temizlik gerekli" işareti, öncelik | Kabul → başladı → bitti (QR ile) | Hasta adı, tanı |
| **Hasta taşıma personeli** (yeni) | Yalnız kendi işleri: nereden-nereye, sedye ya da tekerlekli sandalye, oksijen veya monitör gerekli mi (evet/hayır) | Kabul → hastayı aldım → teslim ettim. "Kimlik bileklikten doğrulandı" kutusu. | Tanı, tedavi |
| Teknik / biyomedikal / bilgi işlem | Arıza iş emirleri, yer kodu, cihaz kodu | Kabul → çözüldü → blokajı kaldır | Hasta verisi |
| Birim ya da destek hizmetleri yöneticisi | Ekibinin iş yükü, süreler, eskalasyonlar | Elle atama yapar, kural ve hedef önerir | Klinik içerik |
| Başhekim / hastane müdürü / kalite | Göstergeler, raporlar, denetim izi | Kuralları ve hedefleri onaylar | Kişi bazında gereksiz hasta verisi |

Teslimde hasta kimliğinin doğrulanması SKS şartı ("Tanı ve tedavi için yapılacak tüm işlemlerde hasta kimliği doğrulanmalıdır", [SHKS 01.01.20–21](https://www.saglikaktuel.com/d/file/ek1shkshastane.pdf)). Bu doğrulama **bileklikten fiziksel olarak** yapılır. Sistem yalnız "iki kimlik bilgisi bileklikten doğrulandı" kaydını tutar. Bugünkü koddaki "PRS-SIM-…" alıcı kodu ve "iki kimlik unsuru" dili sahada kullanılmıyor, sadeleştirilmeli.

## Hasta bilgisi ekranı: destek personeli yatak kodunu görür, hasta adını görmez

**Kişisel Sağlık Verileri Hakkında Yönetmelik**, sağlık personelinin verilere "verilecek olan sağlık hizmetinin gereği ile sınırlı olmak kaydıyla" erişebileceğini söylüyor. Gizlilikte "sadece görevi gereği bilmesi gereken kişiler" ilkesini koyuyor ve basılı belgelerde maskeleme gibi tedbirler öngörüyor. Ama rol modeli ya da log saklama süresi tanımlamıyor. Bunları Bakanlığın Bilgi Güvenliği Politikaları Yönergesi'ne ve KVKK'nın Kişisel Veri Güvenliği Rehberi'ne bırakıyor ([Yönetmelik, RG 21.06.2019/30808, değişiklik RG 03.12.2025/33096, md. 5, 6, 12, 18, 19](https://bezmialem.edu.tr/tr/Documents/kisisel-saglik-verileri-hakkinda-yonetmelik-01-06-2026.pdf)). Bakanlık yönergesinin metni bu araştırmada açılmadı. Bu yüzden log saklama süresi **doğrulanamadı**. SKS ise HBYS'de yetkilendirme yapılmasını ve "işlemlerin izlenebilir olması"nı istiyor ([SHKS 01.06.11–12](https://www.saglikaktuel.com/d/file/ek1shkshastane.pdf)).

Tasarımın sonucu şu: **Klinorbis hasta adı ve tanı tutmadan çalışabilir.** Yatak kodu ve HBYS'nin verdiği ya da Klinorbis'in ürettiği **anonim iş kodu** yeterli. Bu, KVKK riskini de satış sırasındaki itirazları da azaltır. Dolaylı sağlık verisine de dikkat edilmeli. "İzolasyon tipi" bile hastanın hastalığını ele verebilir. Temizlik ve taşıma ekranında yalnız "özel temizlik gerekli" ya da "özel önlem gerekli" işareti ve uygulanacak protokolün kodu görünür. Nedeni görünmez (çıkarım).

**Görünürlük matrisi [Öneri]**

| Alan | Hekim | Servis hemşiresi | Sekreter / kabul | Taşıma | Temizlik | Teknik / BT | Yönetici (rapor) |
|---|---|---|---|---|---|---|---|
| Yatak ve oda kodu | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (yer olarak) | ✓ |
| Hasta adı soyadı | ✓ | ✓ | ✓ | Baş harfler + doğum yılı (hastane açarsa) | ✗ | ✗ | ✗ (yalnız toplu sayı) |
| T.C. kimlik no | Yalnız HBYS'de | Yalnız HBYS'de | ✓ | ✗ | ✗ | ✗ | ✗ |
| Tanı, tedavi, tetkik içeriği | Klinorbis'te hiç yok | Klinorbis'te hiç yok | ✗ | ✗ | ✗ | ✗ | ✗ |
| "Özel temizlik / özel önlem gerekli" işareti | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | Sayı |
| Taşıma gereksinimi (sedye, oksijen, refakat) | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | Sayı |
| İş durumu ve süreleri | ✓ | ✓ | Kendi işleri | Kendi işleri | Kendi işleri | Kendi işleri | ✓ |

**Denetim izi [Öneri].** (Denetim izi: kimin, ne zaman, hangi kaydı görüp değiştirdiğinin kaydı.) Her görüntüleme ve her durum değişikliği için şunlar tutulur: kullanıcı, rol, zaman, kayıt kimliği, eski ve yeni değer, cihaz ya da IP. Kayıtlar yalnız eklenebilir, değiştirilemez ya da silinemez. Yönetici ve KVKK sorumlusu "bu yatağın kaydını kim açtı?" sorgusunu yapabilir. Saklama süresini hastanenin bilgi güvenliği politikası belirler, çünkü yönetmelikte bir süre yok. Gerçek veriyle çalışma sırasında SBYS Yönetmeliği'nin güvenlik kaydı saklama şartları da devreye girer ([Alomaliye, SBYS (10.11)](https://www.alomaliye.com/2022/08/25/saglik-bilgi-yonetim-sistemleri-hakkinda-yonetmelik/)). Bu konu karar-sözleşme niteliğinde.

## HBYS ile ilişki: kayıt sistemine dokunma, olaylarını dinle

Türk HBYS'leri yatak haritası, yatış, servis değişikliği ve taburcu gibi temel işleri zaten yapıyor. Bazılarında oda durumu ve taşıyıcı görev emri bile var: Bilmed'de "oda hazır" bildirimi ve taşıyıcı görev emri, Softmed'de ertesi gün boşalacak yatak listesi ([Bilmed (10.11)](https://www.bilmed.com.tr/bilmedical-hbys/), [Softmed (10.11)](https://softmedyazilim.com/blog/yatan-hasta-yonetimi-ve-yatak-doluluk-takibi)). Ama önceki incelemede uçtan uca süre, eskalasyon ve komuta ekranı görülmedi. Hastaneler cihaz envanterini ve arıza bildirimini de HBYS içinde tutuyor ([Erciyes](https://hastaneler.erciyes.edu.tr/Files/procedure/fdab7f6f-8b7c-41dd-91c4-a399ae4172e9.pdf), [YDÜ](https://jci.med.neu.edu.tr/TEMOS/09_BIYOMEDIKAL/PROSEDURLER/BIO_P_01_BIYOMEDIKAL_TIBBI_CIHAZ_YONETIM_PROSEDURU.pdf)). Bakanlık sistemlerine veri gönderen taraf HBYS. Bu sistemler Sağlık-Net/e-Nabız (kişisel sağlık kaydı), MEDULA (SGK faturası) ve MHRS (merkezi randevu). Kamu HBYS şartnameleri HL7 ile KPS, MEDULA, PACS, LIS, MHRS ve e-Nabız entegrasyonunu istiyor ([MCBÜ şartnamesi (10.11)](https://ihaleilani.mcbu.edu.tr/IhaleBelgeleri/Ihaleler/20-11-2023_09-01-50_ihale/1_MCB%C3%9C_HSH_HBYS_TEKNIK_SARTNAME-09112023.pdf)). Bakanlığın ortak kod listeleri **SKRS** üzerinden web servisle dağıtılıyor ([Ülgü ve ark., 2018](https://medipol.edu.tr/sites/default/files/document/SD_46_14-17.sayfalar_Mahir_Ulgu_Esra_Mus_Filiz_Isleyen_0.pdf)).

**Kural:** Klinorbis Sağlık-Net, e-Nabız, MEDULA ya da MHRS'ye **hiçbir zaman doğrudan veri göndermez**. Bu, HBYS'nin ve KTS'de kayıtlı yazılımın işi. (KTS: Bakanlığın sağlık yazılımlarını ve firmalarını kaydettiği sistem.) Bir cihaz arızası nedeniyle MHRS randevularının kaydırılması HBYS ya da MHRS üzerinden, insan eliyle yapılır. MHRS'nin üçüncü taraf yazılımlara API açıp açmadığı **doğrulanamadı**.

**Entegrasyon basamakları [Öneri]:**

- **Basamak 0, entegrasyonsuz (pilot):** Oda ve yatak listesi Excel'den yüklenir. Her yatağa, odaya ve cihaza bir QR etiketi yapıştırılır. Temizlik personeli QR'ı okutup "başladım / bitti" der. Servis sekreteri "hasta ayrıldı" düğmesine basar. **Hasta kimliği hiç tutulmaz.** KVKK ve tıbbi cihaz riski en düşük basamak bu.
- **Basamak 1, tek yönlü HL7 v2 ADT dinleme:** ADT, hastanın yatış, servis değişikliği ve taburcu olaylarını bildiren HL7 v2 mesaj ailesidir. Dinlenecek olay kodları: A01 yatış, A02 transfer, A03 taburcu, A11/A12/A13 bunların iptali, A17 iki hastanın yatak değiştirmesi, A21/A22 izin çıkışı ve dönüşü ([HL7 Tablo 0003](https://terminology.hl7.org/1.0.0/CodeSystem-v2-0003.html)). Yatak durumu bu olaylarla otomatik güncellenir. Klinorbis HBYS'ye yazmaz.
- **Basamak 2, FHIR:** FHIR, verileri "Encounter" (hastanın kurumdaki bir yatış dönemi), "Location" (oda, yatak, servis) ve "Task" (yapılacak bir işin durumunu izleyen kayıt) gibi standart paketlerle alıp veren modern standarttır. Bu basamakta Encounter ve Location okunur, Task yazılır ([FHIR Task](https://hl7.org/fhir/task.html)). Encounter ve Location sayfaları açılmadı. Türk HBYS'lerinin FHIR ya da HL7 v2 arayüzü sunup sunmadığı ve ücreti **doğrulanamadı**.

Gerçek hasta verisinin (ad, T.C. kimlik no) Klinorbis'e girdiği her basamak **karar-sözleşme** niteliğinde. Gerekenler: veri işleme sözleşmesi, yurt içinde barındırma ve KTS durumunun netleşmesi. SBYS Yönetmeliği verilerin "yalnızca yurt içinde" saklanmasını istiyor. 3.7.2026 değişikliği KTS kaydındaki bazı belge şartlarını kaldırdı, ama kamu alımlarında KTS yetki belgesi şartı sürüyor ([Alomaliye 2026 değişikliği (10.11)](https://www.alomaliye.com/2026/07/03/saglik-bilgi-yonetim-sistemleri-hakkinda-yonetmelikte-degisiklik-03-07-2026/), [Erdem & Erdem (10.11)](https://www.erdem-erdem.av.tr/saglik-bilgi-yonetim-sistemleri-hakkinda-yonetmelikte-degisiklik-yapildi)). Hasta verisi kullanmayan bir pilotun KTS gerektirip gerektirmediği **doğrulanamadı**. Bu soru Sağlık Bilgi Sistemleri Genel Müdürlüğü'ne yazılı olarak sorulmalı.

## Rakipler: büyükler komuta merkezi satıyor, Türkiye'de ayrı bir operasyon katmanı bulunamadı

Global ürünlerin ortak ekran seti dört parçadan oluşuyor: **yatak panosu, taşıma dağıtım kuyruğu, temizlik personelinin mobil görev listesi ve komuta merkezi duvar ekranı**. **TeleTracking** bu işleri ayrı modüllere bölüyor: anlık yatak durumu ve oda temizlik talebi (BedTracking), taşıma yönetimi, temizlik iş akışı otomasyonu, mobil bildirim ve "çoğunlukla HL7 arayüzüyle" HBYS entegrasyonu ([IntuitionLabs TeleTracking](https://intuitionlabs.ai/software/pdfs/teletracking.pdf)). 900'den fazla hastanede kullanılıyor ve fiyatı teklifle veriliyor ([TeleTracking (10.11)](https://www.teletracking.com/)). Ekran düzeni ve renk kodları **doğrulanamadı**. **Epic**'te temizlik talepleri izolasyon bilgisine göre protokol alıyor ve beceri ile önceliğe göre atanıyor. Taşıma işleri yakınlık ve önceliğe göre atanıyor. Parkview'da yatak başına devir süresi 7 dakika kısalmış ([Epic (10.11)](https://www.epic.com/software/hospital-patient-flow/)). **Alcidion Miya**'da gerçek zamanlı yatak görünümü, varıştan taburcuya hasta yolculuk panosu ve yatak başında mobil hasta özeti var ([Healthcare IT News](https://www.healthcareitnews.com/news/asia/mobile-patient-flow-system-improves-patient-experience-palmerston-north-hospital)). İngiltere kamu alım kataloğundaki fiyatı birim başına yılda **£385.000** ([G-Cloud (10.11)](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/305752473777003)). Smartpage modülü **doğrulanamadı**. **Qventus** darboğaz tahmini yapıyor, fiyat yayımlamıyor. Bu bilgi taraflı bir kaynaktan ([Keragon (10.11)](https://www.keragon.com/blog/qventus-alternatives)), ekranları **doğrulanamadı**. **Oracle Health (Cerner)** kapasite yönetimi için birincil kaynak açılmadı, **doğrulanamadı**.

Türkiye'de **Borda** konum takibi (RTLS: binada kişi ve cihazların yerini gösteren donanım sistemi) ve konuma duyarlı iş talebi yönetimi sunuyor. 90 günlük "$0" pilot, 7 günde canlıya geçiş vaadi var ve şehir hastanelerini referans gösteriyor ([Borda (10.11)](https://bordatech.com/)). İş talebi ekranı **doğrulanamadı**. Yerli HBYS'lerden Bilmed, Softmed, Nucleus ve Medisoft'ta yatak işlevleri var, ama ayrı bir süre ve eskalasyon katmanı görülmedi (önceki inceleme). Probel, Sisoft, Fonet, Akgün ve Enlil/Pusula'nın modül listeleri **doğrulanamadı**.

Rakiplerden alınacak ders [Öneri]: Hasta bazında tahmin ve klinik önceliklendirme (GE'nin 72 saatlik tahmini, Epic'in beklenen yatış süresi gibi) Klinorbis'te yapılmaz, bunlar klinik sınırı aşar. Kurum düzeyinde sayım ise yapılabilir, örneğin "yarın planlanmış taburcu sayısı". Borda'nın "donanımsız, kısa, ücretsiz pilot" beklentisi Türk pazarının giriş eşiğini belirliyor. Klinorbis'in pilotu da **QR etiket + telefon + Excel'den yüklenen yatak listesi** ile bir haftada kurulabilecek kadar sade olmalı.

## B) Klinorbis ekran listesi

Ekranlar 22 menü maddesinden 12 ekrana iniyor. Bugünkü "İşlerim" ekranının "tek büyük düğme + sonraki adım" yaklaşımı doğru ve bütün iş ekranlarına taşınmalı. Aynı iş için bugün beş farklı fiil kullanılıyor (Üstlen, Kabul et, İşleme al, Başla, Başlat). Bunların yerine **tek bir fiil dizisi** kullanılmalı: **Kabul et → Başla → Bitir** ([app/my-work.tsx](https://github.com/ekremalann-sketch/Klinorbis/blob/main/app/my-work.tsx)). Tablonun tamamı **[Öneri]**.

| # | Ekran | Amacı | Kim görür | Tek ana düğme | Boş durumda ne gösterir |
|---|---|---|---|---|---|
| 1 | **Bugün** (rol başına açılış ekranı) | Kişinin şu an yapması gereken işleri öncelik sırasıyla gösterir | Herkes, kendi rolüne göre | Sıradaki işin düğmesi (ör. "Kabul et") | "Şu an üzerinizde iş yok. Yeni iş gelince bu ekranda ve telefonunuzda görünecek." |
| 2 | **Yatak panosu** | Servis × oda × yatak ızgarası. Her karoda durum rengi ve "bu durumda kaç dakikadır" sayacı. Hasta adı yok. | Servis hemşiresi, sorumlu hemşire, acil, yönetici | "Hasta ayrıldı" (seçili yatakta) | "Henüz yatak tanımlı değil. Yatak listesini Excel'den yükleyin." + "Örnek listeyi indir" |
| 3 | **Temizlik işlerim** (telefon) | Kendi temizlik işleri ve öncelikleri | Temizlik personeli | QR okut → "Başla" / "Bitir" | "Bekleyen temizlik işi yok." |
| 4 | **Temizlik kontrolü** | Biten temizliğin başka biri tarafından onaylanması | Sorumlu hemşire, temizlik şefi | "Kontrol edildi, yatak hazır" | "Kontrol bekleyen yatak yok." |
| 5 | **Taşıma işlerim** (telefon) | Nereden-nereye, araç tipi, öncelik | Taşıma personeli | "Kabul et" → "Hastayı aldım" → "Teslim ettim" | "Bekleyen taşıma yok." |
| 6 | **Taşıma dağıtım** | Bekleyen talepler ve boştaki taşıyıcılar, elle atama | Taşıma lideri, destek hizmetleri müdürü | "Ata" | "Bütün talepler atanmış." |
| 7 | **Transfer talepleri** | Servis ↔ yoğun bakım talepleri, alıcının cevabı, süre | Hekim, sorumlu hemşire, nöbetçi idari uzman | "Kabul et" / "Reddet (gerekçe)" (yalnız yetkili hekim) | "Açık transfer talebi yok." |
| 8 | **Arıza ve cihazlar** | QR ile arıza açma, cihaz durumu, servis firması ve süre sayacı, etkilenen birimler | Herkes arıza açar. Biyomedikal ve teknik servis yönetir. | "Arıza bildir" | "Kayıtlı cihaz yok. Cihaz listesini Excel'den yükleyin." |
| 9 | **Operasyon devri** | Vardiya sonunda otomatik özet, devralanın onayı | Sorumlu hemşire, ekip liderleri | "Devraldım" | "Bu vardiyada devredilecek açık iş yok." |
| 10 | **Komuta ekranı** (duvar) | Doluluk, hazır yatak sayısı, 2 saat ve 8 saat sayaçları, bekleyen işler, kırmızı etiketli kritik cihazlar | Yönetici, nöbetçi idari uzman, duvar ekranı | — (salt görüntü) | "Bugün için veri yok. Olaylar girildikçe dolacak." |
| 11 | **Raporlar** | Haftalık süreler (kirliden hazıra, karardan servise, taşıma kabul ve teslim, cihaz duruşu), eskalasyon sayıları, CSV çıktısı | Başhekim, müdürler, kalite | "Raporu indir" | "Rapor için en az 1 günlük veri gerekiyor." |
| 12 | **Ayarlar** (birimler, yataklar, kurallar, roller, vardiya listesi, denetim izi) | Kurulum ve kural tablosu | Yalnız yönetici | "Kaydet" | Kurulum sihirbazının kaldığı adım |

**Kaldırılan ya da birleşen ekranlar:** Ortak iş kutusu, İşlerim ve Birimim tek bir "Bugün" ekranında birleşir. Kapasite ve transfer ekranı yatak panosuyla transfer talepleri arasında bölünür. Sanal hastane ile simülasyon tek bir demo verisi düğmesine iner. Hasta talepleri, randevu, hekim yokluğu ve çağrı/konuşmalar ürün tanımının dışında kalır, menüden kalkar. Canlı otomasyon, operasyon akışları, entegrasyon sağlığı ve 98 birimlik yönlendirme listesi Ayarlar'ın altına taşınır.

## C) Klinorbis veri modeli (sade dille) [Öneri]

- **Hastane** binalardan ve katlardan oluşur. Katta **birimler** vardır: acil, servis, yoğun bakım, ameliyathane, laboratuvar, radyoloji, eczane, sterilizasyon, temizlik, taşıma, teknik, biyomedikal, bilgi işlem, hasta hakları, vezne. Birimde **odalar**, odada **yataklar** bulunur. Yatağın bir durumu vardır (dolu / kirli / temizlikte / kontrol bekliyor / hazır / bloke) ve bloke ise bir nedeni vardır.
- **Ziyaret (epizot):** Hastanın hastanede geçirdiği tek bir dönem. Anonim bir iş kodu, giriş tipi (randevu / acil / sevk), HBYS referans numarası (kimlik HBYS'de kalır), şu anki yatak ve olay zamanları tutulur: geldi, kayıt, muayene, yatış kararı, servise varış, taburcu istemi, odadan ayrılış.
- **Olay:** "Bir şey oldu" kaydı. Kaynağı HBYS, elle giriş ya da QR olabilir. Tipi (yatış kararı verildi, taburcu istemi, hasta ayrıldı, transfer talebi…), zamanı ve giren kişi tutulur. **Klinik kararın içeriği değil, yalnız verildiği ve zamanı tutulur.**
- **İş (iş emri):** Bir olaydan ya da elle açılır. Tip, hedef birim, atanan kişi, öncelik ve önceliği seçen kişi, yer (yatak / oda / cihaz kodu) tutulur. Durumları: açık → atandı → kabul → başladı → bitti → kontrol edildi, ya da iptal veya gerekçeli ret. Hedef süreler, gerçek zaman damgaları ve eskalasyon basamağı da kaydedilir.
- **Kural:** İş tipini hedef birime, önceliğe, kabul ve bitirme hedefine ve eskalasyon zincirine bağlar. Mesai dışı için ayrı hedef içerir.
- **Personel:** Rol, bağlı olduğu birimler, beceriler (izolasyon temizliği, sedye) ve aktif/pasif durumu. **Vardiya:** personel, birim, başlangıç-bitiş ve nöbetçi olup olmadığı. Saatleri hastane tanımlar.
- **Devir:** Birim, veren, alan, otomatik özetin o anki kopyası ve onay zamanı.
- **Transfer talebi:** Gönderen birim, alıcı birim, talep eden, talep saati, **alıcı hekimin kararı (kabul ya da ret + gerekçe) ve karar saati**. Sistem kararı hiçbir zaman kendisi doldurmaz.
- **Cihaz:** Kod, ad, marka, model, seri no, konum, sahiplik, servis firması, sözleşme bitişi, müdahale süresi, bakım ve kalibrasyon tarihleri, etiket rengi, kritiklik, yedek durumu, etkilenen birimler. **Arıza iş emri**, İş kaydının cihaza bağlı bir türüdür.
- **Bildirim:** Alıcı, kanal (uygulama / SMS / e-posta), ilgili iş ve okunma zamanı.
- **Başvuru:** Hasta hakları ya da QR geri bildirimi. Yer, tip, durum ve yönlendirildiği birim tutulur.
- **Denetim izi:** Kullanıcı, rol, eylem (gördü / değiştirdi), kayıt, eski ve yeni değer, zaman, cihaz. Yalnız eklenebilir.
- **Gösterge:** Ayrı bir tablo değildir, olaylardan hesaplanır. Kayıttan muayeneye dakika, karardan servise dakika, acilde 8 saati aşan hasta oranı, kirliden hazıra dakika, taşıma kabul ve teslim dakikası, doluluk ve devir hızı, eskalasyon sayısı.

## D) Klinorbis özellik tablosu

| # | Özellik | Neden gerekli | Hangi rakipte var | Öncelik | Zorluk | Tür | Bitti sayılma ölçütü |
|---|---|---|---|---|---|---|---|
| K1 | Yoğun bakım transferinde otomatik kabul/ret ve otomatik kampüs yönlendirmesini kaldırmak, yerine insan kararı + kayıt koymak | Tıbbi cihaz sınırı (MDCG Ek I(d), (f.1), Kural 11a) | — | 1 | orta | **karar-sözleşme** + kod | Kodda otomatik karar yolu kalmadı. Kabul/ret yalnız yetkili hekim düğmesiyle yapılıyor. Test bunu doğruluyor. |
| K2 ✅ #55 | Serbest metinden acil ya da öncelik çıkarmayı kaldırmak, "Klinik triyaj rolü" adını silmek | Tıbbi cihaz sınırı | — | 1 | kolay | **karar-sözleşme** + kod | Metin yorumlanmadan iletiliyor. Öncelik alanının kaynağı "talep eden personel". |
| K3 ✅ #56 | Her modüle kullanım amacı beyanı ve yasaklı kelime taraması | Rehber §7: modül sınırını üretici çizer | — | 1 | kolay | tasarım + **karar-sözleşme** | Her ekranın başında beyan var. "Triyaj / erken uyarı / klinik öneri" metinlerde geçmiyor. |
| K4 ✅ #60 | Temizlik ve taşıma rolleri, telefonda tek düğmeli iş ekranları | Zincirin yarısı bu iki rolde | Epic Rover, TeleTracking, Infinity | 1 | orta | kod | Temizlik personeli QR okutup işi telefonda 3 dokunuşla bitirebiliyor |
| K5 ✅ #58 | Yatak panosu: durum renkleri ve dakika sayacı, hasta adı olmadan | Ürünün ana ekranı | TeleTracking BedTracking, Miya, Softmed (harita) | 1 | orta | kod + tasarım | 6 durum görünüyor. Her karo kaç dakikadır o durumda olduğunu gösteriyor. |
| K6 ✅ #59 | "Hasta ayrıldı" → otomatik temizlik işi → kontrol → hazır zinciri. Transferden sonra da temizlik işi açılmalı. Hazır yatak 15 dakika sonra kendiliğinden düşmemeli. | Bugünkü iki hata zinciri koparıyor | Epic Rover | 1 | orta | kod | Zincir iki kullanıcıyla, gizli menü olmadan baştan sona yürüyor |
| K7 ✅ #63 | Kural tablosu ve eskalasyon (kişi → lider → yönetim), bildirim birleştirme | Telefonla yürüyen işi izlenebilir yapar | Hastanem Temiz, Infinity, Rover | 1 | orta | kod | Hedefi aşan iş doğru kişiye gidiyor. Aynı yatak için tek bildirim çıkıyor. |
| K8 ✅ #64 | Ekran kapalıyken de çalışan bildirim (web push ya da SMS) | Bugün bildirim yalnız sekme açıkken çalışıyor | TeleTracking, Rover (mobil) | 1 | orta | kod (SMS sağlayıcısı: **karar-sözleşme**) | Kilitli telefona iş bildirimi geliyor |
| K9 ✅ #62 | 2 saat ve 8 saat sayaçları (acil ve yatak panosunda) | Mevzuatta sayıyla verilmiş tek süreler | — (Türk mevzuatına özgü) | 1 | kolay | kod | Yatış kararı girilince sayaç başlıyor, 90. ve 120. dakikada uyarı çıkıyor |
| K10 ✅ #61 | Excel'den yatak, oda ve cihaz yükleme; QR etiket basma | Entegrasyonsuz pilot | Bakanlık QR Temizlik | 1 | kolay | kod | 100 yataklık liste 5 dakikada yükleniyor, QR sayfası yazdırılabiliyor |
| K11 | Denetim izi (görüntüleme dahil), yalnız eklenebilir | SKS izlenebilirlik, KVKK | Kamu şartnameleri, Nervecentre | 1 | orta | kod | "Bu yatağın kaydını kim açtı" sorgusu çalışıyor |
| K12 | Görünürlük matrisi (destek personeli hasta adı görmez) | En az veri ilkesi | — | 1 | orta | kod + **karar-sözleşme** | Temizlik ve taşıma hesabıyla hasta adı hiçbir ekranda görünmüyor |
| K13 | Demo verisi: "taburcudan hazır yatağa" turu, 3–4 adımda | Satış görüşmesinin omurgası | Borda (kısa pilot) | 1 | kolay | tasarım + kod | Tek hesapla, rol değiştirerek 5 dakikada gösterilebiliyor |
| K14 ✅ #57 | Menüyü 22 maddeden 12 ekrana indirmek, ürün dışı ekranları kaldırmak | Sadelik | — | 1 | orta | tasarım + kod | Menüde yalnız B listesindeki ekranlar var |
| K15 | Transfer talebi ekranı: insan kabulü, gerekçeli ret, süre ve eskalasyon | Yoğun bakım ve servis arasında en çok bekleyen iş | TeleTracking (Transfer Center — **doğrulanamadı**) | 1 | orta | kod | Talep → kabul → taşıma işi otomatik açılıyor |
| K16 | Cihaz kaydı, etiket rengi, arıza iş emri, servis firması süre sayacı | SKS cihaz yönetimi, TİTCK etiket kuralı | Brightly, TRIMEDX, Accruent, Borda | 2 | orta | kod | Kırmızı etiketli cihaz panoda ve komuta ekranında görünüyor |
| K17 | Cihaz kullanılamaz olunca etkilenen birimlere bildirim, yedek cihaz bilgisi | Türk prosedürlerinde bu adım yok | Brightly (alternatif cihaz planlaması) | 2 | orta | kod | Arıza açılınca tanımlı birimlere 1 dakika içinde bildirim gidiyor |
| K18 | Kalibrasyon ve bakım takvimi, sarı etikette 6 ay sayacı, sözleşme bitiş uyarısı | Yönetmelik md. 24/5 | Accruent | 2 | kolay | kod | 60 gün kala biyomedikal listesinde görünüyor |
| K19 | Operasyon devri (otomatik özet + "devraldım") | SKS nöbet teslimi düzenlemesi | Nervecentre, Bilmed | 2 | orta | kod | Vardiya sonu özeti 30 dakika önce hazır |
| K20 | Komuta (duvar) ekranı | Yöneticinin tek bakışta görmesi | TeleTracking, Miya | 2 | orta | kod + tasarım | 1920 piksel ekranda kaydırmadan okunuyor |
| K21 | Haftalık rapor: kirliden hazıra, karardan servise, taşıma, cihaz duruşu | Pilotun başarı ölçütü | Accruent (duruş), Epic | 2 | kolay | kod | Pilot hastaneye 3 ölçütlü haftalık PDF/CSV gidiyor |
| K22 | Taşıma dağıtım ekranı: elle atama ve cevapsız işin yeniden yönlendirilmesi | Cevapsız çağrı oranını düşürür (Cureus %62) | Cureus örneği, Epic | 2 | orta | kod | Atanmamış iş 5 dakikada otomatik olarak lidere çıkıyor |
| K23 | Mesai dışı rolü (acil sekreteri) ve nöbetçi idari uzman zinciri | Gece yatış ve taburcu bu rolde | — (Türk pratiği) | 2 | kolay | kod | 17:00'den sonra eskalasyon nöbetçiye gidiyor |
| K24 | Aylık nöbet listesini Excel'den içe alma | Vardiyaya göre atama | — | 2 | kolay | kod | Listeden aktif vardiya doğru okunuyor |
| K25 | HL7 v2 ADT dinleme (A01/A02/A03/A11–A13/A17) | Elle girişi azaltır | TeleTracking, Miya | 3 | zor | kod + **karar-sözleşme** (HBYS firması ve hastane) | Test ortamında A03 mesajı yatağı "kirli" yapıyor |
| K26 | Laboratuvar ve radyoloji durum panosu | Tetkik bekleme süresi | — | 3 | zor | kod + **karar-sözleşme** | Yalnız entegrasyonla, durum bilgisi (içerik yok) |
| K27 | Ameliyathane, sterilizasyon ve eczane teslim iş listeleri | Kapsamı genişletir | Epic (ameliyathane) | 3 | orta | kod | Aynı iş emri modeliyle çalışıyor, yeni kavram eklenmedi |
| K28 | Hasta hakları ve QR geri bildirim kuyruğu | SKS hasta hakları birimi | Hastanem Temiz | 3 | kolay | kod | Başvuru ilgili birime düşüyor, kapanış süresi ölçülüyor |
| K29 | Yurt içi barındırma ve kurumsal giriş (ChatGPT girişi yerine) | SBYS md. 16/3, hastane güveni | Bütün hastane yazılımları | 1 (gerçek veri öncesi) | orta | **karar-sözleşme** + kod | Sunucu Türkiye'de, giriş hastanenin kullanıcı yönetimiyle |
| K30 | KTS durumu için Bakanlığa yazılı soru, pilot protokolü, veri işleme sözleşmesi | Gerçek pilot öncesi şart | — | 1 (pilot öncesi) | orta | **karar-sözleşme** | Yazılı cevap ve imzalı protokol |

## E) Klinorbis'te yapılmayacaklar

- **Triyaj rengi ya da puanı hesaplamak, belirtiden aciliyet çıkarmak.** Neden: MDCG Ek I(c.1.2) ve (f.1) ile aynı mantık. Kural 11a'ya göre IIa–III sınıfı tıbbi cihaz olur (mevzuat).
- **Yoğun bakım ya da servis transferini otomatik kabul etmek, reddetmek ya da kampüs seçmek.** Neden: bireysel hastada tedavi düzeyi kararıdır (mevzuat). Bugünkü kod kaldırılır.
- **Vital bulgu, laboratuvar değeri ya da skora dayalı uyarı, anormal sonucu öne alma.** Neden: Ek I(d) ve (f.1) (mevzuat).
- **Hasta bazında taburcu, kötüleşme ya da yatış süresi tahmini (yapay zekâ dahil).** Neden: Rev.1 Kural 11'i tahmine genişletti. Yapay zekâ kullanılırsa AB Yapay Zekâ Yasası da devreye girer (mevzuat).
- **İlaç dozu ve etkileşim kontrolü, klinik hatırlatıcılar.** Neden: tedavi bilgisi üretir (mevzuat).
- **Hastanın klinik durumuna göre yatak ya da servis seçmek.** Neden: bakım düzeyi kararıdır. Yalnız uygun yatakları listelemek yapılır (mevzuat).
- **e-Nabız, MEDULA, MHRS ya da ASOS'a veri göndermek, bu sistemlerin yerine geçmek.** Neden: bu iş HBYS'nin ve KTS'de kayıtlı yazılımın. Sevk yalnız ASOS'tan yürür (mevzuat). MHRS API'si **doğrulanamadı**.
- **ÜTS bildirimi yapmak.** Neden: HBYS ve malzeme yönetimi yapıyor (mevzuat ve kapsam).
- **Klinik nöbet devri (SBAR), hasta adı ya da tanı içeren serbest not.** Neden: klinik içerik ve KVKK'daki en az veri ilkesi (mevzuat).
- **Pilotta gerçek hasta adı, T.C. kimlik no, protokol no, tanı, yaş ya da cinsiyet almak.** Neden: SBYS yurt içi saklama şartı, KTS, KVKK. Gerçek veri ancak sözleşmeden sonra kullanılabilir (sözleşme gerektirir).
- **RTLS donanımı satmak ya da kurmak.** Neden: donanım ve kurulum maliyeti tek kişilik yapıya uymuyor (ücretli servis). Gerekirse Borda gibi bir firmayla ortaklık düşünülür.
- **Vardiya planlama motoru ve bordro.** Neden: hastanenin İK yazılımının işi. Klinorbis aylık listeyi yalnız içe alır (kapsam).
- **Çağrı merkezi, randevu, hekim yokluğu ve hasta talepleri ekranları.** Neden: ürün tanımının dışında, karışıklık yaratıyor (kapsam).

## F) Klinorbis ilk 4 hafta uygulama sırası


- **Hafta 1 — Sınırı temizle.** Şu işler yapılır: K1 (otomatik transfer kararını kaldır, insan kabul/ret ekranına çevir), K2 (serbest metin yönlendirmesini ve "Klinik triyaj rolü"nü kaldır), K3 (kullanım amacı beyanları ve yasaklı kelime taraması), K14'ün ilk adımı (ürün dışı ekranları menüden kaldır). Yeni roller tanımlanır: temizlik, taşıma, sorumlu hemşire, acil sekreteri. "Klinik Rol" adı kaldırılır. **Haftanın sonunda:** Kodda klinik karar üreten hiçbir yol kalmamış ve bunu doğrulayan testler yazılmış olmalı.
- **Hafta 2 — Yatak zinciri.** Şu işler yapılır: K5 (yatak panosu), K6 (ayrılış → temizlik → kontrol → hazır; transferden sonra temizlik; 15 dakikalık düşme hatasının giderilmesi), K4 (temizlik telefon ekranı, QR), K10 (Excel yükleme ve QR basma). **Haftanın sonunda:** Bir yatak, gizli menü kullanmadan iki kişiyle telefondan "kirli"den "hazır"a geçirilebilmeli.
- **Hafta 3 — Taşıma, süre ve eskalasyon.** Şu işler yapılır: K4 (taşıma ekranı), K9 (2 saat ve 8 saat sayaçları), K7 (kural tablosu, eskalasyon, bildirim birleştirme), K8 (ekran kapalıyken bildirim, önce web push), K15 (transfer talebi ekranı). **Haftanın sonunda:** "Yatış kararı → yatak hazır → taşıma → serviste" zinciri sayaçla gösterilebilmeli. 90. dakikada uyarı, 120. dakikada eskalasyon çıkmalı.
- **Hafta 4 — Görünürlük, iz ve demo.** Şu işler yapılır: K12 (görünürlük matrisi), K11 (denetim izi), K13 (5 dakikalık demo turu), K21 (haftalık raporun ilk sürümü). K16 (cihaz arıza akışı) bu haftaya sığmazsa 5. haftaya kalır. **Haftanın sonunda:** Hasta verisi kullanılmadan, demo verisiyle yürüyen ve bir hastane müdürüne gösterilebilecek bir pilot paketi hazır olmalı.

## G) Klinorbis'te vermen gereken kararlar ve önerim

- **İlk kapsam ne olacak?** Önerim: yalnız yatak zinciri (servis, temizlik, taşıma, transfer talebi) ve teknik/biyomedikal arıza. Laboratuvar, radyoloji, ameliyathane ve eczane entegrasyon gelene kadar bekler.
- **İlk müşteri kim olacak?** Önerim: 50–150 yataklı özel hastane. Kamu hastanelerinin elinde devletin ücretsiz QR uygulamaları var ve kamu alımları KTS yetki belgesi istiyor.
- **Pilotta hasta verisi kullanılacak mı?** Önerim: **hayır**. Yatak kodu ve anonim iş kodu yeterli. Gerçek veriye geçiş ancak avukat görüşü, KTS cevabı, yurt içi sunucu ve veri işleme sözleşmesinden sonra.
- **Öncelik alanı kimde olacak?** Önerim: her zaman talep eden personelde. Sistem yalnız idari ölçütlerle (bekleme süresi, talep saati) sıralar.
- **Hasta adı taşıma ekranında görünecek mi?** Önerim: varsayılan olarak hayır. Hastane isterse yalnız baş harfler ve doğum yılı açılır. Asıl kimlik doğrulaması bileklikten yapılır.
- **Entegrasyon ne zaman yapılacak?** Önerim: pilot hastanenin HBYS firmasıyla, pilot olumlu sonuçlanınca. İlk adım yalnız tek yönlü ADT dinleme olur.

