import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { automationEvents, callMessages, callSessions, operationalTasks } from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import { findUnit } from "../../../lib/hospital-units";
import { ensureOperationalSeed } from "../../../lib/operations";
import { redactPII, urgencySignal } from "../../../lib/privacy";
import { assertBrowserMutation, assertJsonRequest, cleanText, enforceRateLimit, requireActor, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "calls.read", 180, 60);
    const db = getDb();
    await ensureOperationalSeed(db);
    const rows = actor.canSeeAllUnits
      ? await db.select().from(callSessions).orderBy(desc(callSessions.lastMessageAt)).limit(50)
      : actor.unitCodes.length
        ? await db.select().from(callSessions).where(inArray(callSessions.unitCode, actor.unitCodes)).orderBy(desc(callSessions.lastMessageAt)).limit(50)
        : [];
    const references = rows.map((row) => row.reference);
    const messages = references.length ? await db.select().from(callMessages).where(inArray(callMessages.callReference, references)) : [];
    return Response.json({ calls: rows.map((row) => ({ ...row, messages: messages.filter((message) => message.callReference === row.reference).sort((a, b) => a.sequence - b.sequence) })) }, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return securityResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "calls.create", 20, 60);
    const body = await request.json() as { patientAlias?: unknown; openingMessage?: unknown };
    const patientAlias = cleanText(body.patientAlias, "Hasta/protokol takma adı", 3, 40).toUpperCase();
    const openingMessage = cleanText(body.openingMessage, "Gelen konuşma", 3, 2_000);
    const redaction = redactPII(openingMessage);
    const signal = urgencySignal(redaction.maskedText);
    const unit = signal.isEmergency ? findUnit("ACY") : findUnit("CAG");
    const now = new Date();
    const reference = `CAG-${now.getTime().toString(36).slice(-7).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const taskReference = `TSK-${reference}`;
    const db = getDb();
    await ensureOperationalSeed(db);
    await db.insert(callSessions).values({
      reference,
      patientAlias,
      source: "Görevli tarafından kaydedilen gelen çağrı",
      status: signal.isEmergency ? "human_handoff" : "active",
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      summary: signal.isEmergency ? "Acil olasılık sinyali nedeniyle otomatik akış durduruldu; yetkili sağlık personeli devri bekleniyor." : "Görüşme sürüyor; sonuç özeti görevli onayından sonra oluşturulacak.",
      training: false,
      requiresHuman: signal.isEmergency,
      startedAt: now,
      lastMessageAt: now,
    });
    await db.insert(callMessages).values([
      { callReference: reference, sequence: 1, speakerType: "system", speakerLabel: "Sistem", message: "Gelen çağrı güvenli oturuma alındı; görüntülenen kimlik alanları maskelendi.", redacted: true, createdAt: now },
      { callReference: reference, sequence: 2, speakerType: "caller", speakerLabel: "Arayan", message: redaction.maskedText, redacted: redaction.detected.length > 0, createdAt: new Date(now.getTime() + 1) },
      { callReference: reference, sequence: 3, speakerType: "assistant", speakerLabel: "AI güvenlik yardımcısı", message: signal.isEmergency ? `Acil olasılık sinyali: ${signal.matched}. Klinik karar üretme; normal otomasyonu durdur ve insan devri aç.` : `${unit.name} yönlendirmesi önerildi. Klinik karar yok; görevli doğrulaması gerekli.`, redacted: false, createdAt: new Date(now.getTime() + 2) },
    ]);
    await db.insert(operationalTasks).values({ reference: taskReference, callReference: reference, unitCode: unit.code, assignedRole: unit.assignedRole, sourceType: "call", status: "queued", priority: signal.isEmergency ? "Acil" : "Normal", dueAt: new Date(now.getTime() + unit.slaMinutes * 60_000), createdAt: now, updatedAt: now });
    await db.insert(automationEvents).values({ ticketReference: reference, rule: signal.isEmergency ? "Acil çağrı insan devri" : "Gelen çağrı görevlendirmesi", outcome: `${unit.name} · ${taskReference}`, unitCode: unit.code, eventType: "call_opened", actor: actor.email });
    await appendAudit(db, { actor: actor.email, action: "call.opened", resource: reference, detail: `unit:${unit.code}; task:${taskReference}; pii:${redaction.detected.join(",") || "none"}` });
    const [call] = await db.select().from(callSessions).where(eq(callSessions.reference, reference)).limit(1);
    const messages = await db.select().from(callMessages).where(eq(callMessages.callReference, reference));
    return Response.json({ call: { ...call, messages }, destination: { unitCode: unit.code, unitName: unit.name, assignedRole: unit.assignedRole, taskReference } }, { status: 201 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
