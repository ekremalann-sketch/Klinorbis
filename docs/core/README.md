# Klinorbis Türkiye çekirdeği (core/)

**Ne:** Türkiye kurulumu için çekirdek kaynak prototipi. Bu teslimde gerçek hasta verisiyle kullanım açılmaz. Yalnız Türkiye'de çalışır: hastane içinde (on-prem) ya da Türkiye'deki bir veri merkezinde, PostgreSQL 16+ ile. Faz 0 kararları ADR-001 ve ADR-003'e dayanır. Bulut (Cloudflare) sürümü yalnız kurgusal veriyle demo olarak kalır.

**İçerik**
- `migrations/`: 14 migrasyon. Şemalar: kb, vault, audit, kvkk. Yatak bileşenleri, temizlik, kod eşleme, şifreli karantina ve mutabakat tabloları dahil.
- `src/db.ts`: aynı kod üretimde `pg`, testte PGlite (PostgreSQL 17) ile çalışır. Her işlem `withContext` ile kurum, kullanıcı ve birim bağlamında yürür.
- `src/crypto.ts`, `src/keys.ts`, `src/vault.ts`:
  - AES-256-GCM zarf şifreleme (KeyProvider arayüzü; üretim KMS/HSM sağlayıcısı henüz bağlanmadı).
  - Aranabilir kör indeks ve takma ad belirteci.
  - Gerekçeli ve kayıtlı kimliğe geri dönüş.
- `src/kvkk.ts`:
  - İlgili kişi başvurusu (30 gün).
  - Veri ihlali (72 saat).
  - Erişim listesi.
  - Saklama-imha (beyaz liste, yasal saklama, imha tutanağı).
  - VERBİS envanteri.
- `src/bridge/`:
  - HL7 v2 ADT ayrıştırıcı ve ACK üretici; FHIR R4 Encounter eşlemesi.
  - İmzalı mesaj ve tekrar oynatma koruması.
  - Sahte HBYS ve yatış → nakil → taburcu işleme.
- `tests/`: 49 test; gömülü PostgreSQL/PGlite üzerinde (normal PostgreSQL sunucusu/havuzu henüz doğrulanmadı).

**Kurulum**
```bash
cd core && npm ci
DATABASE_URL=postgres://… npm run migrate
npm test
npm run docs:dictionary   # docs/core/VERI-SOZLUGU.md
```
Uygulama veritabanına süper kullanıcıyla bağlanmamalıdır. Bağlanan kullanıcı `kb_app` (köprü için `kb_bridge`) rolüne üye olur; RLS bu rollerde zorunludur.

**Bilinçli sınırlar**
- HBYS'ye yazılmaz.
- Tanı, ilaç ve sonuç okunmaz.
- Ticari SMS kapalıdır.
- Sağlık verisi yurt dışı aktarım kaydı veritabanı düzeyinde reddedilir.

## Teslimde yeniden doğrulanan sınırlar
- Cloudflare ekranları hâlâ D1 kullanır; core bağlantısı, hastane SSO ve üretim KMS/HSM kurulmuş değildir.
- Bellek içi nonce deposu yalnız test içindir. Çok işçi/yeniden başlatma için databaseNonceStore PostgreSQL üzerinde kalıcı tekrar koruması sağlar.
- Sıra dışı olay kapalı yatışı geri açmaz; entegrasyon merkezinde karantinaya alınır. Hata kaydı işlenmiş mesajı düşüremez; aynı kimlik farklı içerikle reddedilir; başarısız mesaj yeniden işlenebilir.
- Acil erişim arayüzü kapalıdır: keyfi break_glass kimliği normal kimliğe dönüş yetkisini atlatamaz.
- Rotasyon işlem bütünlüğüyle yapılır; decrypt_only anahtarlar eski şifreli kayıtları çözmek için yüklenir.
- KTS/kurum sözleşmesi/hukuki doğrulama, gerçek PostgreSQL havuzu ve 500 bin kayıt yük kabulü açık maddelerdir. Uyumluluk/sertifika veya üretime hazır olma sonucu çıkarılmaz.

## v55 birleşimi
- v55 ve v55_1 ZIP SHA-256 değerleri aynıdır. Aynı değişiklikler bir kez işlendi.
- Önceki 0013_bridge_source_and_vault_boundary.sql değişmedi. Yeni paket migrasyonu 0014_yatak_temizlik_entegrasyon.sql olarak eklendi.
- Çekirdek ekranları: /yatak, /temizlik, /entegrasyon. Başlatma: node --experimental-strip-types core/src/cli/serve.ts (core bağımlılıkları kurulmuş olmalı).
- Gerekli sunucu ayarları: DATABASE_URL, KB_PROXY_SECRET, KB_KEK_BASE64, KB_BRIDGE_CLIENTS. Üretim KMS/HSM ve kurum SSO kurulumu ayrıca gerekir; değerler kaynakta tutulmaz.
- Cloudflare'daki aynı adlı ekranlar mevcut simops D1 kayıtlarını kullanan sentetik görünümlerdir. Çekirdek kod eşleme / ham mesaj kasası / HBYS anlık liste mutabakatı buluta bağlanmamıştır. Gerçek hasta verisi girilmez.
- Önceki anahtar rotasyonu, kalıcı nonce ve işlenmiş mesajın bozulmaması korundu. Temizlikte kabul eden kişi dışında başlatma/tamamlama engellendi.
- PGlite kabul testi çok bağlantılı PostgreSQL yük testi yerine geçmez.
