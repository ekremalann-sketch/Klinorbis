import { demoEnabled } from "../../../../lib/automation-policy";
import { redactPII } from "../../../../lib/privacy";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  capacitySnapshots,
  reportAssignments,
  staffShifts,
  tickets,
  transferRequests,
  workflowJobs,
} from "../../../../db/schema";
import { appendAudit } from "../../../../lib/audit";
import { availableCapacity } from "../../../../lib/control-tower";
import { enforceRateLimit, requireActor, securityResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    await enforceRateLimit(request, actor, "reports.export", 20, 60);
    const reportCode = new URL(request.url).searchParams.get("report") || "NETWORK_SUMMARY";
    if (["privacy_officer","security_officer"].includes(actor.role) && reportCode!=="NETWORK_SUMMARY") return Response.json({error:"Gözetim rolleri yalnız kimliksiz ağ özetini dışa aktarabilir."},{status:403});
    const db = getDb();
    const [assignment] = await db.select().from(reportAssignments).where(eq(reportAssignments.reportCode, reportCode)).limit(1);
    if (!assignment) return Response.json({ error: "Rapor tanımı bulunamadı.", code: "NOT_FOUND" }, { status: 404 });
    if (!actor.canSeeAllUnits && !actor.unitCodes.length) {
      return Response.json({ error: "Rapor için etkin birim üyeliğiniz yok.", code: "REPORT_SCOPE_DENIED" }, { status: 403 });
    }
    if (!actor.canSeeAllUnits && assignment.scopeType !== "network" && (!assignment.unitCode || !actor.unitCodes.includes(assignment.unitCode))) {
      return Response.json({ error: "Bu rapor kapsamına erişim yetkiniz yok.", code: "REPORT_SCOPE_DENIED" }, { status: 403 });
    }

    const unitCodes = actor.canSeeAllUnits ? null : actor.unitCodes;
    const real = !demoEnabled();
    const [capacity, transfers, shifts, jobs] = await Promise.all([
      db.select().from(capacitySnapshots).where(and(unitCodes?.length ? inArray(capacitySnapshots.unitCode, unitCodes) : undefined, real ? sql`facility_code not in (select code from facilities where name like '%Pilot%')` : undefined)).orderBy(asc(capacitySnapshots.facilityCode), asc(capacitySnapshots.unitCode)),
      db.select().from(transferRequests).where(and(unitCodes?.length ? inArray(transferRequests.requestedUnitCode, unitCodes) : undefined, real ? eq(transferRequests.training, false) : undefined)).orderBy(desc(transferRequests.updatedAt)).limit(500),
      db.select().from(staffShifts).where(and(unitCodes?.length ? inArray(staffShifts.unitCode, unitCodes) : undefined, real ? sql`facility_code not in (select code from facilities where name like '%Pilot%')` : undefined)).orderBy(asc(staffShifts.facilityCode), asc(staffShifts.unitCode)),
      db.select().from(workflowJobs).where(and(
        unitCodes?.length ? inArray(workflowJobs.ticketReference, db.select({reference:tickets.reference}).from(tickets).where(inArray(tickets.unitCode, unitCodes))) : undefined,
        real ? sql`coalesce(ticket_reference, '') not in (select reference from tickets where channel = 'Canlı Pilot' or reference like 'S2S-%')` : undefined,
      )).orderBy(desc(workflowJobs.createdAt)).limit(500),
    ]);

    const csv = buildCsv(reportCode, capacity, transfers, shifts, jobs);
    await appendAudit(db, { actor: actor.email, action: "report.export", resource: reportCode, detail: `scope:${actor.canSeeAllUnits ? "network" : actor.unitCodes.join(",")}; rows:${csv.rows}` });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(`\uFEFF${csv.content}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="klinorbis-${reportCode.toLowerCase()}-${date}.csv"`,
        "cache-control": "no-store, private",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return securityResponse(error, request);
  }
}

function buildCsv(
  reportCode: string,
  capacity: Array<typeof capacitySnapshots.$inferSelect>,
  transfers: Array<typeof transferRequests.$inferSelect>,
  shifts: Array<typeof staffShifts.$inferSelect>,
  jobs: Array<typeof workflowJobs.$inferSelect>,
) {
  if (reportCode === "CAPACITY" || reportCode === "DISCHARGE") {
    const rows = capacity
      .filter((row) => reportCode !== "DISCHARGE" || row.dischargeForecast > 0)
      .map((row) => [row.facilityCode, row.unitCode, row.resourceLabel, row.total, row.occupied, row.reserved, row.blocked, row.cleaning, row.staffed, availableCapacity(row), row.dischargeForecast, row.incoming, row.outgoing, row.status, iso(row.updatedAt)]);
    return csvRows(["Hastane", "Birim", "Kaynak", "Toplam", "Dolu", "Rezerve", "Bloke", "Temizlik", "Personelli", "Uygun", "Taburculuk tahmini", "Gelen", "Çıkan", "Durum", "Güncelleme"], rows);
  }
  if (reportCode === "TRANSFER") {
    return csvRows(
      ["Referans", "Kaynak kurum", "Hedef hastane", "Birim", "Kaynak", "İstenen", "Öncelik", "Durum", "Karar kodu", "Karar gerekçesi", "Talep", "Güncelleme"],
      transfers.map((row) => [row.reference, row.sourceFacilityCode, row.targetFacilityCode, row.requestedUnitCode, row.resourceLabel, row.requestedCount, row.priority, row.status, row.decisionCode || "", row.decisionDetail || "", row.ticketReference || "", iso(row.updatedAt)]),
    );
  }
  if (reportCode === "SHIFT") {
    return csvRows(
      ["Hastane", "Birim", "Pilot ekip", "Rol", "Vardiya", "Durum", "Devir", "Başlangıç", "Bitiş", "Güncelleme"],
      shifts.map((row) => [row.facilityCode, row.unitCode, row.staffLabel, row.role, row.shiftCode, row.status, row.handoffTo || "", iso(row.startedAt), iso(row.endsAt), iso(row.updatedAt)]),
    );
  }
  if (reportCode === "AUTOMATION") {
    return csvRows(
      ["İş", "Kural", "Kayıt", "Durum", "Deneme", "Azami deneme", "Worker", "Son hata", "Oluşturma", "Tamamlanma"],
      jobs.map((row) => [row.jobKey, row.ruleCode, row.ticketReference || "", row.status, row.attempts, row.maxAttempts, row.lockedBy || "", row.lastError || "", iso(row.createdAt), iso(row.completedAt)]),
    );
  }

  const metrics = [
    ["Kapasite satırı", capacity.length],
    ["Toplam kaynak", capacity.reduce((sum, row) => sum + row.total, 0)],
    ["Dolu kaynak", capacity.reduce((sum, row) => sum + row.occupied, 0)],
    ["Uygun kaynak", capacity.reduce((sum, row) => sum + availableCapacity(row), 0)],
    ["Taburculuk tahmini", capacity.reduce((sum, row) => sum + row.dischargeForecast, 0)],
    ["Açık transfer", transfers.filter((row) => !["completed", "auto_rejected"].includes(row.status)).length],
    ["Otomatik kabul/alternatif", transfers.filter((row) => ["auto_accepted", "auto_rerouted", "scheduled", "transport_assigned", "in_transit", "completed"].includes(row.status)).length],
    ["Otomatik ret", transfers.filter((row) => row.status === "auto_rejected").length],
    ["Aktif vardiya", shifts.filter((row) => row.status === "active").length],
    ["Devir", shifts.filter((row) => row.status === "handoff").length],
    ["Kuyruk işi", jobs.filter((row) => row.status === "queued" || row.status === "running").length],
    ["Karantina işi", jobs.filter((row) => row.status === "dead_letter").length],
  ];
  return csvRows(["Gösterge", "Değer"], metrics);
}

function csvRows(headers: Array<string>, rows: Array<Array<unknown>>) {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  return { content, rows: rows.length };
}

function csvCell(value: unknown) {
  const raw = redactPII(String(value ?? "")).maskedText.replace(/\r?\n/g, " ");
  const text = typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function iso(value: Date | string | number | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
