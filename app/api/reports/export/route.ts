import { asc, desc, eq, inArray } from "drizzle-orm";
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
    const visibleTicketReferences = unitCodes?.length
      ? (await db
          .select({ reference: tickets.reference })
          .from(tickets)
          .where(inArray(tickets.unitCode, unitCodes)))
          .map((row) => row.reference)
      : null;
    const [capacity, transfers, shifts, jobs] = await Promise.all([
      unitCodes?.length
        ? db.select().from(capacitySnapshots).where(inArray(capacitySnapshots.unitCode, unitCodes)).orderBy(asc(capacitySnapshots.facilityCode), asc(capacitySnapshots.unitCode))
        : db.select().from(capacitySnapshots).orderBy(asc(capacitySnapshots.facilityCode), asc(capacitySnapshots.unitCode)),
      unitCodes?.length
        ? db.select().from(transferRequests).where(inArray(transferRequests.requestedUnitCode, unitCodes)).orderBy(desc(transferRequests.updatedAt)).limit(500)
        : db.select().from(transferRequests).orderBy(desc(transferRequests.updatedAt)).limit(500),
      unitCodes?.length
        ? db.select().from(staffShifts).where(inArray(staffShifts.unitCode, unitCodes)).orderBy(asc(staffShifts.facilityCode), asc(staffShifts.unitCode))
        : db.select().from(staffShifts).orderBy(asc(staffShifts.facilityCode), asc(staffShifts.unitCode)),
      visibleTicketReferences
        ? visibleTicketReferences.length
          ? db
              .select()
              .from(workflowJobs)
              .where(inArray(workflowJobs.ticketReference, visibleTicketReferences))
              .orderBy(desc(workflowJobs.createdAt))
              .limit(500)
          : Promise.resolve([])
        : db.select().from(workflowJobs).orderBy(desc(workflowJobs.createdAt)).limit(500),
    ]);

    const csv = buildCsv(reportCode, capacity, transfers, shifts, jobs);
    await appendAudit(db, { actor: actor.email, action: "report.export", resource: reportCode, detail: `scope:${actor.canSeeAllUnits ? "network" : actor.unitCodes.join(",")}; rows:${csv.rows}` });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(`\uFEFF${csv.content}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="klinorbis-${reportCode.toLocaleLowerCase("tr-TR")}-${date}.csv"`,
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
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function iso(value: Date | string | number | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
