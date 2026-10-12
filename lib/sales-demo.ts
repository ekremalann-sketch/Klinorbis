export type DemoStatus = "new" | "assigned" | "approval" | "transfer" | "completed";
export type DemoRequest = { id: string; unit: string; target: string; priority: string; status: DemoStatus; history: string[] };
export type DemoAction = "claim" | "review" | "approve" | "reject" | "transfer" | "accept" | "complete";
export const demoStatusLabels: Record<DemoStatus, string> = { new: "Yeni", assigned: "Üstlenildi", approval: "İnsan onayı bekliyor", transfer: "Devir kabulü bekliyor", completed: "Tamamlandı" };
export function advanceDemo(request: DemoRequest, action: DemoAction, target = ""): DemoRequest {
  const transitions: Partial<Record<DemoAction, { from: DemoStatus[]; to: DemoStatus; label: string }>> = {
    claim: { from: ["new"], to: "assigned", label: "Birim sorumlusu talebi üstlendi" },
    review: { from: ["assigned"], to: "approval", label: "Yetkili insan onayına sunuldu" },
    approve: { from: ["approval"], to: "assigned", label: "Yetkili kişi demo onayı verdi" },
    reject: { from: ["approval"], to: "assigned", label: "Onay reddedildi; talep birime iade edildi" },
    transfer: { from: ["assigned"], to: "transfer", label: `Devir önerildi: ${request.unit} → ${target}` },
    accept: { from: ["transfer"], to: "assigned", label: `Hedef birim devri kabul etti: ${request.target}` },
    complete: { from: ["assigned"], to: "completed", label: "Operasyon görevi tamamlandı" },
  };
  const transition = transitions[action];
  if (!transition || !transition.from.includes(request.status)) throw new Error("Bu adım mevcut talep durumunda uygulanamaz.");
  if (action === "transfer" && (!target || target === request.unit)) throw new Error("Farklı bir hedef birim seçin.");
  return { ...request, status: transition.to, unit: action === "accept" ? request.target : request.unit, target: action === "transfer" ? target : action === "accept" ? "" : request.target, history: [...request.history, transition.label] };
}
