// K5: Yatak panosu — 6 durum, renk ve "bu durumda kaç dakikadır" sayacı. Hasta adı hiçbir zaman gösterilmez.
export type BoardBed = { physical: string; hbys: string; cleaning: string; technical: number | boolean; staffed: number | boolean; review: number | boolean; ready?: boolean; stale?: boolean; state_since?: number | null };
export type BoardStateKey = "dolu" | "kirli" | "temizleniyor" | "kontrol" | "hazir" | "engelli";

export const BOARD_STATES: { key: BoardStateKey; label: string; tone: string }[] = [
  { key: "dolu", label: "Dolu", tone: "info" },
  { key: "kirli", label: "Temizlik bekliyor", tone: "warn" },
  { key: "temizleniyor", label: "Temizleniyor", tone: "progress" },
  { key: "kontrol", label: "Kontrol bekliyor", tone: "check" },
  { key: "hazir", label: "Hazır", tone: "ok" },
  { key: "engelli", label: "Kullanılamaz", tone: "blocked" },
];
const BY_KEY = Object.fromEntries(BOARD_STATES.map((s) => [s.key, s])) as Record<BoardStateKey, (typeof BOARD_STATES)[number]>;

export function boardState(b: BoardBed): (typeof BOARD_STATES)[number] {
  if (!b.technical || !b.staffed || b.review || b.stale) return BY_KEY.engelli;
  if (b.ready || b.cleaning === "ready") return b.hbys === "occupied" || b.physical === "occupied" ? BY_KEY.dolu : BY_KEY.hazir;
  if (b.hbys === "occupied" || b.physical === "occupied") return BY_KEY.dolu;
  if (b.cleaning === "active") return BY_KEY.temizleniyor;
  if (b.cleaning === "check") return BY_KEY.kontrol;
  return BY_KEY.kirli;
}

/** "Bu durumda X dk" / "X sa Y dk". Zaman bilinmiyorsa null. */
export function minutesInState(stateSince: number | null | undefined, now: number): number | null {
  if (!stateSince || !Number.isFinite(stateSince) || stateSince > now + 60_000) return null;
  return Math.max(0, Math.floor((now - stateSince) / 60_000));
}
export function durationLabel(minutes: number | null): string {
  if (minutes === null) return "süre bilinmiyor";
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}
