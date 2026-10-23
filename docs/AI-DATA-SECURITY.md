# Yapay zekâ, veri tedariki ve veritabanı güvenliği

Araştırma: 23 Ekim 2026. Bu belge bilinen riskler için inceleme kataloğudur; bütün olası açıkların eksiksiz listesi, sızma testi veya uygunluk belgesi değildir. Katalog eklenmesi kontrollerin uygulandığı anlamına gelmez.

## Önce kavramları ayır

Veri kümesi satın alma, bulut veritabanı hizmeti kiralama, bir şirketi satın alma, RAG ile belge arama ve model eğitimi farklı işlemlerdir. Bir bankanın müşteri verisini yapay zekâ şirketine sattığı, somut olay ve kaynak olmadan kabul edilmez. Ödeme yapmak veriyi işleme/aktarma hakkını kendiliğinden yaratmaz. Güvenlik incelemesi hem hukuki kökeni hem teknik erişimi kapsar.

## Sağlayıcılar hakkında doğrulanabilenler

| Hizmet türü | Resmî açıklamanın anlamı | Bu depoda ayrıca doğrulanması gereken |
|---|---|---|
| OpenAI API | Eğitimde varsayılan kullanılmama ile kayıt/saklama ayrıdır. ZDR onaya ve uç nokta/özellik istisnalarına bağlıdır. | Gerçek organizasyon/proje, endpoint/model, store/cache/files/background kullanımı, saklama ve alt işleyen şartları. |
| Claude API ve ticari ürünler | Eğitim kullanımı ile saklama ayrıdır; API ve kaydedilen konuşmaların koşulları aynı değildir. ZDR ve model/güvenlik istisnaları ayrıca incelenir. | Gerçek ürün/hesap, sözleşme, opt-in, model, dosya/araç ve veri saklama şartları. |
| Tüketici sohbet hesabı | Kurumsal/API şartları bireysel hesaba kendiliğinden uygulanmaz. | Kişisel hesaplardan kurum/hasta/müşteri verisi gönderimi engeli ve hesap politikası. |
| Bulut veritabanı | Sağlayıcının güvenlik görevleri müşteri IAM, uygulama yetkisi, ağ ve veri politikalarının tamamını kapsamaz. | Gerçek bölge, ağ, anahtar, yedek, log, destek erişimi, silme ve kurtarma ayarları. |

Bu hesaplara veya üretim konsollarına bu görevde erişilmedi. Hiçbir satır 'bizde sağlandı' anlamına gelmez. Sağlayıcı şartları değişebilir; yeni model/özellik/alt işleyen için yeniden inceleme gerekir.

Kaynaklar: [OpenAI veri kontrolleri](https://developers.openai.com/api/docs/guides/your-data), [Anthropic saklama](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [Anthropic eğitim kullanımı](https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training), [bulutta sorumluluk paylaşımı](https://aws.amazon.com/compliance/shared-responsibility-model/).

## Türkiye'de uygulanabilirlik

KVKK; amaç, hukuki dayanak, minimizasyon, aydınlatma, erişim, güvenlik, saklama/imha ve yurt dışı aktarımın ayrı değerlendirilmesini gerektirir. Yapay zekâ tavsiyeleri bir sertifika değildir. Takma ad/vektör tek başına anonimlik kanıtı değildir. Yeniden belirleme riski değerlendirilmelidir. [KVKK yapay zekâ tavsiyeleri](https://www.kvkk.gov.tr/Icerik/7048/Yapay-Zeka-Alaninda-Kisisel-Verilerin-Korunmasina-Dair-Tavsiyeler).

BDDK'nın bilgi sistemleri, elektronik bankacılık, dış hizmet ve denetim çerçevesi bankacılık kapsamına göre incelenir. Her ticari uygulamanın bütün BDDK şartlarına tabi olduğu veya bu katalogla 'banka düzeyinde' olduğu söylenemez. Bu görevde BDDK'nın düzenleme listesi doğrulandı; güncel konsolide bütün maddeler için hukuki uygulanabilirlik denetimi tamamlanmadı. [Resmî düzenleme listesi](https://www.bddk.gov.tr/Mevzuat/Liste/134).

## Kontrol durumları nasıl okunmalı?

- KANIT YOK: İnceleme/test/hesap veya sözleşme kanıtı henüz yok. Başlangıçtaki 50 kontrolün tamamı bu durumda.
- İNCELEME ADAYI: Kaynakta kelime/bağlantı yüzeyi bulundu; açık bulundu demek değil.
- DOĞRULANMIŞ AÇIK: Ayrı incelemede ön koşul ve somut test/kanıtla doğrulanmalı.
- KONTROL SAĞLANDI: İlgili commit, ortam, test, tarih ve kapsam birlikte kanıtlanmalı; bu envanter betiği böyle bir sonuç üretmez.
- UYGULANAMAZ: Özellik yokluğu ve veri akışı analiziyle gerekçelendirilir; sadece kelime bulunmaması yeterli değildir.

Güvenlik amiri her bulguya repo/commit, dosya/konum, ön koşul, etki, önem/gerekçe, kanıt, küçük düzeltme, normal davranış testi ve geri alma yolu ekler. Güvenlik sırrı ve hassas ham veri rapora konmaz. Uygulanmamış kontrol tamamlanmış sayılmaz.

## Tek tek riskler ve gerekli koşullar

Aşağıdaki şartlar proje için önerilen inceleme/kabul koşullarıdır; hepsinin bütün sağlayıcılarda bulunduğu iddiası değildir.

| Kimlik | Açığın/riskin adı | Ne ters gidebilir? | Gereken koşul | Doğrulama | Başlangıç |
|---|---|---|---|---|---|
| LLM01 | Prompt Injection | Girdi veya belge modele yetkisiz talimat verir. | Veriyi talimattan ayır; araç yetkisini model dışında denetle. | Belgedeki yetkisiz veri dışa aktarma talimatıyla hiçbir araç çağrısı oluşmamalı. | KANIT YOK |
| LLM02 | Sensitive Information Disclosure | Yanıt, prompt, log veya izleme hassas veri açığa çıkarır. | Dış istekten önce veri politikası; çıktı ve loglarda en az veri. | Sentetik hasta/müşteri ayrıntıları sağlayıcı istek kaydına ulaşmamalı. | KANIT YOK |
| LLM03 | AI Supply Chain Compromise | Model, paket, veri kümesi veya eklenti ele geçirilir. | Kaynak/lisans/imza/sürüm doğrulaması ve SBOM. | Değiştirilmiş model/eklenti özeti kabul edilmemeli. | KANIT YOK |
| LLM04 | Data and Model Poisoning | Eğitim veya arama verisi zehirlenerek sonuç değiştirilir. | Veri kökeni, karantina, sürüm ve onaylı içeri alma. | Onaysız değişen veri kümesi üretim dizinine girmemeli. | KANIT YOK |
| LLM05 | Improper Output Handling | Model çıktısı SQL, HTML veya komut olarak çalıştırılır. | Parametreli sorgu, çıktı kodlama ve sabit araç şeması. | Üretilen script/SQL metni veri olarak kalmalı; yürütülmemeli. | KANIT YOK |
| LLM06 | Excessive Agency | Model gereğinden geniş araç yetkisiyle işlem yapar. | Salt okuma başlangıcı; işlem bazında sunucu yetkisi ve insan onayı. | Okuma ajanı silme/ödeme/dağıtım aracı çağıramamalı. | KANIT YOK |
| LLM07 | System Prompt Leakage | İç talimat açığa çıkınca sır ve yetki de açılır. | Promptta sır tutma; gizliliği güvenlik sınırı sayma. | Prompt bilinse bile erişim kontrolü aşılamamalı. | KANIT YOK |
| LLM08 | Vector and Embedding Weaknesses | Arama ve vektör dizininden başka kurumun içeriği gelir. | Sunucu kaynaklı kurum/ACL filtresi ve vektör kaydı saklama politikası. | İki sentetik kurumla komşu vektör aramasında çapraz sonuç dönmemeli. | KANIT YOK |
| LLM09 | Misinformation / Hallucination | Uydurulmuş bilgi doğru kayıt veya karar gibi sunulur. | Kaynak ve tarih; belirsizlik görünümü; kritik kararda yetkili insan. | Kaynağı olmayan yanıt karar/ödeme/klinik kayıt oluşturmamalı. | KANIT YOK |
| LLM10 | Unbounded Consumption / Denial of Wallet | Sınırsız sorgu/döngü maliyet veya hizmet kesintisi yaratır. | Kullanıcı/kurum kotası, süre/token sınırı, devre kesici. | Sentetik uzun döngü kota sonunda kesilmeli; retry bütçesi aşılmamalı. | KANIT YOK |
| ASI01 | Agent Goal Hijack | Ajanın hedefi kötü amaçlı içeriğe kayar. | Hedefi ve yetkili kapsamı araç katmanında sabitle. | Dış belgenin hedef değiştir talebi kapsamı genişletememeli. | KANIT YOK |
| ASI02 | Tool Misuse and Exploitation | Meşru araç tehlikeli parametrelerle kötüye kullanılır. | Araç/parametre izin listesi ve etki sınırlaması. | Dosya veya URL parametresi izinli kapsamdan çıkamamalı. | KANIT YOK |
| ASI03 | Identity and Privilege Abuse | Ajan kullanıcının yetkisinden fazlasını kullanır. | Kısa ömürlü dar kimlik; her çağrıda kullanıcı ve kurum doğrulama. | Düşük yetkili kullanıcı ajan yoluyla yönetici işlemi yapamamalı. | KANIT YOK |
| ASI04 | Agentic Supply Chain Vulnerabilities | MCP, skill veya araç tanımı sonradan değiştirilir. | Onaylı sunucu/skill sürümü ve bütünlük doğrulaması. | Araç açıklaması değişince yeniden onay olmadan yeni yetki verilmemeli. | KANIT YOK |
| ASI05 | Unexpected Code Execution | Model veya araç içeriği beklenmeyen kod çalıştırır. | İzole yürütme, sınırlı ağ ve kapalı kabuk yetkisi. | Belgeden gelen komut runner veya üretimde yürütülmemeli. | KANIT YOK |
| ASI06 | Memory and Context Poisoning | Kalıcı bellek ileriki oturumlara zararlı talimat taşır. | Bellek kökeni/süresi/kurum kapsamı; talimat yetkisi vermeme. | Önceki bellekten gelen yetki genişletme sonraki oturumda reddedilmeli. | KANIT YOK |
| ASI07 | Insecure Inter-Agent Communication | Ajanlar arası mesajda kimlik veya veri sınırı aşılır. | İmzalı kimlik, alıcı kapsamı, en az veri ve mesaj şeması. | Sahte ajan mesajı veya diğer kurum alıcısı kabul edilmemeli. | KANIT YOK |
| ASI08 | Cascading Failures | Bir ajan hatası zincir boyunca işlemleri bozarak yayılır. | Retry sınırı, devre kesici, idempotency ve kısmi başarı kaydı. | Alt servis arızası sınırsız görev/ödeme tekrarı üretmemeli. | KANIT YOK |
| ASI09 | Human-Agent Trust Exploitation | İkna edici çıktı kullanıcıdan yanlış onay alır. | Gerçek işlem özeti, kapsam ve risk; kritik işlemde ayrık onay. | Görünen onay ile çalışacak araç parametreleri aynı olmalı. | KANIT YOK |
| ASI10 | Rogue Agents | Ajan yetkili hedef dışında bağımsız işlem sürdürür. | Durdurma, kimlik iptali, zaman sınırı ve bağımsız denetim. | Durdurma sonrası bekleyen ve yeni araç çağrısı yürümemeli. | KANIT YOK |
| DATA01 | SQL / NoSQL Injection | Kötü girdi sorgu yapısını veya filtreyi değiştirir. | Parametreli sorgu; operatör/alan izin listesi. | Sentetik bozuk filtre veri kapsamını genişletememeli. | KANIT YOK |
| DATA02 | BOLA / IDOR / Broken Tenant Isolation | Kimlik veya URL değiştirerek başka kayda erişilir. | Her nesnede kullanıcı, kurum, birim ve işlem yetkisi. | İki kurum ve üç rolle nesne erişim matrisi reddetmeleri doğrulanmalı. | KANIT YOK |
| DATA03 | RLS Bypass | DB sahibi/superuser/bağlam sızıntısı satır korumasını aşar. | Dar uygulama hesabı, FORCE RLS; işlem yerel bağlam. | Gerçek PostgreSQL'de sahip/BYPASSRLS ve havuz geçişleri denenmeli. | KANIT YOK |
| DATA04 | Public Database / Bucket Exposure | Veritabanı, depo veya yönetim aracı internete açılır. | Özel ağ, kapalı genel erişim ve güvenli yönetim düzlemi. | Yetkili IaC/ayar kanıtında genel okuma ve DB port açığı olmamalı. | KANIT YOK |
| DATA05 | Exposed Snapshots and Backups | Yedek veya dışa aktarım ana sistemden zayıf korunur. | Ayrı yedek yetkisi, şifreleme ve erişim süresi. | Sentetik yedek yetkisiz hesapça indirilememeli. | KANIT YOK |
| DATA06 | Overprivileged IAM / Service Accounts | Tek hesap tüm kurumlara veya veriye yönetici olur. | En az yetki, servis başına kimlik, düzenli erişim incelemesi. | Okuma hesabı yazma/rol verme/anahtar erişimi yapamamalı. | KANIT YOK |
| DATA07 | Token Leakage and OAuth Consent Abuse | Token/izin üzerinden geniş veri erişimi alınır. | Dar kapsam, kısa ömür, iptal, güvenli yönlendirme ve PKCE gereken yerde. | İptal tokenı ve farklı alıcı/audience kabul edilmemeli. | KANIT YOK |
| DATA08 | SSRF / Metadata Credential Theft | Dış adres alanı iç ağ/metadata servisine erişir. | İzinli hedef, DNS/redirect kontrolü ve egress sınırı. | Yerel metadata benzetimi, özel IP ve yönlendirme reddedilmeli. | KANIT YOK |
| DATA09 | Bulk Exfiltration / Excessive Data Exposure | API veya rapor gereğinden çok veriyi dışarı verir. | Alan seçimi, sayfalama, dışa aktarım onayı ve kota. | Düşük yetkili rol ham/toplu dışa aktarımı alamamalı. | KANIT YOK |
| DATA10 | Encryption / Key Management Failure | Şifreleme, anahtar ve sertifika yapılandırması veriyi açar. | Taşıma/depolama şifrelemesi, ayrı KMS yetkisi ve rotasyon. | Geçersiz sertifika reddi; yanlış anahtar erişimi engeli gösterilmeli. | KANIT YOK |
| DATA11 | Logs, Telemetry and Prompt Trace Leakage | Hata izleme veya prompt izi veri/sır kopyası oluşturur. | Alan izin listesi, maskeleme, kısa saklama ve kapalı ham gövde. | Sentetik hassas alanlar log/trace/destek kaydında bulunmamalı. | KANIT YOK |
| DATA12 | Training Opt-in / Secondary Use Drift | Veri sonradan eğitim/iyileştirme amacıyla kullanılır. | Ürün/hesap bazlı sözleşme, opt-in ve veri amacı doğrulaması. | Hesap ayarı kanıtı yoksa eğitimde kullanılmıyor sonucu verilmemeli. | KANIT YOK |
| DATA13 | Retention / Zero-Retention Misconfiguration | Eğitim dışı veri dosya/önbellek/izleme sisteminde kalır. | Uç nokta ve özellik bazında süre, silme, alt işleyen ve istisna kaydı. | ZDR onayı ve kullanılan özelliğin uygunluğu ayrı kanıtlanmalı. | KANIT YOK |
| DATA14 | Unlawful Acquisition / Data Provenance Gap | Satın alınan veri lisanslı veya hukuka uygun olmayabilir. | Satıcı yetkisi, kaynak, amaç, lisans, hukuki dayanak ve sözleşme. | Kaynak/dayanak eksik veri kümesi içeri alınmamalı. | KANIT YOK |
| DATA15 | Re-identification / Linkage Attack | Takma ad/toplu veri başka veriyle yeniden kişiye bağlanır. | Minimizasyon, küçük grup baskılama ve yeniden belirleme analizi. | Nadir olay/zaman/birim kombinasyonlarıyla sentetik yeniden bağlama denenmeli. | KANIT YOK |
| DATA16 | Model Inversion / Data Reconstruction | Model sorgularından eğitim verisi tahmin edilir. | Hassas eğitim verisini dışlama ve çıktı/erişim koruması. | Yalnız yerel sentetik model/veri üzerinde çıkarım riski değerlendirilmeli. | KANIT YOK |
| DATA17 | Membership Inference | Bir kişinin eğitim verisinde bulunup bulunmadığı çıkarılır. | Eğitim veri minimizasyonu; uygun modelde mahremiyet değerlendirmesi. | Sentetik üyelik denemesi ve saldırı avantajı raporu gerekir. | KANIT YOK |
| DATA18 | Embedding Inversion / Vector Leakage | Vektörlerden kaynak metin veya hassas özellik çıkarılır. | Vektörü hassas kabul et; şifreleme, ACL ve aktarım sınırı. | Vektör dışa aktarımı ve kaynak geri çıkarımı sentetik veriyle incelenmeli. | KANIT YOK |
| DATA19 | Cross-Border / Subprocessor Drift | Bölge, destek veya alt işleyen değişince aktarım değişir. | Bölge/uzaktan destek/alt işleyen envanteri ve yeniden değerlendirme. | DPA, alt işleyen ve gerçek hesap bölgesi ayrı doğrulanmalı. | KANIT YOK |
| DATA20 | Migration / CDC / ETL Exposure | Taşıma kuyruğu, geçici dosya veya CDC veriyi sızdırır. | Şifreli aktarım, dar hesap, kuyruk TTL, checksum ve mutabakat. | Kesinti/tekrar sırasında kayıt kaybı ve çift yazma olmamalı. | KANIT YOK |
| DATA21 | Deletion Gaps in Derived Data | Ana kaydı silmek vektör, cache, yedek ve dosyayı silmez. | Türetilmiş veri haritası, imha işi ve yedek geri dönüş sonrası uygulama. | Sentetik silme isteği tüm türetilmiş kopyalarda izlenmeli. | KANIT YOK |
| DATA22 | Production Data in Test / Demo | Gerçek veri geliştirme, satış demosu veya CI'a taşınır. | Sentetik veri ve üretimden bağımsız test hesapları. | Test/demo/CI veri kökeni ve maskeleme istisnaları incelenmeli. | KANIT YOK |
| DATA23 | Ransomware / Destructive Agent Action | Ajan veya hesap üretim ve yedekleri birlikte siler. | Ayrı yedek kimliği, değişmez kopya ve geri yükleme tatbikatı. | İzole sentetik kurtarma ile RTO/RPO ölçülmeli. | KANIT YOK |
| DATA24 | TOCTOU / Duplicate Financial or Task Action | Onaydan sonra parametre değişir veya işlem iki kez yürür. | Onayı işlem özeti/sürümüne bağla; atomik geçiş/idempotency. | İki eşzamanlı istek tek geçerli durum değişikliği üretmeli. | KANIT YOK |
| DATA25 | Insider / Vendor Support Abuse | Çalışan veya destek hesabı izinsiz erişir. | Süreli gerekçeli erişim, MFA ve bağımsız denetim. | Destek süresi dolunca erişim kapanmalı ve iz bırakmalı. | KANIT YOK |
| DATA26 | Shared Responsibility Gap | Sağlayıcının sertifikası uygulama ayarlarını koruyor sanılır. | Sağlayıcı/kurum/geliştirici sorumluluk matrisi. | Ağ, kimlik, veri, yedek ve olay sahipleri ayrı belirlenmeli. | KANIT YOK |
| DATA27 | Unverified Certifications / Banking Claims | Ürün banka standardında veya onaylı diye sunulur. | Sektörel kapsam ve sertifika kapsamı/kuruluşu doğrulaması. | BDDK kapsam analizi olmadan banka uyumluluğu iddiası reddedilmeli. | KANIT YOK |
| DATA28 | Uncontrolled Agent Egress | Ajan aracı izinli olmayan dış alıcıya veri yollar. | Ağ ve araç katmanında alıcı izin listesi; veri sınıfına göre engel. | Sentetik hassas veri yeni e-posta/URL/MCP alıcısına gitmemeli. | KANIT YOK |
| DATA29 | Model / Provider Change Drift | Model veya sağlayıcı değişince güvenlik koşulları değişir. | Sürüm, sözleşme, bölge ve retention değişiklik kapısı. | Model değişimi önceki sağlayıcı onayını otomatik devralmamalı. | KANIT YOK |
| DATA30 | Unverified Automated Security Findings | Tarama uyarısı doğrulanmış açık veya temiz sonuç sayılır. | Kanıt, SHA, yöntem, kapsam ve atlanan kontrolleri ayır. | Araç hatası/eksik yetki/sıfır eşleşme güvenli durumuna dönüşmemeli. | KANIT YOK |

## Otomasyonun gerçek kapsamı

AI and data review inventory workflow'u her push/PR, haftalık ve elle çalışır. Altı sentetik rapor güvenilirliği testi ve sürümlü kontrol katalog doğrulaması yürütür. Git'te izlenen kaynaklarda olası AI/vektör/DB/araç/dışa aktarım yüzeylerini bulur. Tam 50 başlığı Actions görev özetine yazar; kaynak metnini veya eşleşen değerleri yazmaz. Büyük dosya ve symlink atlanması sayılır. Kaynak içeriğini LLM sağlayıcısına göndermez.

Bu işlem prompt injection savunmasını, gerçek RLS'yi, bulut hesabını veya sözleşmeyi test etmiş değildir. Altı rapor testi altı uygulama güvenlik testi değildir. CodeQL, Gitleaks, bağımlılık taraması ve günlük yapay zekâ incelemesi ayrıca sürer. Üretim servisine saldırı, yük veya bağlantı yapılmaz.

## Dış bağlantı açmadan önce kabul kapısı

Veri sahibi/kökeni ve işleme amacı; hukuki dayanak/sözleşme; gerçek sağlayıcı ürün/model/bölge/saklama; alt işleyen ve destek erişimi; sunucu yetkisi/kurum izolasyonu; girdi-çıktı veri politikası; araç ve ağ egress sınırı; silme/geri yükleme; olay müdahalesi ve maliyet kotası ayrı ayrı incelenmeli. Bunlar tamamlanmadan yeni gerçek verili AI bağlantısı açma.

Bu deponun ürün veri sınırını AGENTS.md belirler; hasta veya müşteri verisini kontrol kataloğu için dış servise yollama.

## Yüksek öncelikli mevcut inceleme işleri

Önceki tarama uyarıları kapatılmış sayılmadı. Geliştirme bağımlılığı, derleme sırları ve yazılım çıktısı üzerinden yine risk taşıyabilir; erişilebilirlik ve dağıtılan çıktı ayrı doğrulanmalı. Büyük paket yükseltmesini mevcut kurulum PR'ına karıştırma; güncel sürüm/duyuru doğrulaması ve testlerle ayrı PR hazırla. Sır yanlış pozitif istisnası yalnız incelenen commit/dosya/kural/satır fingerprint'i kadar dar olabilir.

## Kaynak dizini

- LLM: https://genai.owasp.org/llm-top-10/
- AGENT: https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/
- DB: https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html
- AI: https://owaspai.org/docs/2_threats_through_use/
- NIST: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- KVKK: https://www.kvkk.gov.tr/Icerik/7048/Yapay-Zeka-Alaninda-Kisisel-Verilerin-Korunmasina-Dair-Tavsiyeler
- BDDK: https://www.bddk.gov.tr/Mevzuat/Liste/134
- RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- OPENAI: https://developers.openai.com/api/docs/guides/your-data
- ANTHROPIC: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- CLOUD: https://aws.amazon.com/compliance/shared-responsibility-model/
- LLM01: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- LLM02: https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/
- LLM03: https://genai.owasp.org/llmrisk/llm032025-supply-chain/
- LLM04: https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/
- LLM05: https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
- LLM06: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- LLM08: https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/
- LLM09: https://genai.owasp.org/llmrisk/llm092025-misinformation/
- LLM10: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/

Katalog OWASP LLM 2025 ve Agentic 2026 risk başlıklarını temel alır; DATA kimlikleri bu projeye özgü tamamlayıcı kontrol başlıklarıdır, OWASP resmî kimliği değildir. Standart metinleri kopyalanmadı; proje kabul koşulları özgün olarak yazıldı.
