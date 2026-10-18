# Klinorbis Türkiye çekirdeği (core/)

**Ne:** Türkiye kurulumu için çekirdek kaynak prototipi. Bu teslimde gerçek hasta verisiyle kullanım açılmaz. Yalnız Türkiye'de çalışır: hastane içinde (on-prem) ya da Türkiye'deki bir veri merkezinde, PostgreSQL 16+ ile. Faz 0 kararları ADR-001 ve ADR-003'e dayanır. Bulut (Cloudflare) sürümü yalnız kurgusal veriyle demo olarak kalır.

**İçerik**
- `migrations/`: 13 migrasyon. Şemalar: kb, vault, audit, kvkk. Toplam 80 tablo, 238 CHECK kısıtı, 99 yabancı anahtar ve zorunlu satır güvenliği (RLS) olan 68 tablo.
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
- `tests/`: 33 test; gömülü PostgreSQL/PGlite üzerinde (normal PostgreSQL sunucusu/havuzu henüz doğrulanmadı).

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
- Sıra dışı olay kapalı yatışı geri açmaz; inceleme görevi bırakır. Hata kaydı işlenmiş mesajı düşüremez; aynı kimlik farklı içerikle reddedilir; başarısız mesaj yeniden işlenebilir.
- Acil erişim arayüzü kapalıdır: keyfi break_glass kimliği normal kimliğe dönüş yetkisini atlatamaz.
- Rotasyon işlem bütünlüğüyle yapılır; decrypt_only anahtarlar eski şifreli kayıtları çözmek için yüklenir.
- KTS/kurum sözleşmesi/hukuki doğrulama, gerçek PostgreSQL havuzu ve 500 bin kayıt yük kabulü açık maddelerdir. Uyumluluk/sertifika veya üretime hazır olma sonucu çıkarılmaz.
