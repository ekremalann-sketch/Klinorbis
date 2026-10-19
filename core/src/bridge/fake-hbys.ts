// Sahte HBYS (yalnız test ve demo): kurgusal hastalar için HL7 v2 ADT mesajları üretir. Adlar açıkça kurgusaldır,
// TCKN'ler kontrol hanesine uyan ama "99" ile başlayan rastgele sentetik numaralardır. Gerçek veri yoktur.
const GIVEN = ["Deneme", "Örnek", "Kurgu", "Test", "Model"];
const FAMILY = ["Kurgusal", "Sentetik", "Örnekoğlu", "Denemeci", "Modelli"];

export function syntheticTckn(n: number) {
  const base = [9, 9, ...String(1000000 + (n % 8999999)).slice(-7).split("").map(Number)];
  const d10 = (((base[0] + base[2] + base[4] + base[6] + base[8]) * 7 - (base[1] + base[3] + base[5] + base[7])) % 10 + 10) % 10;
  const d11 = [...base, d10].reduce((a, b) => a + b, 0) % 10;
  return [...base, d10, d11].join("");
}

const pad = (n: number) => String(n).padStart(2, "0");
const ts = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}+0000`;

export type FakePatient = { n: number; visit: string; unit: string; room: string; bed: string };
export function adt(event: "A01" | "A02" | "A03" | "A08" | "A11" | "A12" | "A13", p: FakePatient, control: string, at = new Date(), prior?: { unit: string; room: string; bed: string }) {
  const name = `${FAMILY[p.n % FAMILY.length]}^${GIVEN[p.n % GIVEN.length]}`;
  return [
    `MSH|^~\\&|SAHTE-HBYS|KURGU-HASTANE|KLINORBIS|KURGU-HASTANE|${ts(at)}||ADT^${event}|${control}|P|2.5`,
    `EVN|${event}|${ts(at)}`,
    `PID|1||${syntheticTckn(p.n)}^^^NVI^NI~${100000 + p.n}^^^KURGU^MR||${name}||19800101|U`,
    `PV1|1|I|${p.unit}^${p.room}^${p.bed}|||${prior ? `${prior.unit}^${prior.room}^${prior.bed}` : ""}|||||||||||||${p.visit}`,
  ].join("\r");
}
