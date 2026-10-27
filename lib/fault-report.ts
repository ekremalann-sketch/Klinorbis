// Arıza bildirimi: her personel en az alanla arıza bildirir; doğru teknik birime giden akış açılır ve sahiplik görünür.
// İşin bitişi (teknik ekip akışı kapatır) ile bildirenin kabulü (giderildi / sorun sürüyor) ayrı izlenir.
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { faultReports } from "../db/schema";
import { auditStatements } from "./audit";
import { findUnit } from "./hospital-units";
import { cleanRunFields, newReference, runBatch, runStatements, stepNotifications } from "./playbook-store";
import { playbookOf } from "./playbooks";
import { redactPII } from "./privacy";
import { SecurityError, type RequestActor } from "./security";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
export const FAULT_CATEGORIES: Record<string, { label: string; playbook: string; device: boolean }> = {
  cihaz: { label: "Tıbbi cihaz", playbook: "cihaz-ariza", device: true },
  oda: { label: "Oda / mobilya / tesisat", playbook: "oda-bakim", device: false },
  elektrik: { label: "Elektrik / aydınlatma", playbook: "oda-bakim", device: false },
  iklim: { label: "Isıtma / soğutma", playbook: "oda-bakim", device: false },
  asansor: { label: "Asansör", playbook: "asansor-ariza", device: false },
  diger: { label: "Diğer teknik sorun", playbook: "oda-bakim", device: false },
};
const WRITERS = ["operations_manager", "unit_manager", "clinician", "call_agent"];

export async function reportFault(db: Db, actor: RequestActor, input: { category?: unknown; location?: unknown; deviceCode?: unknown; note?: unknown; campus?: unknown }, now = new Date()) {
  if (!WRITERS.includes(actor.role)) throw new SecurityError(403, "Gözetim rolleri arıza bildirimi açamaz.", "OPERATION_ROLE_REQUIRED");
  const cat = typeof input.category === "string" ? FAULT_CATEGORIES[input.category] : undefined;
  if (!cat) throw new SecurityError(400, "Arıza türünü seçin.", "INVALID_INPUT");
  const pb = playbookOf(cat.playbook);
  if (!pb) throw new SecurityError(500, "Arıza akışı tanımlı değil.", "CONFIG");
  const fields = cleanRunFields({ location: input.location, deviceCode: cat.device ? input.deviceCode : undefined, campus: input.campus });
  const noteText = typeof input.note === "string" && input.note.trim() ? redactPII(input.note.trim().slice(0, 300)).maskedText : null;
  const runRef = newReference(pb.code);
  const reference = `ARZ-${now.getTime().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
  const unitName = actor.unitCodes[0] ? findUnit(actor.unitCodes[0]).name : null;
  const note = [`Arıza bildirimi (${cat.label})`, unitName ? `bildiren birim: ${unitName}` : null, noteText].filter(Boolean).join(" · ");
  await runBatch(db, [
    ...runStatements(db, pb, { reference: runRef, startedBy: actor.email, note, parentReference: null, triggerEvent: `fault:${reference}`, now, fields }),
    db.insert(faultReports).values({ reference, runReference: runRef, category: input.category as string, reporterEmail: actor.email, reporterUnit: actor.unitCodes[0] ?? null, createdAt: now }),
    ...await stepNotifications(db, runRef, pb, 0, now),
    ...await auditStatements(db, [{ actor: actor.email, action: "fault.reported", resource: reference, detail: `${cat.label} → ${findUnit(pb.steps[0].unitCode).name}` }]),
  ] as Stmt[], "Arıza kaydı açılamadı; tekrar deneyin.");
  return { reference, runReference: runRef, routedTo: findUnit(pb.steps[0].unitCode).name, firstStep: pb.steps[0].task };
}

/** Bildirenin kabulü: giderildi → kapanır; sorun sürüyor → aynı akış yeniden açılır (öncekine bağlı). */
export async function confirmFault(db: Db, actor: RequestActor, reference: string, resolved: boolean, note: unknown, now = new Date()) {
  const [f] = await db.select().from(faultReports).where(eq(faultReports.reference, reference)).limit(1);
  if (!f || f.reporterEmail !== actor.email) throw new SecurityError(404, "Arıza bildirimi bulunamadı.", "NOT_FOUND");
  if (f.status !== "awaiting_confirmation") throw new SecurityError(409, f.status === "open" ? "Teknik ekip işi henüz kapatmadı." : "Bu bildirim zaten yanıtlandı.", "FAULT_STATE");
  if (resolved) {
    await db.batch([db.update(faultReports).set({ status: "confirmed", confirmedAt: now }).where(and(eq(faultReports.reference, reference), eq(faultReports.status, "awaiting_confirmation"))),
      ...await auditStatements(db, [{ actor: actor.email, action: "fault.confirmed", resource: reference, detail: "giderildi" }])] as [Stmt, ...Stmt[]]);
    return { reference, status: "confirmed" };
  }
  const cat = FAULT_CATEGORIES[f.category];
  const pb = playbookOf(cat?.playbook ?? "oda-bakim")!;
  const text = typeof note === "string" && note.trim() ? redactPII(note.trim().slice(0, 300)).maskedText : "Sorun sürüyor";
  const runRef = newReference(pb.code);
  const newRef = `${reference}-T${now.getTime().toString(36).slice(-3).toUpperCase()}`.slice(0, 40);
  await runBatch(db, [
    db.update(faultReports).set({ status: "reopened", reopenedRunReference: runRef }).where(and(eq(faultReports.reference, reference), eq(faultReports.status, "awaiting_confirmation"))),
    ...runStatements(db, pb, { reference: runRef, startedBy: actor.email, note: `Yeniden açıldı (${reference}): ${text}`, parentReference: f.runReference, triggerEvent: `fault:${newRef}`, now }),
    db.insert(faultReports).values({ reference: newRef, runReference: runRef, category: f.category, reporterEmail: actor.email, reporterUnit: f.reporterUnit, createdAt: now }),
    ...await stepNotifications(db, runRef, pb, 0, now),
    ...await auditStatements(db, [{ actor: actor.email, action: "fault.reopened", resource: reference, detail: text }]),
  ] as Stmt[], "Yeniden açılamadı; tekrar deneyin.");
  return { reference: newRef, status: "reopened" };
}
