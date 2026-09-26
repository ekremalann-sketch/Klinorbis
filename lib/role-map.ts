// Rol haritası: istemci ve sunucu ortak kullanır (veri tabanı bağımlılığı yok).
export type RoleKey = "operations_manager" | "unit_manager" | "clinician" | "call_agent" | "privacy_officer" | "security_officer";
/** Rol haritası: kim nerede çalışır, ne yapar, neyi yapamaz. Arayüz ve README aynı kaynağı kullanır. */
export const ROLE_MAP: Record<RoleKey, { title: string; home: string; homePath: string; does: string[]; cannot: string[] }> = {
  operations_manager: {
    title: "Operasyon Yöneticisi",
    home: "Ortak İş Kutusu (tüm birimler) · Personel ve Yetki", homePath: "/inbox",
    does: ["Tüm birimleri ve hastaneleri görür", "Personel ekler, rol ve birim atar, pasife alır", "İnsan onayı verir, devirleri izler ve iptal eder", "Otomasyonu başlatır, güvenlik olaylarını görür"],
    cannot: ["Kendi hesabını pasife alamaz veya rolünü düşüremez"],
  },
  unit_manager: {
    title: "Birim Sorumlusu",
    home: "Ortak İş Kutusu (kendi birimleri)", homePath: "/inbox",
    does: ["Birim kuyruğundaki talepleri üstlenir, işler, sonuçlandırır, başka birime aktarır", "Birimindeki insan onaylarını verir", "Vardiya devri başlatır ve kabul eder"],
    cannot: ["Başka birimin kayıtlarını göremez", "Personel ve rol atayamaz"],
  },
  clinician: {
    title: "Klinik Rol",
    home: "İnsan Onayları ve birim kuyruğu", homePath: "/approvals",
    does: ["Kritik adımda insan onayı verir veya reddeder", "Birim taleplerini işler", "Vardiya devri başlatır ve kabul eder"],
    cannot: ["Sistem tanı veya tedavi kararı üretmez; karar klinik personeldedir", "Başka birimin kayıtlarını göremez"],
  },
  call_agent: {
    title: "Çağrı Merkezi Görevlisi",
    home: "Çağrı ve Konuşmalar", homePath: "/calls",
    does: ["Gelen çağrıyı karşılar, talep açar, doğru birime yönlendirir", "Kendi birimindeki talepleri üstlenir ve işler", "Vardiya devri başlatır ve kabul eder"],
    cannot: ["İnsan onayı veremez (kritik karar)", "Başka birimin kayıtlarını göremez"],
  },
  privacy_officer: {
    title: "KVKK Yetkilisi",
    home: "KVKK ve Etik · Denetim İzleri", homePath: "/privacy",
    does: ["Tüm birimleri salt okunur izler", "Denetim izini ve maskeleme kurallarını denetler", "Rapor dışa aktarır"],
    cannot: ["Talep, onay veya devir üzerinde işlem yapamaz (görev ayrılığı)"],
  },
  security_officer: {
    title: "Bilgi Güvenliği Yetkilisi",
    home: "Siber Güvenlik Merkezi", homePath: "/security",
    does: ["Güvenlik olaylarını ve webhook durumunu izler", "Otomasyonu durdurup yeniden çalıştırabilir", "Denetim izini okur"],
    cannot: ["Talep, onay veya devir üzerinde işlem yapamaz (görev ayrılığı)"],
  },
};

