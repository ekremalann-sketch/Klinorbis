// FHIR R4 Encounter → aynı normalleştirilmiş olay. Hastanenin FHIR sunucusundan (varsa) abonelik veya sorgu ile gelir.
// Yalnız Encounter.status, Encounter.location (birim/oda/yatak kimlikleri), Encounter.identifier (ziyaret no) ve
// hasta kimlik tanımlayıcısı (contained Patient.identifier, sistem TCKN) okunur. Klinik alanlar (diagnosis, reasonCode) okunmaz.
import type { NormalizedAdt } from "./hl7v2.ts";
import { Hl7Error } from "./hl7v2.ts";

type Coding = { system?: string; value?: string };
type Encounter = {
  resourceType?: string; id?: string; status?: string; meta?: { lastUpdated?: string };
  identifier?: Coding[]; period?: { start?: string; end?: string };
  location?: { location?: { identifier?: Coding; display?: string }; physicalType?: { coding?: { code?: string }[] }; status?: string }[];
  contained?: { resourceType?: string; id?: string; identifier?: Coding[]; name?: { family?: string; given?: string[] }[] }[];
};
export const TCKN_SYSTEM = "urn:oid:2.16.840.1.113883.3.9901.1"; // Kurulumda hastanenin kullandığı sistem URI'siyle yapılandırılır.

export function mapEncounter(input: unknown, opts: { tcknSystem?: string; visitSystem?: string } = {}): NormalizedAdt {
  const e = input as Encounter;
  if (!e || e.resourceType !== "Encounter") throw new Hl7Error("AR", "Encounter kaynağı değil");
  if (!e.id || !/^[A-Za-z0-9.-]{1,64}$/.test(e.id)) throw new Hl7Error("AR", "Geçersiz kaynak kimliği");
  const event = e.status === "finished" ? "A03" : e.status === "in-progress" ? "A01" : e.status === "planned" || e.status === "arrived" ? "A08" : null;
  if (!event) throw new Hl7Error("AR", `Desteklenmeyen durum: ${e.status}`);
  const active = (e.location ?? []).filter((l) => l.status !== "completed");
  const byType = (t: string) => active.find((l) => l.physicalType?.coding?.some((c) => c.code === t))?.location?.identifier?.value ?? null;
  const unitCode = byType("wa") ?? byType("wi") ?? null;
  if (!unitCode) throw new Hl7Error("AE", "Birim (ward) konumu yok");
  const visit = (e.identifier ?? []).find((i) => !opts.visitSystem || i.system === opts.visitSystem)?.value;
  if (!visit) throw new Hl7Error("AE", "Ziyaret kimliği yok");
  const patient = (e.contained ?? []).find((c) => c.resourceType === "Patient");
  const nid = patient?.identifier?.find((i) => i.system === (opts.tcknSystem ?? TCKN_SYSTEM))?.value ?? null;
  const name = patient?.name?.[0];
  const when = e.status === "finished" ? e.period?.end : e.period?.start ?? e.meta?.lastUpdated;
  const occurredAt = new Date(when ?? Date.now());
  if (Number.isNaN(occurredAt.getTime())) throw new Hl7Error("AE", "Geçersiz zaman");
  return {
    event, controlId: `FHIR-${e.id}-${e.meta?.lastUpdated ?? e.status}`.slice(0, 80).replace(/[^A-Za-z0-9._-]/g, "-"), version: "FHIR-R4", sendingFacility: "FHIR",
    occurredAt, patient: { nationalId: nid, givenName: name?.given?.[0] ?? "", familyName: name?.family ?? "" },
    visit: { number: visit, unitCode, room: byType("ro"), bed: byType("bd"), priorUnitCode: null, priorRoom: null, priorBed: null },
  };
}
