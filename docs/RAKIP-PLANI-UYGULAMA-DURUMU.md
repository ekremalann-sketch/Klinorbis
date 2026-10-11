# Klinorbis — yüklenen rakip ve düzeltme planının uygulanması

Başlangıç: d2d2b4a (Sites v49). Kaynak: `Rakip analizi ve düzeltme planı.md`. Kaynak koduyla doğrulanmış değişiklikler aşağıdadır. Bütün planın tamamlandığı, sistemin KVKK sertifikalı olduğu veya gerçek hastaneyle entegre edildiği iddia edilmez.

## Uygulananlar

- Üst menüde platforma ait güvenli, üst pencere üzerinden çalışan çıkış bağlantısı var. 403 ekranı rol/birim atanmasını ve hesap değiştirmeyi anlatır. Platform kimliği yerine yeni bir giriş sistemi kurulmadı.
- Üç yasal sayfadaki Teksanor/OpenAI ifadeleri ve saha servis veri etiketleri temizlendi. Klinorbis'in bu sürümde harici yapay zekâya konuşma metni göndermediği açıklanır.
- Harici n8n yokken yeni işler `local_completed` olarak saklanır. Harici kabul edilenler ve yalnız yerel kayıtlar ayrı sayılır. Harici orkestratörün 2xx yanıtı hasta SMS'inin teslim kanıtı değildir. Eski tamamlandı kayıtları geçmişi yeniden yorumlamamak için değiştirilmedi.
- Pilot hızına ilişkin sabit yedi saniye ve 2,5 saniye vaatleri kaldırıldı. AI özeti yerine kural tabanlı özet yazılır.
- Yeni hasta takma adlarında kurum öneki ve rakam aranır; düz ad/soyad ve telefon biçimleri reddedilir. Mevcut kayıtlar okunabilir kalır. Serbest metin maskelemesi tüm kişisel verileri tespit etme garantisi değildir.
- Görüşme ekranı mevcut üstlen, işleme al, geri arama görevi aç, birime aktar ve sonuçlandır API işlemlerine bağlandı. Gözetim rollerine bu düğmeler verilmez. Sunucu rol/birim kontrolü, farklı görevliye ait işin korunması ve insan onayı kapısı uygulanır.
- Çağrı işlemleri, görev, konuşma, olay, workflow işi ve HMAC denetim kaydıyla aynı D1 batch içinde yazılır. Deterministik iş anahtarı ve önceki çağrı zamanını doğrulayan tetikleyici eşzamanlı eski durum işlemlerini reddeder. Çakışma 409 verir ve batch geri alınır. Tetkik/tedavi kararı üretilmez.
- Çağrı/iş kutusu/talep yenilemesi 15 saniye, diğer ekranlar 30 saniye; özel ekranlar/boşta kullanım 60 saniye. Gizli sekme yenilemesi durur. Mesaj yükü çağrı başına son 100 satırla sınırlanır; önceki kayıtlar silinmez. Önceki satırlar için yeni arşiv gezgini eklenmedi.
- Türkçe ve İngilizce demoda kapasite çubukları inline stil yerine native progress kullanır.
- Hasta erişimi ekranı kurum kayıtlarıyla açılır; eğitim modu etkinse ayrı kapsam seçimi yapılabilir. Eğitim motoru kapalıyken eğitim oluştur düğmesi görünmez. Sunucu yetkileri her iki kapsamda korunur.
- Otomasyon kutusu 403 yanıtında açıklama gösterir. Yeni kayıt formunda yıldızlar ve boş birim/branş seçeneği vardır. Dış tıklama formu kapatmaz; Esc, başlangıç odağı ve değişmiş formu kapatmadan onay eklendi. Sonuçlandırma ayrıca onay ister. Zil simgesi düzeltildi.

## Planın tamamlanma durumu

| Plan satırı | Durum |
|---|---|
| KL1 çıkış/403 | Uygulandı. |
| KL2 ürün metinleri | Uygulandı. |
| KL3 bağımsız zamanlayıcı | Yeni sürekli zamanlayıcı etkinleştirilmedi. Worker scheduled kodunun varlığı bir tetikleyicinin çalıştığını kanıtlamaz. |
| KL4 yerel/harici sonuç | Yeni işler için uygulandı. Gerçek hasta mesajı gönderim sağlayıcısı yok. |
| KL5 yanıltıcı rozetler | Belirtilen sabit hız ve AI ifadeleri düzeltildi; pilot kayıt gösterimi eğitim etiketi taşır. |
| KL6 hasta kodu/maskeleme | Yeni kod biçimi ve görev sahibi e-posta maskelemesi uygulandı. Serbest metinde ad tespiti garantisi ve bütün personel alanlarının maskelemesi yok; yetkili personel yönetimi hesap e-postasını kullanır. |
| KL7 çağrı işlemleri | Uygulandı; atomik işlem ve sahiplik koruması da eklendi. |
| KL8 kapsamlı performans | Yenileme aralığı ve sınırsız mesaj yükü düzeltildi. Ekrana göre ayrı paket, yalnız seçili kayıt geçmişi, ETag/değişmedi yanıtı ve bütün okuma yazmalarının azaltılması henüz yok. |
| KL9 demo kapasitesi | Uygulandı. |
| KL10 eğitim/gerçek kayıt kapsamı | Uygulandı; gerçek HBYS bağlantısı kurulmadı. |
| KL11 tekrarlar | 403 açıklaması eklendi; bütün personel, vardiya ve entegrasyon kutuları yeniden tasarlanmadı. |
| KL12 formlar | Yeni kayıt formu ve çağrı kapanış onayı düzeltildi. Bütün yıkıcı işlemler için zorunlu gerekçe ve tam klavye odak döngüsü tamamlanmadı. |
| KL13 tüm geçişler | Mevcut istemci yönlendirme korunur; bütün düz bağlantılar ve derin bağlantılar tarayıcıda taranmadı. |
| KL14 runtime tablolar/ölü kod | Toplu taşıma/temizlik yapılmadı. Çağrı çakışma tetikleyicisi ekleyici ve tekrar çalıştırılabilir runtime kurulumuyla hazırlanır. |
| KL15 büyük bileşeni bölme | Rol başına kapsamlı dosya ayrımı ve memo taraması yapılmadı. |
| Sonraki modüller | Platform hesabının MFA durumunu uygulama doğrulayamaz. Ekran dışı gerçek SMS, yeni AI hizmeti veya ücretli orkestrasyon açılmadı. |

## Doğrulama

137 otomatik test geçti. Yeni testler hasta kodu, çıkış dönüş yolu, eşzamanlı çağrı üstlenme, yerel/harici sonuç ayrımı ve son 100 satırın eski kayıtları silmeden sınırlandırılmasını doğrular. TypeScript ve yayın derlemesi de çalıştırılır. Gerçek tarayıcı aracı bu ortamda yok; kullanıcı tarafından giriş ve mobil tıklama doğrulaması yapılamadı. Ölçülmüş kasma giderme, sıfır hata veya gerçek santral/HBYS çalışması iddia edilmez.

Veri silinmez. HMAC anahtarı kaynak kodda bulunmaz. Ücretli hizmet ve yeni dış kişisel veri aktarımı açılmaz. Yayın Sites üzerinden yapılır; dış GitHub main dalı ile otomatik eşitlik varsayılmaz.
