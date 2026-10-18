import { recordRead } from "../../../lib/read-audit";
import { oversightView } from "../../../lib/oversight-view";
import { demoEnabled } from "../../../lib/automation-policy";
import { sql } from "drizzle-orm";
import { requireOperationalWriter } from "../../../lib/security";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { automationEvents, callMessages, callSessions, operationalTasks } from "../../../db/schema";
import { appendAudit } from "../../../lib/audit";
import { findUnit } from "../../../lib/hospital-units";
import { ensureOperationalSeed } from "../../../lib/operations";
import { EMERGENCY_NOTICE_TEXT, emergencyWordsNotice, redactPII, validPatientAlias } from "../../../lib/privacy";
import { assertBrowserMutation, assertJsonRequest, cleanText, enforceRateLimit, requireActor, securityResponse } from "../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "calls.read", 180, 60);
    const db = getDb();
    await ensureOperationalSeed(db);
    const rows = actor.canSeeAllUnits
      ? await db.select().from(callSessions).where(demoEnabled() ? undefined : sql`training = 0`).orderBy(desc(callSessions.lastMessageAt)).limit(50)
      : actor.unitCodes.length
        ? await db.select().from(callSessions).where(and(inArray(callSessions.unitCode, actor.unitCodes), demoEnabled() ? undefined : sql`training = 0`)).orderBy(desc(callSessions.lastMessageAt)).limit(50)
        : [];
    const references = rows.map((row) => row.reference);
    const messages = references.length ? await db.select().from(callMessages).where(inArray(callMessages.callReference, references)) : [];
    await recordRead(actor,"calls:list");
    return Response.json(oversightView(actor,{ calls: rows.map((row) => ({ ...row, messages: messages.filter((message) => message.callReference === row.reference).sort((a, b) => a.sequence - b.sequence) })) }), { headers: { "cache-control": "no-store, private" } });
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
    await enforceRateLimit(request, actor, "calls.create", 20, 60);
    const body = await request.json() as { patientAlias?: unknown; openingMessage?: unknown };
    const patientAlias = cleanText(body.patientAlias, "Hasta/protokol takma adı", 3, 40).toUpperCase();
    if (!validPatientAlias(patientAlias)) return Response.json({ error: "Takma ad kimlik bilgisi içeremez.", code: "ALIAS_INVALID" }, { status: 422 });
    const openingMessage = cleanText(body.openingMessage, "Gelen konuşma", 3, 2_000);
    const redaction = redactPII(openingMessage);
    // ADR-003: aciliyet puanı/klinik yönlendirme yok; acil ifade yalnız 112 bilgilendirmesi ve görevli devri açar.
    const signal = emergencyWordsNotice(redaction.maskedText);
    const unit = findUnit("CAG");
    const now = new Date();
    const reference = `CAG-${now.getTime().toString(36).slice(-7).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const taskReference = `TSK-${reference}`;
    const db = getDb();
    await ensureOperationalSeed(db);
    await db.insert(callSessions).values({
      reference,
      patientAlias,
      source: "Görevli tarafından kaydedilen gelen çağrı",
      status: signal.notice ? "human_handoff" : "active",
      unitCode: unit.code,
      assignedRole: unit.assignedRole,
      summary: signal.notice ? "Metinde acil durum ifadesi geçti; arayana 112 bilgilendirmesi yapılmalı. Otomatik akış durduruldu, görüşmeyi görevli sürdürür. Klinik değerlendirme yapılmadı." : "Görüşme sürüyor; sonuç özeti görevli onayından sonra oluşturulacak.",
      training: false,
      requiresHuman: signal.notice,
      startedAt: now,
      lastMessageAt: now,
    });
    await db.insert(callMessages).values([
      { callReference: reference, sequence: 1, speakerType: "system", speakerLabel: "Sistem", message: "Gelen çağrı güvenli oturuma alındı; görüntülenen kimlik alanları maskelendi.", redacted: true, createdAt: now },
      { callReference: reference, sequence: 2, speakerType: "caller", speakerLabel: "Arayan", message: redaction.maskedText, redacted: redaction.detected.length > 0, createdAt: new Date(now.getTime() + 1) },
      { callReference: reference, sequence: 3, speakerType: "assistant", speakerLabel: "Kural tabanlı güvenlik kontrolü", message: signal.notice ? `${EMERGENCY_NOTICE_TEXT} Otomatik akış durduruldu; görevli devraldı.` : `${unit.name} kuyruğuna alındı. Klinik karar yok; görevli doğrulaması gerekli.`, redacted: false, createdAt: new Date(now.getTime() + 2) },
    ]);
    await db.insert(operationalTasks).values({ reference: taskReference, callReference: reference, unitCode: unit.code, assignedRole: unit.assignedRole, sourceType: "call", status: "queued", priority: "Normal", dueAt: new Date(now.getTime() + unit.slaMinutes * 60_000), createdAt: now, updatedAt: now });
    await db.insert(automationEvents).values({ ticketReference: reference, rule: signal.notice ? "112 bilgilendirmesi ve görevli devri" : "Gelen çağrı görevlendirmesi", outcome: `${unit.name} · ${taskReference}`, unitCode: unit.code, eventType: "call_opened", actor: actor.email });
    await appendAudit(db, { actor: actor.email, action: "call.opened", resource: reference, detail: `unit:${unit.code}; task:${taskReference}; pii:${redaction.detected.join(",") || "none"}` });
    const [call] = await db.select().from(callSessions).where(eq(callSessions.reference, reference)).limit(1);
    const messages = await db.select().from(callMessages).where(eq(callMessages.callReference, reference));
    return Response.json({ call: { ...call, messages }, destination: { unitCode: unit.code, unitName: unit.name, assignedRole: unit.assignedRole, taskReference } }, { status: 201 });
  } catch (error) {
    return securityResponse(error, request);
  }
}
