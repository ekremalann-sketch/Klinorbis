// FHIR R4 kapasite doğrulayıcı (salt okunur, saklamaz).
// Avrupa'da hastane bilgi sistemleri (HBYS/EHR) yatak durumunu çoğunlukla FHIR R4 "Location"
// kaynağıyla verir. Bu modül bir Bundle'ı okur, yatakları birimlere eşler ve Klinorbis'in
// kapasite modeline nasıl yansıyacağını gösterir. Canlı bağlantı DEĞİLDİR; entegrasyon öncesi
// eşleme ve veri kalitesini test etmek içindir. Hasta (Patient) verisi işlenmez.
import { HOSPITAL_UNITS } from "./hospital-units";

export const UNIT_SYSTEM = "urn:klinorbis:unit";
const MAX_ENTRIES = 2_000;

type Coding = { system?: string; code?: string; display?: string };
type Resource = {
  resourceType?: string; id?: string; name?: string; status?: string;
  identifier?: { system?: string; value?: string }[];
  physicalType?: { coding?: Coding[] };
  operationalStatus?: Coding;
  partOf?: { reference?: string };
};

export type UnitSummary = { unitCode: string; unitName: string; total: number; occupied: number; available: number; cleaning: number; blocked: number; occupancy: number };
export type FhirReport = { ok: boolean; bundleType: string | null; beds: number; units: UnitSummary[]; errors: string[]; warnings: string[]; ignored: Record<string, number> };

// HL7 v2-0116 yatak durum kodları (FHIR Location.operationalStatus).
const STATUS: Record<string, "occupied" | "available" | "cleaning" | "blocked"> = {
  O: "occupied", U: "available", K: "cleaning", H: "cleaning", C: "blocked", I: "blocked",
};

const code = (c?: { coding?: Coding[] }) => c?.coding?.map((x) => x.code).find(Boolean);

export function validateCapacityBundle(input: unknown): FhirReport {
  const report: FhirReport = { ok: false, bundleType: null, beds: 0, units: [], errors: [], warnings: [], ignored: {} };
  const bundle = input as { resourceType?: string; type?: string; entry?: { resource?: Resource }[] };
  if (!bundle || typeof bundle !== "object" || bundle.resourceType !== "Bundle") { report.errors.push('Kök kaynak "Bundle" olmalı (resourceType: "Bundle").'); return report; }
  report.bundleType = typeof bundle.type === "string" ? bundle.type : null;
  if (!["collection", "searchset", "batch", "transaction"].includes(report.bundleType ?? "")) report.warnings.push(`Bundle.type "${report.bundleType ?? "yok"}" beklenmiyor; collection veya searchset önerilir.`);
  if (!Array.isArray(bundle.entry) || !bundle.entry.length) { report.errors.push("Bundle.entry boş."); return report; }
  if (bundle.entry.length > MAX_ENTRIES) { report.errors.push(`En fazla ${MAX_ENTRIES} kayıt doğrulanır.`); return report; }

  const locations = new Map<string, Resource>();
  for (const [index, entry] of bundle.entry.entries()) {
    const r = entry?.resource;
    if (!r || typeof r !== "object" || typeof r.resourceType !== "string") { report.errors.push(`entry[${index}]: resource eksik.`); continue; }
    if (r.resourceType !== "Location") { report.ignored[r.resourceType] = (report.ignored[r.resourceType] ?? 0) + 1; continue; }
    if (!r.id || !/^[A-Za-z0-9\-.]{1,64}$/.test(r.id)) { report.errors.push(`entry[${index}]: Location.id geçersiz.`); continue; }
    if (locations.has(r.id)) { report.errors.push(`Location/${r.id} iki kez var.`); continue; }
    locations.set(r.id, r);
  }
  if (report.ignored.Patient) report.warnings.push(`${report.ignored.Patient} Patient kaynağı yok sayıldı: kapasite için hasta kimliği gerekmez, gönderilmemeli.`);

  const unitOf = (loc: Resource, depth = 0): string | null => {
    const direct = loc.identifier?.find((i) => i.system === UNIT_SYSTEM)?.value;
    if (direct) return direct;
    const parentId = loc.partOf?.reference?.replace(/^Location\//, "");
    if (!parentId || depth > 5) return null;
    const parent = locations.get(parentId);
    return parent ? unitOf(parent, depth + 1) : null;
  };

  const units = new Map<string, UnitSummary>();
  for (const loc of locations.values()) {
    if (code(loc.physicalType) !== "bd") continue; // yalnız yatak (bd); servis (wa), oda (ro) üst yapıdır
    report.beds++;
    const where = `Location/${loc.id}`;
    const unitCode = unitOf(loc);
    const unit = HOSPITAL_UNITS.find((u) => u.code === unitCode);
    if (!unitCode) { report.errors.push(`${where}: birim kodu yok (identifier system "${UNIT_SYSTEM}" veya partOf zinciri).`); continue; }
    if (!unit) { report.errors.push(`${where}: "${unitCode}" Klinorbis birimi değil.`); continue; }
    if (loc.status === "inactive") { report.warnings.push(`${where}: status=inactive, sayılmadı.`); continue; }
    const state = STATUS[loc.operationalStatus?.code ?? ""];
    if (!state) { report.errors.push(`${where}: operationalStatus kodu "${loc.operationalStatus?.code ?? "yok"}" tanınmadı (O, U, K, H, C, I).`); continue; }
    const summary = units.get(unit.code) ?? { unitCode: unit.code, unitName: unit.name, total: 0, occupied: 0, available: 0, cleaning: 0, blocked: 0, occupancy: 0 };
    summary.total++; summary[state]++;
    units.set(unit.code, summary);
  }
  if (!report.beds) report.errors.push('Yatak bulunamadı: Location.physicalType kodu "bd" olan kayıt gerekli.');
  report.units = [...units.values()].map((u) => ({ ...u, occupancy: u.total ? Math.round((u.occupied / u.total) * 100) : 0 })).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  for (const u of report.units) if (u.occupancy >= 90) report.warnings.push(`${u.unitName}: doluluk %${u.occupancy}, kapasite uyarısı.`);
  report.ok = report.errors.length === 0;
  return report;
}

/** Arayüzde "Örnek yükle" için sentetik, kimliksiz örnek paket. */
export function sampleCapacityBundle() {
  const ward = (id: string, unit: string, name: string) => ({ resource: { resourceType: "Location", id, name, status: "active", physicalType: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/location-physical-type", code: "wa" }] }, identifier: [{ system: UNIT_SYSTEM, value: unit }] } });
  const bed = (id: string, ward: string, status: string) => ({ resource: { resourceType: "Location", id, status: "active", physicalType: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/location-physical-type", code: "bd" }] }, operationalStatus: { system: "http://terminology.hl7.org/CodeSystem/v2-0116", code: status }, partOf: { reference: `Location/${ward}` } } });
  return {
    resourceType: "Bundle", type: "collection",
    entry: [
      ward("w-yb", "YOG", "Sentetik Yoğun Bakım"), ward("w-krd", "KRD", "Sentetik Kardiyoloji Servisi"),
      ...["O", "O", "O", "O", "O", "O", "O", "O", "O", "U"].map((s, i) => bed(`yb-${i + 1}`, "w-yb", s)),
      ...["O", "O", "U", "U", "K", "C"].map((s, i) => bed(`krd-${i + 1}`, "w-krd", s)),
    ],
  };
}
