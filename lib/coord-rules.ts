// K7: koordinasyon işleri kural tablosu (istemci ve sunucu ortak; bağımlılıksız). Hedef süreler [Öneri].
export const COORD_RULES = {
  cleaning: { label: "Temizlik", acceptMin: 15, doneMin: 45, checkMin: 15 },
  transport: { label: "Taşıma", acceptMin: 5, doneMin: 30, checkMin: 0 },
  review: { label: "İnceleme", acceptMin: 30, doneMin: 60, checkMin: 0 },
} as const;
/** Hedef aşıldıktan sonra: 0 dk kişi (işi yapan ya da birim), +15 dk lider (birim sorumlusu), +30 dk yönetim. */
export const CHAIN = [{ level: 1, after: 0, who: "Kişi" }, { level: 2, after: 15, who: "Ekip lideri" }, { level: 3, after: 30, who: "Yönetim" }] as const;

