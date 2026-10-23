import { getDb } from "../../../db";
import { confirmFault, reportFault } from "../../../lib/fault-report";
import { acceptTask, clearBlocker, inspectTask, completeTask, decideHandoff, myWork, proposeHandoff, reportBlocker, requestHelp, startTask } from "../../../lib/my-work";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, requireOperationalWriter, SecurityError, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

// "İşlerim": kişinin kendi işleri. Bütün yetki ve sahiplik kontrolleri sunucuda (lib/my-work, lib/fault-report) yapılır.
// GET → { mine, available, handoffs, faults, … }
// POST { action: accept|start|complete|inspect|block|unblock|help|handoff|handoff.decide|fault.report|fault.confirm, … }
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "mywork.read", 120, 60);
    return Response.json(await myWork(getDb(), actor), { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

const str = (v: unknown, n = 80) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 4096);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    requireOperationalWriter(actor);
    await enforceRateLimit(request, actor, "mywork.write", 60, 60);
    const b = await request.json() as Record<string, unknown>;
    const db = getDb();
    const ref = str(b.reference);
    let result: unknown;
    switch (b.action) {
      case "accept": result = await acceptTask(db, actor, ref); break;
      case "start": result = await startTask(db, actor, ref); break;
      case "complete": result = await completeTask(db, actor, ref, b.note, b.conditions); break;
      case "block": result = await reportBlocker(db, actor, ref, b.reason); break;
      case "unblock": result = await clearBlocker(db, actor, ref); break;
      case "inspect": result = await inspectTask(db, actor, ref, b.pass === true, b.reason); break;
      case "help": result = await requestHelp(db, actor, ref); break;
      case "handoff": result = await proposeHandoff(db, actor, ref, str(b.email, 200).trim().toLowerCase(), b.note); break;
      case "handoff.decide": result = await decideHandoff(db, actor, Number(b.id), b.accept === true); break;
      case "fault.report": result = await reportFault(db, actor, b); break;
      case "fault.confirm": result = await confirmFault(db, actor, ref, b.resolved === true, b.note); break;
      default: throw new SecurityError(400, "Bilinmeyen işlem.", "UNKNOWN_ACTION");
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return securityResponse(error, request);
  }
}
