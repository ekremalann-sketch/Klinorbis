import { recordRead } from "../../../lib/read-audit";
import { oversightView } from "../../../lib/oversight-view";
import { getDb } from "../../../db";
import { ensureOperationalSeed } from "../../../lib/operations";
import { activateDueSteps, cancelRun, completeStep, listRuns, playbookReport, startFromEvent, startPlaybook } from "../../../lib/playbook-store";
import { EVENT_TRIGGERS } from "../../../lib/playbook-triggers";
import { CHAIN_CONDITIONS, PLAYBOOK_CATEGORIES, PLAYBOOKS, playbookNetwork } from "../../../lib/playbooks";
import { HOSPITAL_UNITS } from "../../../lib/hospital-units";
import {
  assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, requireOperationalWriter, SecurityError, securityResponse,
} from "../../../lib/security";

export const dynamic = "force-dynamic";

// Operasyon akışları:
// GET  → akış kütüphanesi, akış ağı, olay tetikleyicileri, etkin/son akışlar ve performans raporu
// POST → start {code, note?, fields?{campus,location,deviceCode,patientRef}} | step.complete {reference, version, note?, conditions?[]} | cancel {reference, version, note}
//        event.simulate {type} (yalnız operasyon yöneticisi; gerçek entegrasyon yokken olay tetiklemeyi denemek için)
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "playbooks.read", 120, 60);
    const db = getDb();
    await ensureOperationalSeed(db);
    await activateDueSteps(db);
    await recordRead(actor,"playbooks:list");
    return Response.json(oversightView(actor,{
      serverNow: Date.now(), triggers: EVENT_TRIGGERS, report: await playbookReport(db, actor),
      identity: { role: actor.role, label: actor.label, email: actor.email, unitCodes: actor.unitCodes, canSeeAllUnits: actor.canSeeAllUnits },
      categories: PLAYBOOK_CATEGORIES, playbooks: PLAYBOOKS, conditions: CHAIN_CONDITIONS, network: playbookNetwork(),
      units: HOSPITAL_UNITS.map((u) => ({ code: u.code, name: u.name })),
      runs: await listRuns(db, actor),
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
    await enforceRateLimit(request, actor, "playbooks.write", 60, 60);
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    await ensureOperationalSeed(db);
    const reference = typeof body.reference === "string" ? body.reference.slice(0, 60) : "";
    const version = Number(body.version);
    switch (body.action) {
      case "start": {
        const ref = await startPlaybook(db, actor, typeof body.code === "string" ? body.code.slice(0, 40) : "", body.note, body.fields);
        return Response.json({ ok: true, reference: ref }, { status: 201 });
      }
      case "step.complete":
        return Response.json({ ok: true, ...(await completeStep(db, actor, reference, version, body.note, body.conditions)) });
      case "event.simulate": {
        if (actor.role !== "operations_manager") throw new SecurityError(403, "Olay simülasyonunu yalnız operasyon yöneticisi çalıştırır.", "OPERATIONS_MANAGER_REQUIRED");
        const type = typeof body.type === "string" ? body.type.slice(0, 60) : "";
        const result = await startFromEvent(db, { type, eventId: `sim-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`, source: "simulasyon", simulatedBy: actor.email, note: "Simülasyon: gerçek sistemden gelmedi" });
        return Response.json({ ok: true, ...result }, { status: 201 });
      }
      case "cancel":
        await cancelRun(db, actor, reference, version, body.note);
        return Response.json({ ok: true });
      default:
        throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    }
  } catch (error) {
    return securityResponse(error, request);
  }
}
