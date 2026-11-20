# Hasta süreç takibi — 20 Kasım 2026

## Ne eklendi

| Parça | Dosya |
|---|---|
| Süreç kuralları (başvuru türleri, eklenebilir adımlar, yetki) | `lib/patient-journey.ts` |
| Veritabanı işlemleri (tek batch, sürüm kilidi, bildirim, denetim izi) | `lib/patient-journey-store.ts` |
| Personel API | `app/api/patient-journey/route.ts` |
| Hasta API (oturumsuz, kod + PIN) | `app/api/takip/route.ts` |
| Personel ekranı | `/hasta-surecleri` |
| Hasta takip ekranı | `/takip` |
| Kurumsal görüşme formu ve talep listesi | `/kurumsal-basvuru`, `/kurumsal-talepler`, `app/api/inquiries/route.ts` |
| Migrasyon | `drizzle/0024_hasta_sureci.sql` (yalnız yeni tablolar) |
| Testler | `tests/patient-journey.test.mjs` (11 senaryo) |

## İşleyiş

1. Hasta kabul / acil / danışma / çağrı merkezi süreci açar: başvuru türü (poliklinik, yatış, acil, günübirlik, tetkik, check-up), birim ve HBYS protokol no.
2. Hastaya takip kodu + 6 haneli PIN + QR içeren fiş yazdırılır. PIN yalnız bir kez gösterilir; veritabanında anahtarlı özet olarak tutulur.
3. Her adım ilgili birimin sırasına düşer ve birim üyelerine bildirim gider. Birimin seçenekleri:
   - **Hastayı al / başla** → hasta ekranında "İşleminiz yapılıyor".
   - **Tamamla** → hasta otomatik olarak sıradaki birime geçer.
   - **Reddet / başka birime aktar** → gerekçe zorunlu; hasta seçilen birime (provizyon reddinde varsayılan vezne) gider, yol kaldığı yerden devam eder.
   - **Tetkik / konsültasyon ekle** (yalnız o birimin klinisyeni veya sorumlusu) → kan alma, laboratuvar, görüntüleme, endoskopi, konsültasyon, yatış, ameliyat; tetkik sonrası "Sonuç değerlendirme" adımı otomatik eklenir.
   - **Gerekmiyor** (yalnız isteğe bağlı adımlar, gerekçeyle) ve **Süreci sonlandır** (operasyon yöneticisi / kabul sorumlusu, gerekçeyle).
4. Hastane akış panosu: her birimde bekleyen, işlemdeki, hedef süresi aşılan hasta sayısı ve ortalama süre. Kişisel veri içermez.
5. Personel, yolu kendi biriminden geçen hastanın tüm adımlarını baştan sona görür; yönetim ve gözetim rolleri tümünü görür.

## Güvenlik

- Yazma işlemleri: oturum, birim yetkisi, CSRF (köken + sec-fetch-site), JSON boyut sınırı, kullanıcı başına hız sınırı.
- Eşzamanlılık: sürüm kilidi + kilit jetonu; aynı adımı iki kişi işlerse ikincisinin tüm batch'i geri alınır (409).
- Hasta ekranı: yanlış kod ile yanlış PIN aynı yanıtı verir; IP başına dakikada 10 deneme; 5 hatalı PIN'de kod 15 dakika kilitlenir; kapanıştan 7 gün sonra görünüm kapanır.
- Hasta ekranında takma ad, personel, not veya ret gerekçesi gösterilmez. Takma ad alanındaki telefon/TCKN otomatik maskelenir.
- Takip anahtarı (`KLINORBIS_AUDIT_HMAC_KEY`) tanımlı değilse süreç açılmaz (503); sahte güvenlik yok.

## Canlıya almadan önce

- `drizzle/0024_hasta_sureci.sql` Sites D1 veritabanına uygulanmalı.
- Klinik sınır: sistem tetkik/yatış kararı vermez; istemi hekim HBYS'de ayrıca girer.
