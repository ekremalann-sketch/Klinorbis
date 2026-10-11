# Klinorbis v50 paket birleştirmesi

GitHub main, v50 ZIP ve mevcut Sites kaynak commit'i 347f72e karşılaştırıldı. Yayındaki eşzamanlı çağrı üstlenme, atomik denetim kaydı, hasta kodu doğrulaması, eğitim/gerçek kayıt ayrımı ve sınırlı mesaj yükü korunarak v50'nin koordinasyon ekranı ve hasta adı maskelemesi birleştirildi.

Yerel sonuçlar local_completed olarak saklanır. Sayımlar önceki completed_local kayıtlarını da yerel sayar; geçmiş kayıtlar değiştirilmez. Harici orkestratör kabulü, hasta mesajının teslim kanıtı olarak sunulmaz.

Link kullanımı, tipler, render sırasında bileşen oluşturma ve ilk yükleme sorunları düzeltildi. 144/144 test, TypeScript kontrolü ve üretim derlemesi geçti. Lint sıfır hata ve beş uyarı ile tamamlandı. Testler sentetik veri kullanır.

Kaynakta beş dakikalık Worker cron tanımı bulunur; gerçek üretim tetikleyicisinin etkinliği ve son çalışma zamanı ayrıca doğrulanmalıdır. Yeni ücretli plan veya dış entegrasyon satın alınmadı. Yapay zekâ önerisi yalnız yapılandırılmış kurum anahtarıyla ve toplu sayılarla çalışır; otomatik klinik karar üretmez.

Giriş gerektiren gerçek hastane ekranlarında insan oturumu ile tarayıcı doğrulaması yapılmadı. Rakip raporunun bütün orta vadeli önerileri tamamlanmış sayılmaz. Zorunlu yeni iki aşamalı doğrulama eklenmedi.
