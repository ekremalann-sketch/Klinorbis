import { demoEnabled } from "../../../lib/automation-policy";
import { recordRead } from "../../../lib/read-audit";
import { oversightView } from "../../../lib/oversight-view";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { appointmentChanges, appointments, facilities, patientNotifications, physicianAbsences, physicians } from "../../../db/schema";
import { ensureOperationalSeed } from "../../../lib/operations";
import { ABSENCE_REASONS, CHANNELS, OPTION_LABEL, PATIENT_RESPONSES, REQUEST_TYPES, type PatientResponse } from "../../../lib/patient-access";
import { canHandlePatientContact, decideReview, dispatchNotifications, ensureAppointmentSeed, recordResponse, reportAbsence } from "../../../lib/patient-access-store";
import {
  assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, requireOperationalWriter, SecurityError, securityResponse,
} from "../../../lib/security";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;

// Randevu ve hasta iletişimi:
// GET  → kanallar, talep türleri, hekimler, yaklaşan randevular, yokluk planları, bildirim kuyruğu
// POST → absence.report | review.decide | response.record | notifications.dispatch
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "patient-access.read", 120, 60);
    const db = getDb();
    await ensureOperationalSeed(db);

    const units = actor.canSeeAllUnits ? null : actor.unitCodes;
    const callCenter = actor.role === "call_agent" && actor.unitCodes.includes("CAG");
    const unitFilter = units && !callCenter ? units : null;
    const training=demoEnabled() && new URL(request.url).searchParams.get("mode")!=="live";
    const docs = unitFilter ? (unitFilter.length ? await db.select().from(physicians).where(inArray(physicians.unitCode, unitFilter)) : []) : await db.select().from(physicians);
    const since = new Date(Date.now() - DAY);
    const appts = unitFilter
      ? (unitFilter.length ? await db.select().from(appointments).where(and(inArray(appointments.unitCode, unitFilter), gte(appointments.startsAt, since))).orderBy(appointments.startsAt).limit(300) : [])
      : await db.select().from(appointments).where(gte(appointments.startsAt, since)).orderBy(appointments.startsAt).limit(300);
    const absences = unitFilter
      ? (unitFilter.length ? await db.select().from(physicianAbsences).where(inArray(physicianAbsences.unitCode, unitFilter)).orderBy(desc(physicianAbsences.createdAt)).limit(30) : [])
      : await db.select().from(physicianAbsences).orderBy(desc(physicianAbsences.createdAt)).limit(30);
    const changes = absences.length ? await db.select().from(appointmentChanges).where(inArray(appointmentChanges.absenceReference, absences.map((a) => a.reference))) : [];
    const apptRefs = [...new Set([...appts.map((a) => a.reference), ...changes.map((c) => c.appointmentReference)])];
    const notes: (typeof patientNotifications.$inferSelect)[]=[];
    for(let i=0;i<apptRefs.length;i+=80)notes.push(...await db.select().from(patientNotifications).where(inArray(patientNotifications.appointmentReference,apptRefs.slice(i,i+80))).orderBy(desc(patientNotifications.createdAt)).limit(100));
    const visibleAppts=appts.filter(a=>a.training===training);const visibleRefs=new Set(visibleAppts.map(a=>a.reference));const visibleAbsences=absences.filter(a=>docs.find(d=>d.code===a.physicianCode)?.training===training);const visibleAbsRefs=new Set(visibleAbsences.map(a=>a.reference));
    await recordRead(actor,"patient-access:list");
    return Response.json(oversightView(actor,{
      demoEnabled: demoEnabled(), mode: training ? "training" : "live",
      identity: { role: actor.role, label: actor.label },
      catalog: { channels: CHANNELS, requestTypes: REQUEST_TYPES, absenceReasons: ABSENCE_REASONS, options: OPTION_LABEL, responses: PATIENT_RESPONSES },
      facilities: await db.select({ code: facilities.code, name: facilities.name }).from(facilities),
      physicians: docs.filter(d=>d.training===training), appointments: visibleAppts, absences:visibleAbsences, changes:changes.filter(c=>visibleAbsRefs.has(c.absenceReference)), notifications: notes.filter(n=>n.appointmentReference && visibleRefs.has(n.appointmentReference)).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,100),
    }), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireOperationalWriter(actor);
    await enforceRateLimit(request, actor, "patient-access.write", 60, 60);
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    await ensureOperationalSeed(db);
    switch (body.action) {
      case "demo.seed": {
        if(!demoEnabled())throw new SecurityError(403,"Üretimde eğitim verisi üretimi kapalı.","DEMO_DISABLED");
        if(actor.role!=="operations_manager")throw new SecurityError(403,"Eğitim senaryosunu operasyon yöneticisi açabilir.","FORBIDDEN");
        await ensureAppointmentSeed(db);return Response.json({ok:true});
      }
      case "absence.report": {
        const result = await reportAbsence(db, actor, { physicianCode: String(body.physicianCode ?? ""), day: String(body.day ?? ""), reason: String(body.reason ?? "") });
        return Response.json(result, { status: 201 });
      }
      case "review.decide": {
        await decideReview(db, actor, { changeId: Number(body.changeId), physicianCode: typeof body.physicianCode === "string" ? body.physicianCode : undefined, startsAt: Number(body.startsAt), callback: body.callback === true });
        return Response.json({ ok: true });
      }
      case "response.record": {
        const response = String(body.response ?? "") as PatientResponse;
        if (!(response in PATIENT_RESPONSES)) throw new SecurityError(400, "Geçersiz hasta yanıtı.", "INVALID_INPUT");
        const [change] = await db.select().from(appointmentChanges).where(eq(appointmentChanges.id, Number(body.changeId))).limit(1);
        if (!change) throw new SecurityError(404, "Değişiklik kaydı bulunamadı.", "NOT_FOUND");
        const [appt] = await db.select().from(appointments).where(eq(appointments.reference, change.appointmentReference)).limit(1);
        if (!appt || !canHandlePatientContact(actor, appt.unitCode)) throw new SecurityError(403, "Bu hastayla iletişim yetkiniz yok.", "UNIT_FORBIDDEN");
        await recordResponse(db, actor, { changeId: change.id, response });
        return Response.json({ ok: true });
      }
      case "notifications.dispatch": {
        if (!["operations_manager", "unit_manager", "call_agent"].includes(actor.role)) throw new SecurityError(403, "Bildirim kuyruğunu çağrı merkezi veya yönetici işletir.", "FORBIDDEN");
        return Response.json(await dispatchNotifications(db, actor));
      }
      default:
        throw new SecurityError(400, "Geçersiz işlem.", "INVALID_ACTION");
    }
  } catch (error) {
    return securityResponse(error, request);
  }
}
