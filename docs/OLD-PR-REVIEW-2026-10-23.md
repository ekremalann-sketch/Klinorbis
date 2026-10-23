# Eski PR envanteri — 23 Ekim 2026

İstenen aralıkta açık ve birleşmemiş altı PR bulundu. Hiçbiri kapatılmadı. `git cherry origin/main <PR-head>` hepsinde ana dalda birebir patch eşdeğeri olmayan commit buldu; dolayısıyla “zaten tamamen birleşti” denemez. Eski dalın son hâliyle ana dalın doğrudan farkı, sonradan eklenen bütün dosyaları silinmiş gibi gösterir; değerlendirmede PR'ın ortak atadan farkı esas alındı.

| Depo / PR | Durum | İnceleme ve öneri |
|---|---|---|
| [Teksanor #1](https://github.com/ekremalann-sketch/Teksanor/pull/1) | Açık, birleşmemiş | Eski panel/kurumsal sayfa/kurlar; 1 eşdeğer olmayan commit, 13 dosya. Ana dalda yeni panel, kurumsal sayfalar ve döviz altyapısı var. Eski bütün dalı birleştirmek yerine yalnız eksik ürün fikri seçilerek taşındıktan sonra kapatılmasını öneririm; birebir tekrar olduğu kanıtlanmadı. |
| [Teksanor #13](https://github.com/ekremalann-sketch/Teksanor/pull/13) | Açık, birleşmemiş | Vitrin/lisans/İngilizce dokümanlar; 23 eşdeğer olmayan commit, 20 dosya. Güncel ürün vitrini ve güven sayfalarıyla örtüşüyor. Eksik lisans/destek metinleri incelenip taşındıktan sonra eski toplu PR'ın kapatılması önerilir; hukuki metinler otomatik onaylanmadı. |
| [Teksanor #23](https://github.com/ekremalann-sketch/Teksanor/pull/23) | Açık, birleşmemiş | Yetki/finans/onay güvenliği; 2 commit, 21 dosya. Güncel ana dalda benzer erişim matrisi, finans ve mahremiyet testleri var, fakat tam eşdeğerlik kanıtlanmadı. Şimdilik açık tut; tek tek güvenlik farkları karşılaştırılmadan gereksiz sayma. |
| [Teksanor #24](https://github.com/ekremalann-sketch/Teksanor/pull/24) | Açık, birleşmemiş | PWA güncellemesini kullanıcı onayıyla etkinleştirme; 2 commit, 2 dosya. İşlevsel ve dar kapsamlı; mevcut bağımlılık/Pages işleri sonrası güncel ana dala uyarlanıp test edilmeli. Kapatma önerisi yok. |
| [Klinorbis #11](https://github.com/ekremalann-sketch/Klinorbis/pull/11) | Açık, birleşmemiş | Türkçe acil ifadeler; 1 commit, 2 dosya. Eski `urgencySignal` puan/klinik birim öneriyordu. Güncel `emergencyWordsNotice` ekli biçimler, olumsuzlama ve ADR-003 sınırı için geçen testlere sahip. Eski PR'ın güncel karşılığı mevcut olduğundan kapatılmasını öneririm; eski klinik puanlama kodunu geri getirmemek gerekir. |
| [Klinorbis #12](https://github.com/ekremalann-sketch/Klinorbis/pull/12) | Açık, birleşmemiş | Sürekli ilerleyen sentetik demo; 1 commit, 1 dosya. Tamamen birleşmiş değil: otomatik görsel senaryo zamanlayıcısı mevcut demoda yok. Mevcut etkileşimli talep turu ve sanal hastane benzer amacı karşılıyor. Ürün kararıyla yalnız zamanlayıcı gerekiyorsa güncel demoya uyarlayıp sonra kapat; doğrudan gereksiz sayma. |

Teksanor #2, #3, #5–#12, #14–#22 birleşmiş ve kapalı. #4, alınan PR envanterinde yok; PR olduğu doğrulanamadı. Klinorbis #1–#10 birleşmiş ve kapalı. Teksanor #25 ve Klinorbis #19 bu eski PR aralığının dışında kalan güvenlik kurulum PR'larıdır; değiştirilmedi.

Öneriler hiçbir kapatma/birleştirme yetkisi kullanmaz. Son karar kullanıcıya aittir.
