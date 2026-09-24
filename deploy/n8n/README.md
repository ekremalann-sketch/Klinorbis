# KLINORBIS self-hosted n8n paketi

Bu dizin, KLINORBIS'in dış otomasyon katmanını kurum kontrolündeki bir
sunucuda çalıştırmak için hazırlanmış üretim başlangıç paketidir. KLINORBIS'in
ana iş kuralları ve sağlık verisi D1/HBYS sınırında kalır; n8n'e yalnız
kimliksiz olay metadatası gönderilir.

## Mimari

- `n8n-main`: yönetim ve webhook giriş noktası
- `n8n-worker`: kuyruktaki işleri çalıştıran ayrı worker
- `PostgreSQL`: n8n yapılandırması ve yürütme metadatası
- `Redis`: queue mode iş dağıtımı
- `KLINORBIS`: HMAC imzalı olay üretir; callback imzasını ve tekrar penceresini
  doğrular

## Üretim kapıları

1. Türkiye lokasyonlu kurum sunucusu veya kurum içi altyapı hazırlanır.
2. `config.example` dosyası `.env` olarak kopyalanır; örnek değerlerin tamamı
   benzersiz güçlü sırlarla ve gözden geçirilmiş sabit imaj sürümleriyle
   değiştirilir.
3. n8n yalnız ters vekil/WAF üzerinden TLS ile yayımlanır; `5678` doğrudan
   internete açılmaz.
4. `public/integrations/klinorbis-n8n-workflows.json` n8n'e içe aktarılır. Akış,
   bir dakikalık imzalı ajan zamanlayıcısı ve olay köprüsünü birlikte içerir.
5. Owner-only Sites dispatch geçişi için `KLINORBIS_SITES_AUTH_TOKEN`, n8n
   sunucusunda gizli ortam değişkeni olarak tanımlanır. ChatGPT oturum çerezi
   kullanılmaz, loglanmaz ve otomasyon sunucusuna taşınmaz.
6. KLINORBIS üretim ortamında `KLINORBIS_N8N_WEBHOOK_URL` ve
   `KLINORBIS_N8N_SHARED_SECRET` tanımlanır.
7. Kimliksiz test olayıyla Sites makine erişimi, HMAC imzası, idempotency,
   retry ve callback zinciri
   doğrulanır.
8. Akış n8n arayüzünde etkinleştirilir; KLINORBIS Ajan Sağlığı ekranında son
   kalıcı çalıştırmanın üç dakika içinde yenilendiği doğrulanır.
9. Yedekleme, log saklama, alarm, anahtar rotasyonu ve felaket kurtarma
   kontrolleri tamamlanmadan gerçek kurum trafiği açılmaz.

Bu paket bir sunucuya uygulanmadığı sürece arayüz n8n'i “bağlı” göstermez.
