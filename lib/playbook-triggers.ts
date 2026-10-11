// Olay → akış eşlemesi. Hastane sistemlerinden (HBYS, biyomedikal, bina yönetimi, stok, güvenlik) gelen
// imzalı olaylar veya Klinorbis'in kendi kayıtları (ör. şikâyet talebi) ilgili akışı kendiliğinden başlatır.
// Aynı olay kimliği ikinci kez gelirse yeni akış açılmaz.
export type EventTrigger = { type: string; label: string; source: string; playbook: string };

export const EVENT_TRIGGERS: EventTrigger[] = [
  { type: "patient.discharged", label: "Hasta taburcu oldu (odadan çıktı)", source: "HBYS", playbook: "yatak-hazirlik" },
  { type: "discharge.ordered", label: "Taburcu kararı girildi", source: "HBYS", playbook: "taburcu-planli" },
  { type: "transfer.ordered", label: "Servisler arası nakil kararı", source: "HBYS", playbook: "servis-nakil" },
  { type: "ed.boarding", label: "Acilde yatış bekleyen hasta", source: "HBYS", playbook: "acil-yatis-bekleyen" },
  { type: "icu.bed_requested", label: "Yoğun bakım yatağı istendi", source: "HBYS", playbook: "yogun-bakim-yatak" },
  { type: "referral.incoming", label: "Dış merkezden sevk talebi", source: "Sevk sistemi", playbook: "gelen-sevk" },
  { type: "capacity.red", label: "Doluluk %95'i aştı", source: "Klinorbis kapasite", playbook: "kapasite-kirmizi" },
  { type: "surgery.cancelled", label: "Ameliyat aynı gün iptal edildi", source: "Ameliyathane", playbook: "ameliyat-iptal" },
  { type: "device.failure", label: "Tıbbi cihaz arıza bildirimi", source: "Biyomedikal", playbook: "cihaz-ariza" },
  { type: "imaging.down", label: "MR/BT cihazı durdu", source: "Radyoloji (PACS/RIS)", playbook: "goruntuleme-durus" },
  { type: "power.outage", label: "Şebeke elektriği kesildi", source: "Bina yönetim sistemi", playbook: "elektrik-kesinti" },
  { type: "water.outage", label: "Şebeke suyu kesildi", source: "Bina yönetim sistemi", playbook: "su-kesinti" },
  { type: "medgas.alarm", label: "Medikal gaz basınç alarmı", source: "Bina yönetim sistemi", playbook: "medikal-gaz" },
  { type: "or.climate_alarm", label: "Ameliyathane ısı/nem sapması", source: "Bina yönetim sistemi", playbook: "ameliyathane-iklim" },
  { type: "fire.alarm", label: "Yangın alarmı", source: "Yangın paneli", playbook: "yangin" },
  { type: "stock.critical", label: "Kritik malzeme emniyet stoğunun altında", source: "Stok sistemi", playbook: "stok-kritik" },
  { type: "coldchain.alarm", label: "İlaç buzdolabı sıcaklık alarmı", source: "Sıcaklık sensörü", playbook: "soguk-zincir" },
  { type: "recall.notice", label: "Ürün geri çekme duyurusu", source: "Tedarikçi / otorite", playbook: "geri-cekme" },
  { type: "blood.low", label: "Kan ürünü stoğu azaldı", source: "Kan merkezi", playbook: "kan-stok" },
  { type: "his.outage", label: "HBYS erişilemiyor", source: "BT izleme", playbook: "hbys-kesinti" },
  { type: "security.incident", label: "Şüpheli siber olay", source: "SIEM / BT güvenlik", playbook: "siber-olay" },
  { type: "staff.joined", label: "Yeni personel başladı", source: "İK / personel sistemi", playbook: "yetki-acma" },
  { type: "staff.left", label: "Personel ayrıldı", source: "İK / personel sistemi", playbook: "yetki-kapatma" },
  { type: "complaint.received", label: "Şikâyet kaydı açıldı", source: "Klinorbis talep kaydı", playbook: "sikayet" },
  { type: "callcenter.overflow", label: "Çağrı kuyruğu eşiği aşıldı", source: "Santral", playbook: "cagri-tasma" },
  { type: "patient.fall", label: "Hasta düşmesi bildirildi", source: "Olay bildirim sistemi", playbook: "hasta-dusme" },
];

export function triggerFor(type: string) { return EVENT_TRIGGERS.find((t) => t.type === type) ?? null; }
