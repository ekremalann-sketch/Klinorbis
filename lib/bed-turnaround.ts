// Çözüm Mimarı K1: yatak dönüş süresi segmentleri (boşaldı → temizlik kabul → başladı → bitti → kontrol/hazır).
// Kaynak: temizlik işinin açılış zamanı ve işlem kaydındaki (simops_log) adım zamanları. Operasyon ölçüsüdür.
export const SEGMENTS = [
  { key: "wait", label: "Boşaldı → temizlik kabul", from: "created", to: "job.accept" },
  { key: "travel", label: "Kabul → temizlik başladı", from: "job.accept", to: "job.start" },
  { key: "clean", label: "Temizlik süresi", from: "job.start", to: "job.complete" },
  { key: "check", label: "Bitti → kontrol (hazır)", from: "job.complete", to: "job.inspect" },
] as const;
export type StepTimes = Record<string, number>;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
/** Her iş için adım zamanları → segment başına ortanca dakika ve örnek sayısı; toplam dönüş süresi ortancası. */
export function turnaround(jobs: StepTimes[]) {
  const seg = SEGMENTS.map((s) => {
    const mins = jobs.filter((j) => j[s.from] != null && j[s.to] != null && j[s.to]! >= j[s.from]!).map((j) => Math.round((j[s.to]! - j[s.from]!) / 60000));
    return { key: s.key, label: s.label, medianMin: median(mins), count: mins.length };
  });
  const totals = jobs.filter((j) => j.created != null && j["job.inspect"] != null).map((j) => Math.round((j["job.inspect"]! - j.created!) / 60000));
  return { segments: seg, totalMedianMin: median(totals), completed: totals.length };
}
