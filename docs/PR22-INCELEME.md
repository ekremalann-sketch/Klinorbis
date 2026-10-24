# PR #22 inceleme düzeltmeleri

98 birimlik rehber, 6 grup ve 28 operasyonel talep türü korundu. Klinik istem ve tıbbi sonuç onayı HBYS'de kalır.

- Yeniden açılan talep, yönlendirme sonradan değişse bile önceki birime döner. Eski talebin işaretlenmesi ve yeni görev/talep/bildirim/denetim aynı D1 işlemindedir.
- Tamamlama, talep durumu, bildirim ve denetim tek işlemdedir. Eşzamanlı tamamlama ve yeniden açma tek başarı üretir; veritabanı hatası yarım kayıt bırakmaz.
- Birim üyeliği kaldırılmış görevli eski görevini başlatamaz veya tamamlayamaz.
- Birim rehberi hizmetleri görünür; başka birimlerin ekip/açık iş/sahipsiz iş sayıları birim sorumlusuna verilmez. Sayılar veritabanında toplanır, 5.000 kayıtla kesilmez. Üretimde pilot görevler sayılmaz.
- Bilgi güvenliği yetkilisi rehberi okuyabilir; mevcut rol haritasındaki görev ayrılığı gereği operasyon yönlendirmesini değiştiremez. Düzenleme operasyon yöneticisi veya BTI birim sorumlusundadır.

Doğrulama: `npm test` 415/415; `node node_modules/typescript/bin/tsc --noEmit`, `npm run lint`, doğrulanmış Worker derlemesi başarılı. Testler, 0014'ün eski tüm tabloların tanımını ve kayıtlarını korumasını ve hata/eşzamanlılık senaryolarını kapsar. Yerel D1 ve 390 piksel tarayıcıda birim arama, talep açma ve BTI'ye ulaştığını görme denendi. Gerçek kullanıcı/HBYS testi ve üretim migrasyonu yapılmadı.

Yayın öncesi `drizzle/0014_birim_yonlendirme.sql` mevcut migrasyon yönetimiyle uygulanmalıdır. Elle durumu değiştirmeden önce hedef ortam ve mevcut migrasyon günlüğü kontrol edilmelidir. Ana dala birleştirme ve canlı yayın bu incelemenin dışında tutulmuştur.
