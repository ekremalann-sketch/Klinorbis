// Talep yönlendirme ve birimden talep.
//  - Her talep türü tek bir birime gider (varsayılan: lib/unit-directory.ts; kurum değişikliği: routing_rules).
//  - Yönlendirmeyi operasyon yöneticisi veya Bilgi Teknolojileri birim sorumlusu değiştirir;
//    her değişiklik denetim kaydına yazılır.
//  - Talep, hedef birimde sahipsiz görev olarak açılır; işi o birimin sorumlusu dağıtır (Birimim) veya ekipten biri kabul eder.
//  - İş bitince talep eden kişiye bildirilir; talep eden "tamam" ya da "sorun sürüyor" der (sürüyorsa aynı birime yeniden açılır).
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { demoEnabled } from "./automation-policy";
import type { getDb } from "../db";
import { operationalTasks, routingRules, serviceRequests, staffAccounts, unitMemberships } from "../db/schema";
import { auditStatements } from "./audit";
import { findUnit, HOSPITAL_UNITS } from "./hospital-units";
import { notificationStatements, unitRecipients } from "./notifications";
import { cleanRunFields, taskLocation } from "./playbook-store";
import { redactPII } from "./privacy";
import { canAccessUnit, SecurityError, type RequestActor } from "./security";
import { groupOf, REQUEST_TYPES, requestType, UNIT_GROUPS, UNIT_SERVICES, unitExists } from "./unit-directory";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
const WRITERS = ["operations_manager", "unit_manager", "clinician", "call_agent"];
const OPEN = ["queued", "accepted", "in_progress"];

/** Yönlendirmeyi kim değiştirebilir: operasyon yöneticisi veya Bilgi Teknolojileri birim sorumlusu. */
export function canEditRouting(actor: RequestActor) {
  return actor.role === "operations_manager" || (actor.role === "unit_manager" && actor.unitCodes.includes("BTI"));
}
export function canViewRouting(actor: RequestActor) {
  return canEditRouting(actor) || actor.role === "unit_manager" || actor.role === "security_officer";
}

export async function routeMap(db: Db) {
  const rows = await db.select().from(routingRules);
  const map = new Map<string, string>();
  for (const t of REQUEST_TYPES) map.set(t.code, t.defaultUnit);
  for (const r of rows) if (requestType(r.requestCode) && unitExists(r.unitCode)) map.set(r.requestCode, r.unitCode);
  return { map, rows };
}

/** Birim sorumluları (görevlendirmeyi yapan kişiler). Yoksa operasyon yöneticisi dağıtır. */
export async function dispatchersOf(db: Db, unitCodes: string[]) {
  if (!unitCodes.length) return new Map<string, string[]>();
  const rows = await db.select({ unit: unitMemberships.unitCode, label: staffAccounts.displayLabel, email: staffAccounts.email }).from(unitMemberships)
    .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
    // D1 tek sorguda ~100 parametre kabul eder: birim listesi uzunsa filtre bellekte uygulanır.
    .where(and(unitCodes.length <= 40 ? inArray(unitMemberships.unitCode, unitCodes) : undefined, eq(unitMemberships.active, true), eq(staffAccounts.active, true), eq(staffAccounts.systemRole, "unit_manager")));
  const wanted = new Set(unitCodes);
  const out = new Map<string, string[]>();
  for (const r of rows) if (wanted.has(r.unit)) out.set(r.unit, [...(out.get(r.unit) ?? []), r.label]);
  return out;
}

/** Talep aç penceresi için: türler, gideceği birim ve o birimde işi kimin dağıttığı. */
export async function requestCatalog(db: Db) {
  const { map } = await routeMap(db);
  const units = [...new Set(map.values())];
  const disp = await dispatchersOf(db, units);
  const groups = [...new Set(REQUEST_TYPES.map((t) => t.group))];
  return groups.map((g) => ({
    group: g,
    types: REQUEST_TYPES.filter((t) => t.group === g).map((t) => {
      const unit = findUnit(map.get(t.code)!);
      return { code: t.code, label: t.label, hint: t.hint, fields: t.fields ?? [], clinicalNote: t.clinicalNote ?? null, fault: !!t.fault,
        unit: { code: unit.code, name: unit.name }, dispatcher: disp.get(unit.code)?.join(", ") ?? null };
    }),
  }));
}

/** Birimler ve Yönlendirme ekranı. */
export async function routingCenter(db: Db, actor: RequestActor) {
  if (!canViewRouting(actor)) throw new SecurityError(403, "Yönlendirme ekranını operasyon yöneticisi, bilgi işlem ve birim sorumluları görür.", "ROUTING_VIEW_DENIED");
  const { map, rows } = await routeMap(db);
  const allCodes = HOSPITAL_UNITS.map((u) => u.code);
  const disp = await dispatchersOf(db, allCodes);
  const members = await db.select({ unit: unitMemberships.unitCode, email: unitMemberships.email }).from(unitMemberships)
    .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email)).where(and(eq(unitMemberships.active, true), eq(staffAccounts.active, true)));
  const open = await db.select({ unit: operationalTasks.unitCode, total: sql<number>`count(*)`, unassigned: sql<number>`sum(case when ${operationalTasks.assignedUser} is null then 1 else 0 end)` }).from(operationalTasks)
    .where(and(inArray(operationalTasks.status, OPEN), demoEnabled() ? undefined : sql`${operationalTasks.sourceType} not like 'pilot_%'`)).groupBy(operationalTasks.unitCode);
  const countBy = <T,>(xs: T[], key: (x: T) => string) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>());
  const memberCount = countBy(members, (m) => m.unit), openCount = new Map(open.map((o) => [o.unit, o.total])), unassigned = new Map(open.map((o) => [o.unit, o.unassigned]));
  const changed = new Map(rows.map((r) => [r.requestCode, r]));
  const typeGroups = [...new Set(REQUEST_TYPES.map((t) => t.group))].map((g) => ({
    group: g,
    types: REQUEST_TYPES.filter((t) => t.group === g).map((t) => {
      const unit = findUnit(map.get(t.code)!), def = findUnit(t.defaultUnit);
      const c = changed.get(t.code);
      return { code: t.code, label: t.label, hint: t.hint, clinicalNote: t.clinicalNote ?? null, unit: { code: unit.code, name: unit.name }, defaultUnit: { code: def.code, name: def.name },
        overridden: unit.code !== def.code, changedAt: c && unit.code !== def.code ? c.updatedAt : null, dispatchers: disp.get(unit.code) ?? [] };
    }),
  }));
  const directory = UNIT_GROUPS.map((g) => ({
    ...g,
    units: HOSPITAL_UNITS.filter((u) => groupOf(u) === g.key).map((u) => ({
      code: u.code, name: u.name, scope: u.scope, services: UNIT_SERVICES[u.code] ?? [], dispatchers: disp.get(u.code) ?? [],
      members: canAccessUnit(actor, u.code) ? memberCount.get(u.code) ?? 0 : null, open: canAccessUnit(actor, u.code) ? openCount.get(u.code) ?? 0 : null, unassigned: canAccessUnit(actor, u.code) ? unassigned.get(u.code) ?? 0 : null,
      receives: REQUEST_TYPES.filter((t) => map.get(t.code) === u.code).map((t) => t.label),
    })).sort((a, b) => a.name.localeCompare(b.name, "tr")),
  }));
  return { canEdit: canEditRouting(actor), typeGroups, directory, unitOptions: HOSPITAL_UNITS.map((u) => ({ code: u.code, name: u.name, group: groupOf(u) })).sort((a, b) => a.name.localeCompare(b.name, "tr")) };
}

export async function setRoute(db: Db, actor: RequestActor, code: string, unitCode: string | null, now = new Date()) {
  if (!canEditRouting(actor)) throw new SecurityError(403, "Yönlendirmeyi operasyon yöneticisi veya Bilgi Teknolojileri sorumlusu değiştirir.", "ROUTING_EDIT_DENIED");
  const t = requestType(code);
  if (!t) throw new SecurityError(400, "Talep türü bulunamadı.", "INVALID_INPUT");
  if (unitCode !== null && !unitExists(unitCode)) throw new SecurityError(400, "Birim bulunamadı.", "INVALID_INPUT");
  const target = unitCode ?? t.defaultUnit;
  const from = (await routeMap(db)).map.get(code)!;
  await db.batch([
    target === t.defaultUnit
      ? db.delete(routingRules).where(eq(routingRules.requestCode, code))
      : db.insert(routingRules).values({ requestCode: code, unitCode: target, updatedBy: actor.email, updatedAt: now }).onConflictDoUpdate({ target: routingRules.requestCode, set: { unitCode: target, updatedBy: actor.email, updatedAt: now } }),
    ...(await auditStatements(db, [{ actor: actor.email, action: "routing.changed", resource: `routing:${code}`, detail: `${t.label}: ${findUnit(from).name} → ${findUnit(target).name}` }])),
  ] as [Stmt, ...Stmt[]]);
  return { code, unit: { code: target, name: findUnit(target).name } };
}

const newRef = (now: Date) => `TLP-${now.getTime().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

/** Birimden talep aç. Bilinen bilgi (talep edenin birimi) tekrar sorulmaz. */
export async function createRequest(db: Db, actor: RequestActor, input: Record<string, unknown>, now = new Date(), reopenedFrom: string | null = null) {
  if (!WRITERS.includes(actor.role)) throw new SecurityError(403, "Gözetim rolleri talep açamaz.", "OPERATION_ROLE_REQUIRED");
  const t = typeof input.type === "string" ? requestType(input.type) : undefined;
  if (!t) throw new SecurityError(400, "Talep türünü seçin.", "INVALID_INPUT");
  const want = new Set(t.fields ?? []);
  const f = cleanRunFields({ location: want.has("location") ? input.location : undefined, targetLocation: want.has("target") ? input.targetLocation : undefined, deviceCode: want.has("device") ? input.deviceCode : undefined });
  if (want.has("target") && (!f.location || !f.targetLocation)) throw new SecurityError(400, "Nereden ve nereye bilgisini yazın.", "INVALID_INPUT");
  const note = typeof input.note === "string" && input.note.trim() ? redactPII(input.note.trim().slice(0, 300)).maskedText : null;
  const [parent] = reopenedFrom ? await db.select().from(serviceRequests).where(and(eq(serviceRequests.reference, reopenedFrom), eq(serviceRequests.requesterEmail, actor.email))).limit(1) : [];
  if (reopenedFrom && (!parent || parent.status !== "done")) throw new SecurityError(409, "Bu talep zaten yanıtlandı.", "REQUEST_STATE");
  const unitCode = parent?.unitCode ?? (await routeMap(db)).map.get(t.code)!;
  const unit = findUnit(unitCode);
  const reference = newRef(now), taskRef = `TSK-${reference}`;
  const where = taskLocation({ location: f.location, targetLocation: f.targetLocation, campus: null });
  const recipients = await unitRecipients(db, unitCode, ["unit_manager"]);
  const fallback = recipients.length ? recipients : await unitRecipients(db, unitCode);
  try { await db.batch([
    db.insert(operationalTasks).values({ reference: taskRef, unitCode, assignedRole: unit.assignedRole, sourceType: "service_request", status: "queued", priority: t.priority,
      dueAt: new Date(now.getTime() + t.minutes * 60_000), title: t.label, location: where, createdAt: now, updatedAt: now }),
    // NOT NULL guard aborts the entire batch if another request already answered the parent.
    db.insert(serviceRequests).values({ reference, typeCode: t.code, unitCode, taskReference: taskRef, requesterEmail: parent ? sql<string>`(select requester_email from service_requests where reference=${parent.reference} and requester_email=${actor.email} and status='done')` : actor.email, requesterUnit: actor.unitCodes[0] ?? null,
      location: f.location, targetLocation: f.targetLocation, deviceCode: f.deviceCode, note, reopenedFrom, createdAt: now }),
    ...(parent ? [db.update(serviceRequests).set({ status: "reopened", confirmedAt: now }).where(and(eq(serviceRequests.reference, parent.reference), eq(serviceRequests.status, "done")))] : []),
    ...notificationStatements(db, fallback, { kind: "task", title: `Yeni talep: ${t.label}`, detail: `${where ?? unit.name}${note ? ` · ${note}` : ""}`, path: "/birimim", key: `request:${reference}` }, now),
    ...(await auditStatements(db, [{ actor: actor.email, action: reopenedFrom ? "request.reopened" : "request.created", resource: reference, detail: `${t.label} → ${unit.name}` }])),
  ] as [Stmt, ...Stmt[]]); } catch (error) {
    if (parent) {
      const [fresh] = await db.select().from(serviceRequests).where(eq(serviceRequests.reference, parent.reference)).limit(1);
      if (fresh?.status !== "done") throw new SecurityError(409, "Bu talep zaten yanıtlandı.", "REQUEST_STATE");
    }
    throw error;
  }
  const dispatcher = (await dispatchersOf(db, [unitCode])).get(unitCode)?.join(", ") ?? null;
  return { reference, unit: unit.name, dispatcher,
    next: `${unit.name} birimine iletildi. ${dispatcher ? `İşi birim sorumlusu (${dispatcher}) dağıtır.` : "Birim sorumlusu tanımlı değil; birim ekibi ve operasyon yöneticisi görür."} İş bitince size bildirilir.` };
}

/** Talebe bağlı görev tamamlandı (görevi üstlenen kişi). */
export async function completeRequestTask(db: Db, actor: RequestActor, taskRef: string, now = new Date()) {
  const [t] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, taskRef)).limit(1);
  if (!t) throw new SecurityError(404, "İş bulunamadı.", "TASK_NOT_FOUND");
  if (!canAccessUnit(actor, t.unitCode)) throw new SecurityError(403, "Bu iş biriminizin dışında.", "UNIT_ACCESS_DENIED");
  if (t.assignedUser !== actor.email) throw new SecurityError(403, t.assignedUser ? "Yalnız işi üstlenen kişi tamamlayabilir." : "Önce işi kabul edin.", "NOT_OWNER");
  const [r] = await db.select().from(serviceRequests).where(eq(serviceRequests.taskReference, taskRef)).limit(1);
  if (!r || r.status !== "open" || !["accepted", "in_progress"].includes(t.status)) throw new SecurityError(409, "İş tamamlanabilir durumda değil; liste yenilendi.", "TASK_STATE");
  const label = requestType(r.typeCode)?.label ?? "Talep";
  try { await db.batch([
    // A stale/concurrent completion must roll back notifications and both records together.
    db.update(serviceRequests).set({ status: sql<string>`case when status='open' and exists(select 1 from operational_tasks where reference=${taskRef} and assigned_user=${actor.email} and unit_code=${t.unitCode} and status in ('accepted','in_progress')) then 'done' else null end`, doneAt: now }).where(eq(serviceRequests.reference, r.reference)),
    db.update(operationalTasks).set({ status: "completed", updatedAt: now }).where(and(eq(operationalTasks.reference, taskRef), eq(operationalTasks.assignedUser, actor.email), inArray(operationalTasks.status, ["accepted", "in_progress"]))),
    ...(r ? notificationStatements(db, [r.requesterEmail], { kind: "task", title: `Talebiniz tamamlandı: ${label}`, detail: `${findUnit(r.unitCode).name} · ${actor.label}. Sorun sürüyorsa İşlerim'den yeniden açın.`, path: "/islerim", key: `request-done:${r.reference}` }, now) : []),
    ...(await auditStatements(db, [{ actor: actor.email, action: "request.done", resource: r?.reference ?? taskRef, detail: label }])),
  ] as [Stmt, ...Stmt[]]); } catch (error) {
    const [fresh] = await db.select().from(operationalTasks).where(eq(operationalTasks.reference, taskRef)).limit(1);
    if (!fresh || fresh.unitCode !== t.unitCode || fresh.assignedUser !== actor.email || !["accepted", "in_progress"].includes(fresh.status)) throw new SecurityError(409, "İş değişti; listeyi yenileyin.", "TASK_STATE");
    throw error;
  }
  return { next: "İş tamamlandı; talep eden kişiye bildirildi." };
}

/** Talep eden: tamam (kapat) veya sorun sürüyor (aynı türde yeniden aç, öncekine bağlı). */
export async function confirmRequest(db: Db, actor: RequestActor, reference: string, ok: boolean, note: unknown, now = new Date()) {
  const [r] = await db.select().from(serviceRequests).where(eq(serviceRequests.reference, reference)).limit(1);
  if (!r || r.requesterEmail !== actor.email) throw new SecurityError(404, "Talep bulunamadı.", "NOT_FOUND");
  if (r.status !== "done") throw new SecurityError(409, r.status === "open" ? "Talep henüz tamamlanmadı." : "Bu talep zaten yanıtlandı.", "REQUEST_STATE");
  if (ok) {
  const claimed = await db.update(serviceRequests).set({ status: "confirmed", confirmedAt: now })
    .where(and(eq(serviceRequests.reference, reference), eq(serviceRequests.status, "done"))).returning({ reference: serviceRequests.reference });
  if (!claimed.length) throw new SecurityError(409, "Bu talep zaten yanıtlandı.", "REQUEST_STATE");
  return { next: "Teşekkürler; talep kapandı." };
  }
  const again = await createRequest(db, actor, { type: r.typeCode, location: r.location, targetLocation: r.targetLocation, deviceCode: r.deviceCode, note: typeof note === "string" && note.trim() ? note : `Sorun sürüyor (${reference})` }, now, reference);
  return { ...again, next: `Talep yeniden açıldı ve ${again.unit} birimine iletildi.` };
}

/** Talep edenin kendi talepleri (İşlerim). */
export async function myRequests(db: Db, actor: RequestActor) {
  const rows = await db.select().from(serviceRequests).where(and(eq(serviceRequests.requesterEmail, actor.email), notInArray(serviceRequests.status, ["confirmed", "reopened", "cancelled"])))
    .orderBy(desc(serviceRequests.createdAt)).limit(20);
  if (!rows.length) return [];
  const tasks = await db.select().from(operationalTasks).where(inArray(operationalTasks.reference, rows.map((r) => r.taskReference)));
  const owners = [...new Set(tasks.map((t) => t.assignedUser).filter((x): x is string => !!x))];
  const labels = owners.length ? new Map((await db.select({ email: staffAccounts.email, label: staffAccounts.displayLabel }).from(staffAccounts).where(inArray(staffAccounts.email, owners))).map((x) => [x.email, x.label])) : new Map<string, string>();
  return rows.map((r) => {
    const t = tasks.find((x) => x.reference === r.taskReference);
    const owner = t?.assignedUser ? labels.get(t.assignedUser) ?? "Birim görevlisi" : null;
    const state = r.status === "done" ? "Tamamlandı · onayınız bekleniyor" : t?.status === "in_progress" ? `${owner} çalışıyor` : owner ? `${owner} üstlendi` : "Birimde, görevlendirme bekliyor";
    return { reference: r.reference, label: requestType(r.typeCode)?.label ?? "Talep", unit: findUnit(r.unitCode).name, location: taskLocation({ location: r.location, targetLocation: r.targetLocation, campus: null }), status: r.status, state, createdAt: r.createdAt };
  });
}

/** Birim yöneticisi veya ilgili birim üyesi talep ayrıntısını görebilir mi (kayıt bazlı erişim). */
export function canSeeRequestUnit(actor: RequestActor, unitCode: string) { return canAccessUnit(actor, unitCode); }
