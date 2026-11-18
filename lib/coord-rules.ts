// K7: koordinasyon işleri kural tablosu (istemci ve sunucu ortak; bağımlılıksız). Hedef süreler [Öneri].
export const COORD_RULES = {
  cleaning: { label: "Temizlik", acceptMin: 15, doneMin: 45, checkMin: 15 },
  transport: { label: "Taşıma", acceptMin: 5, doneMin: 30, checkMin: 0 },
  review: { label: "İnceleme", acceptMin: 30, doneMin: 60, checkMin: 0 },
} as const;
/** Hedef aşıldıktan sonra: 0 dk kişi (işi yapan ya da birim), +15 dk lider (birim sorumlusu), +30 dk yönetim. */
export const CHAIN = [{ level: 1, after: 0, who: "Kişi" }, { level: 2, after: 15, who: "Ekip lideri" }, { level: 3, after: 30, who: "Yönetim" }] as const;


// K6: taşıma ayrıntıları (operasyon bilgisi; klinik uygunluğu yetkili personel belirler).
export const TRANSPORT_MODES = { sedye: "Sedye", tekerlekli: "Tekerlekli sandalye", yatak: "Yatakla", yuruyerek: "Yürüyerek (refakatli)" } as const;
export const URGENCY = { planli: "Planlı", acil: "Acil" } as const;
export const DELAY_REASONS = { hasta_hazir_degil: "Hasta hazır değildi", personel_yok: "Taşıma personeli yoktu", ekipman_yok: "Sedye/sandalye yoktu", hedef_hazir_degil: "Hedef birim hazır değildi", asansor: "Asansör/yol sorunu", diger: "Diğer" } as const;
/** Taşıma hedef süresi (kabul + bitirme) aşıldı mı. */
export function transportLate(createdAt: number, now: number) { return now - createdAt > (COORD_RULES.transport.acceptMin + COORD_RULES.transport.doneMin) * 60_000; }
