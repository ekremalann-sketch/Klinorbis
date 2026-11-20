// K4: Temizlik ve taşıma personeli için telefonda tek düğmeli iş ekranı.
// QR: yatak başındaki etiket /temizlik?yatak=YTK-SIM-001 adresini açar; ekran o yatağın işini en üste getirir.
// Akış: "İşi al" → "Başla" → "Bitir" (3 dokunuş). Kontrolü işi yapandan farklı yetkili yapar ("Kontrol edildi").
export type PhoneJob = { id: string; kind: string; bed: string; target: string | null; status: string; owner: string | null; version: number; created_at: number };
export type PhoneStep = { action: string; label: string; needsDelivery?: boolean } | null;

const OPEN = ["queued", "accepted", "active", "check"];

/** Kişinin görebileceği işler: önce QR ile okutulan yatak, sonra kendi işleri, sonra alınabilecekler. */
export function phoneJobs<T extends PhoneJob>(jobs: T[], me: string, kind: "cleaning" | "transport", bed?: string | null, canInspect = false): T[] {
  const mine = (j: T) => j.owner === me;
  const visible = jobs.filter((j) => j.kind === kind && OPEN.includes(j.status) && (
    j.status === "queued" || mine(j) || (canInspect && j.status === "check" && !mine(j))
  ));
  const rank = (j: T) => (bed && j.bed === bed ? 0 : mine(j) ? 1 : j.status === "check" ? 2 : 3);
  return [...visible].sort((a, b) => rank(a) - rank(b) || a.created_at - b.created_at);
}

export function phoneStep(job: PhoneJob, me: string, canInspect = false): PhoneStep {
  const mine = job.owner === me;
  if (job.status === "queued") return { action: "accept", label: "İşi al" };
  if (job.status === "accepted" && mine) return { action: "start", label: job.kind === "transport" ? "Hastayı aldım" : "Başla" };
  if (job.status === "active" && mine) return job.kind === "transport" ? { action: "deliver", label: "Teslim ettim", needsDelivery: true } : { action: "complete", label: "Bitir" };
  if (job.status === "check" && canInspect && !mine) return { action: "inspect", label: "Kontrol edildi, yatak hazır" };
  return null;
}

export const PHONE_STATUS: Record<string, string> = { queued: "Bekliyor", accepted: "Sende", active: "Yapılıyor", check: "Kontrol bekliyor" };
