# Veri yönetimi kullanım kılavuzu

## Başvuru
1. Kuruma gelen başvuruyu teslim tarihi ve sistemdeki kayıt referansıyla açın. İsim/kimlik/sağlık metni yazmayın.
2. Kurum prosedürüyle kimliği doğrulayın. Kimlik belgesini bu uygulamaya yüklemek yerine tutanak referansını kaydedin.
3. Başvuruyu kaydeden ve kimlik kontrolünü yapan kişilerden farklı bir yetkili kabul/ret kararını gerekçesiyle kaydetsin.
4. Kabul edilen işlem kurum tarafından fiilen uygulanmalı. Yanıt kişiye yazılı/elektronik olarak iletilmeli; belge referansı uygulamaya kaydedilmeli.
5. Süresi geçen satırlar listede işaretlenir. Sistem kendiliğinden kişiye mesaj göndermez veya veri silmez.

## Saklama politikası
Veri grubunu, kurumun belirlediği süreyi ve dayanak belge referansını kaydedin. Hukuki bekletme varsa işaretleyin. Başka yetkili onaylasın. Güncelleme eski onayı kaldırır. Bu kayıt otomatik imha başlatmaz.

## Şifreli yedek aracı
`node scripts/encrypted-backup.mjs encrypt giriş.sql yedek.enc`

`node scripts/encrypted-backup.mjs decrypt yedek.enc geri-donus.sql`

`BACKUP_ENCRYPTION_KEY` yalnız güvenli ortamda sağlanan, 32 baytlık anahtarın base64 biçimidir. Komut satırı parametresine veya kaynak koduna yazmayın. Anahtarın ayrı güvenli yedeği olmadan dosyayı geri açamazsınız. Araç yalnız mevcut dışa aktarımı şifreler; üretim yedeğini kendiliğinden almaz. Hedef dosyanın üzerine yazmaz. Geri dönüş SQL'ini üretimde çalıştırmadan önce izole bir ortamda doğrulayın.

## Denetim zinciri (Klinorbis)
Yeni HMAC anahtarı Sites çalışma ortamında gizli tutulur. Eski anahtarı arşivlemeden anahtar rotasyonu yapmayın. Şema tetikleyicisi paralel başlık çakışmasını engeller; 409 durumunda ekranı yenileyin. Birleşik işlemler tamamen geri alınır.
