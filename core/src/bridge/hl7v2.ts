// HL7 v2.x ADT ayrıştırıcı (A01 yatış, A02 nakil, A03 taburcu, A08 güncelleme, A11/A12/A13 iptaller) ve ACK üretici.
// Yalnız koordinasyon için gereken alanlar okunur: kimlik (kasaya şifreli gider), ziyaret numarası (karma olarak tutulur),
// birim/oda/yatak ve olay zamanı. Tanı (DG1), ilaç (RXE), sonuç (OBX) gibi klinik segmentler bilerek okunmaz.
export type AdtEvent = "A01" | "A02" | "A03" | "A08" | "A11" | "A12" | "A13";
export type NormalizedAdt = {
  event: AdtEvent; controlId: string; version: string; sendingFacility: string; occurredAt: Date;
  patient: { nationalId: string | null; givenName: string; familyName: string };
  visit: { number: string; unitCode: string; room: string | null; bed: string | null; priorUnitCode: string | null; priorRoom: string | null; priorBed: string | null };
};
export class Hl7Error extends Error {
  code: "AR" | "AE";
  constructor(code: "AR" | "AE", message: string) { super(message); this.code = code; }
}

// A11 yatış iptali, A12 nakil iptali, A13 taburcu iptali (düzeltme mesajları).
const SUPPORTED = new Set(["A01", "A02", "A03", "A08", "A11", "A12", "A13"]);

export function splitSegments(message: string) {
  return message.replace(/\r\n|\n/g, "\r").split("\r").map((s) => s.trim()).filter(Boolean);
}

/** HL7 kaçış dizileri: \F\ \S\ \T\ \R\ \E\ */
function unescape(v: string, enc: { field: string; comp: string; rep: string; esc: string; sub: string }) {
  return v.replace(/\\([FSTRE])\\/g, (_, c: string) => ({ F: enc.field, S: enc.comp, T: enc.sub, R: enc.rep, E: enc.esc } as Record<string, string>)[c] ?? "");
}

export function parseAdt(message: string): NormalizedAdt {
  if (message.length > 64_000) throw new Hl7Error("AR", "Mesaj çok büyük");
  const segs = splitSegments(message);
  const msh = segs[0];
  if (!msh?.startsWith("MSH") || msh.length < 8) throw new Hl7Error("AR", "MSH segmenti yok");
  const enc = { field: msh[3], comp: msh[4], rep: msh[5], esc: msh[6], sub: msh[7] };
  const fields = (seg: string) => seg.split(enc.field);
  const get = (name: string) => segs.find((s) => s.startsWith(name + enc.field));
  // MSH'de alan numaralandırması bir kaydırmalıdır (MSH-1 ayırıcının kendisidir).
  const m = fields(msh);
  const mshField = (n: number) => m[n - 1] ?? "";
  const type = mshField(9).split(enc.comp);
  if (type[0] !== "ADT") throw new Hl7Error("AR", `Desteklenmeyen mesaj türü: ${type[0]}`);
  const event = (type[1] ?? "") as AdtEvent;
  if (!SUPPORTED.has(event)) throw new Hl7Error("AR", `Desteklenmeyen olay: ${type[1]}`);
  const controlId = mshField(10);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(controlId)) throw new Hl7Error("AR", "Geçersiz kontrol numarası");
  const pid = get("PID"), pv1 = get("PV1");
  if (!pid || !pv1) throw new Hl7Error("AE", "PID veya PV1 eksik");
  const p = fields(pid), v = fields(pv1);
  // PID-3: kimlik listesi (tekrarlı). Türkiye'de TCKN genellikle "NI" (ulusal kimlik) tipiyle gelir.
  const ids = (p[3] ?? "").split(enc.rep).map((x) => x.split(enc.comp));
  const ni = ids.find((c) => c[4] === "NI" || c[4] === "NNTUR") ?? null;
  const name = (p[5] ?? "").split(enc.rep)[0].split(enc.comp);
  const loc = (raw: string) => { const c = (raw ?? "").split(enc.comp).map((x) => unescape(x, enc)); return { unit: c[0] || null, room: c[1] || null, bed: c[2] || null }; };
  const cur = loc(v[3] ?? ""), prior = loc(v[6] ?? "");
  const visitNumber = (v[19] ?? "").split(enc.comp)[0];
  if (!cur.unit) throw new Hl7Error("AE", "PV1-3 birim kodu eksik");
  if (!visitNumber) throw new Hl7Error("AE", "PV1-19 ziyaret numarası eksik");
  const evn = get("EVN");
  const ts = (evn ? fields(evn)[2] : "") || mshField(7);
  return {
    event, controlId, version: mshField(12) || "2.5", sendingFacility: mshField(4).split(enc.comp)[0],
    occurredAt: parseHl7Time(ts),
    patient: { nationalId: ni ? ni[0] : null, givenName: unescape(name[1] ?? "", enc), familyName: unescape(name[0] ?? "", enc) },
    visit: { number: visitNumber, unitCode: cur.unit, room: cur.room, bed: cur.bed, priorUnitCode: prior.unit, priorRoom: prior.room, priorBed: prior.bed },
  };
}

/** YYYYMMDDHHMM[SS][+ZZZZ]; saat dilimi yoksa Türkiye (+03:00) kabul edilir. */
export function parseHl7Time(v: string) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?$/.exec(v ?? "");
  if (!m) throw new Hl7Error("AE", "Geçersiz zaman");
  const tz = m[7] ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : "+03:00";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}${tz}`);
  if (Number.isNaN(d.getTime())) throw new Hl7Error("AE", "Geçersiz zaman");
  return d;
}

/** ACK: AA (kabul), AE (hata), AR (ret). Kimlik bilgisi ACK'e konmaz. */
export function buildAck(original: string, code: "AA" | "AE" | "AR", text = "", now = new Date()) {
  const segs = splitSegments(original);
  const msh = segs[0]?.startsWith("MSH") ? segs[0] : "MSH|^~\\&|||||||||2.5";
  const f = msh[3] ?? "|";
  const m = msh.split(f);
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const control = m[9] ?? "";
  const safe = text.replace(/[|^~\\&\r\n]/g, " ").slice(0, 80);
  return [`MSH${f}${m[1] ?? "^~\\&"}${f}KLINORBIS${f}${m[5] ?? ""}${f}${m[2] ?? ""}${f}${m[3] ?? ""}${f}${stamp}${f}${f}ACK^${(m[8] ?? "").split("^")[1] ?? ""}${f}ACK-${control}${f}P${f}${m[11] ?? "2.5"}`, `MSA${f}${code}${f}${control}${f}${safe}`].join("\r");
}
