// "Operasyon": operasyon yöneticisinin ilk ekranı — yalnız müdahale gerektirenler. Yönetime yükselmiş işler, sahipsiz
// geciken işler, birimler arası bekleyen akış adımları, engel/yardım istekleri ve yatak kullanılabilirliğinin nedenleri.
// Ayrıntı (eski genel pano) istenince açılır. Entegrasyon/sistem ayarları buraya karışmaz.
import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { capacitySnapshots, operationalTasks, playbookRuns, playbookSteps } from "../db/schema";
import { demoEnabled } from "./automation-policy";
import { findUnit } from "./hospital-units";
import { fallbackTitle } from "./my-work";
import { playbookOf } from "./playbooks";
import { SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
const OPEN = ["queued", "accepted", "in_progress"];
const MIN = 60_000;

export async function opsFocus(db: Db, actor: RequestActor, now = new Date()) {
  if (actor.role !== "operations_manager") throw new SecurityError(403, "Operasyon ekranını operasyon yöneticisi kullanır.", "OPERATIONS_MANAGER_REQUIRED");
  const pilot = demoEnabled() ? undefined : sql`${operationalTasks.sourceType} not like 'pilot_%'`;
  const risky = await db.select().from(operationalTasks).where(and(inArray(operationalTasks.status, OPEN), pilot,
    or(eq(operationalTasks.escalationLevel, 2), and(isNull(operationalTasks.assignedUser), lt(operationalTasks.dueAt, now)), sql`${operationalTasks.blockedReason} is not null`, sql`${operationalTasks.helpRequestedAt} is not null`)))
    .limit(200);
  const items = risky.map((t) => {
    const reason = t.blockedReason ? `Engel: ${t.blockedReason}` : t.helpRequestedAt ? "Görevli yardım istedi" : t.escalationLevel === 2 ? "Birim düzeyinde çözülmedi, yönetime yükseldi" : "Sahipsiz ve hedef süresi geçti";
    const kind = t.blockedReason ? "engel" : t.helpRequestedAt ? "yardim" : t.escalationLevel === 2 ? "yukselme" : "sahipsiz";
    const late = t.dueAt ? Math.max(0, Math.round((now.getTime() - new Date(t.dueAt).getTime()) / MIN)) : 0;
    return { reference: t.reference, kind, title: t.title ?? fallbackTitle(t), unitCode: t.unitCode, unitName: findUnit(t.unitCode).name, location: t.location, reason, lateMinutes: late,
      owner: t.assignedUser ? "Atanmış" : "Sahipsiz", next: t.assignedUser ? "Birim sorumlusuyla görüşün veya yeniden görevlendirin" : "Birimim ekranından birine atayın", link: `/birimim?birim=${t.unitCode}` };
  }).sort((a, b) => ({ engel: 0, yukselme: 1, yardim: 2, sahipsiz: 3 }[a.kind]! - { engel: 0, yukselme: 1, yardim: 2, sahipsiz: 3 }[b.kind]!) || b.lateMinutes - a.lateMinutes);

  // Birimler arası bekleyen akışlar: etkin adım hedef süresini aştı (sorumlu birim + sonraki birim).
  const active = await db.select().from(playbookRuns).where(eq(playbookRuns.status, "active")).limit(300);
  const steps = active.length ? await db.select().from(playbookSteps).where(and(inArray(playbookSteps.runReference, active.map((r) => r.reference)), isNull(playbookSteps.completedAt))) : [];
  const waiting = active.flatMap((r) => {
    const s = steps.find((x) => x.runReference === r.reference && x.stepIndex === r.currentStep);
    const pb = playbookOf(r.playbookCode);
    if (!s || !pb || !s.dueAt || new Date(s.dueAt).getTime() > now.getTime()) return [];
    const next = pb.steps[r.currentStep + 1];
    return [{ reference: r.reference, title: r.title, waitingAt: findUnit(s.unitCode).name, task: s.task, lateMinutes: Math.round((now.getTime() - new Date(s.dueAt).getTime()) / MIN), next: next ? findUnit(next.unitCode).name : "Akış sonu", link: "/playbooks" }];
  }).sort((a, b) => b.lateMinutes - a.lateMinutes).slice(0, 20);

  // Yatak kullanılabilirliği: neden boş yatak yok?
  const cap = await db.select().from(capacitySnapshots).where(demoEnabled() ? undefined : sql`facility_code not in (select code from facilities where name like '%Pilot%')`);
  const beds = cap.reduce((a, r) => ({ total: a.total + r.total, occupied: a.occupied + r.occupied, reserved: a.reserved + r.reserved, blocked: a.blocked + r.blocked, cleaning: a.cleaning + r.cleaning }), { total: 0, occupied: 0, reserved: 0, blocked: 0, cleaning: 0 });
  const available = Math.max(0, beds.total - beds.occupied - beds.reserved - beds.blocked - beds.cleaning);
  const counts = { engel: 0, yukselme: 0, yardim: 0, sahipsiz: 0 } as Record<string, number>;
  for (const i of items) counts[i.kind]++;
  const unassignedTotal = (await db.select({ n: sql<number>`count(*)` }).from(operationalTasks).where(and(inArray(operationalTasks.status, ["queued"]), isNull(operationalTasks.assignedUser), notInArray(operationalTasks.sourceType, ["pilot_task"]), pilot)))[0]?.n ?? 0;
  return {
    items: items.slice(0, 30), counts, unassignedTotal: Number(unassignedTotal), waiting,
    beds: { ...beds, available, reasons: [
      { label: "Dolu", value: beds.occupied }, { label: "Temizlik bekliyor", value: beds.cleaning }, { label: "Engelli (teknik/personel)", value: beds.blocked }, { label: "Ayrılmış", value: beds.reserved },
    ].filter((r) => r.value > 0), source: demoEnabled() ? "Kurgusal kapasite kaydı (eğitim modu)" : "Sunucudaki kapasite kaydı; HBYS bağlı değilse elle güncellenir" },
  };
}
