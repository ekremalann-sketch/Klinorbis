// Response metadata changes on every poll; compare the operational content instead.
// Eğitim gösterim motorlarının saatten türetilen adım alanları (step, stepLabel, nextStepAt) da karşılaştırmaya girmez;
// aksi halde her 5 sn'de tüm panel yeniden çiziliyordu. Gerçek kayıt değişikliği her zaman yeniden çizim tetikler.
const VOLATILE = new Set(["generatedAt", "ageSeconds", "step", "stepLabel", "nextStepAt"]);
export function workspaceContentKey(value: unknown): string {
  return JSON.stringify(value, (key, item) => VOLATILE.has(key) ? undefined : item);
}
