// Sanal hastane simülasyonu: pilot öncesi "bu hastanede Klinorbis ne kazandırır?" sorusunu kurgusal bir
// hastane üzerinde, açık varsayımlarla yanıtlar. Gerçek veri kullanmaz, gerçek tablolara yazmaz, dışarıya
// hiçbir şey göndermez; aynı tohum (seed) ve aynı varsayımlar her zaman aynı sonucu verir.
//
// Model (kural tabanlı sanal personel):
//  - Olay üretici: hastane sistemlerinden gelebilecek 26 olay türü, yatak sayısıyla ölçeklenen günlük
//    sıklıklar ve saate göre yoğunluk eğrileri (taburcu öğlen, acil yatış akşam yoğun).
//  - Her olay ilgili operasyon akışını başlatır; adımlar birimden birime sırayla ilerler. Her birimde
//    vardiyaya göre sanal personel vardır (gündüz daha çok); iş, boş personel olunca yapılır.
//  - Aynı olaylar iki kez oynatılır:
//      "Telefon ve kâğıt": devir için arama (ulaşamama ve tekrar arama dahil), kâğıt form, "ne oldu?"
//      takip aramaları, unutulan devirler ve unutulan bağlı işler.
//      "Klinorbis": devir otomatik görev + bildirim, adım tamamlama tek işlem, hedef süre aşılınca
//      birim sorumlusuna yükseltme, bağlı akışlar koşula göre kendiliğinden.
//  - Adım süreleri, koşullar ve olaylar iki senaryoda birebir aynıdır; yalnız koordinasyon biçimi değişir.
import { HOSPITAL_UNITS } from "./hospital-units";
import { EVENT_TRIGGERS } from "./playbook-triggers";
import { CHAIN_CONDITIONS, playbookOf, type Playbook } from "./playbooks";

export const SIM_LABEL = "SİMÜLASYON · Kurgusal hastane · Rakamlar varsayımlara dayanır, gerçek pilot sonucu değildir.";
export const SIM_HOSPITAL = { name: "Kurgusal Örnek Hastanesi", campuses: ["Merkez Yerleşke", "Ek Bina"] } as const;

export type SimParams = {
  seed: number; days: number; beds: number;
  staffHourlyCostTL: number; phoneCallMinutes: number; reachFailRate: number; retryWaitMinutes: number;
  paperFormMinutes: number; klinorbisActionMinutes: number; forgottenHandoffRate: number; stillCallRate: number;
};
export const DEFAULT_PARAMS: SimParams = {
  seed: 42, days: 1, beds: 300,
  staffHourlyCostTL: 400, phoneCallMinutes: 2, reachFailRate: 0.3, retryWaitMinutes: 5,
  paperFormMinutes: 2, klinorbisActionMinutes: 0.5, forgottenHandoffRate: 0.04, stillCallRate: 0.15,
};
const LIMITS: Record<keyof SimParams, [number, number]> = {
  seed: [1, 2_147_483_646], days: [1, 7], beds: [30, 2000],
  staffHourlyCostTL: [50, 5000], phoneCallMinutes: [0.5, 15], reachFailRate: [0, 0.8], retryWaitMinutes: [1, 30],
  paperFormMinutes: [0, 20], klinorbisActionMinutes: [0.1, 5], forgottenHandoffRate: [0, 0.3], stillCallRate: [0, 1],
};
export const PARAM_LABELS: Record<keyof SimParams, string> = {
  seed: "Tohum (aynı tohum = aynı sonuç)", days: "Simüle edilecek gün", beds: "Yatak sayısı",
  staffHourlyCostTL: "Personel saatlik maliyeti (TL)", phoneCallMinutes: "Bir telefon görüşmesi (dk)",
  reachFailRate: "Aranan kişiye ilk denemede ulaşamama oranı", retryWaitMinutes: "Tekrar aramadan önce bekleme (dk)",
  paperFormMinutes: "Kâğıt form / deftere yazma (dk)", klinorbisActionMinutes: "Klinorbis'te bir işlem (dk)",
  forgottenHandoffRate: "Telefonla devirde unutulma oranı",
  stillCallRate: "Klinorbis varken yine de telefonla teyit edilen devir oranı",
};

export function cleanParams(raw: unknown): SimParams {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PARAMS };
  for (const key of Object.keys(LIMITS) as (keyof SimParams)[]) {
    const value = Number(r[key]);
    if (r[key] === undefined || r[key] === null || r[key] === "" || !Number.isFinite(value)) continue;
    const [min, max] = LIMITS[key];
    out[key] = Math.min(max, Math.max(min, value));
  }
  out.seed = Math.round(out.seed); out.days = Math.round(out.days); out.beds = Math.round(out.beds);
  return out;
}

// ---- Belirlenimci rastgelelik: anahtar → sayı. İki senaryo aynı anahtarla aynı değeri alır. ----
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = (seed: number, key: string) => mulberry32(hash(`${seed}|${key}`))();
const between = (seed: number, key: string, lo: number, hi: number) => lo + (hi - lo) * rnd(seed, key);

// ---- Olay sıklıkları (300 yataklı hastane için günlük ortalama) ve saatlik yoğunluk ----
const PROFILES: Record<string, number[]> = {
  flat: Array(24).fill(1),
  day: [0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 0.5, 0.9, 1.6, 1.8, 1.8, 1.7, 1.5, 1.6, 1.7, 1.6, 1.3, 1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
  discharge: [0, 0, 0, 0, 0, 0, 0.1, 0.3, 1, 2, 3, 3.2, 3, 2.8, 2.4, 1.8, 1.2, 0.8, 0.5, 0.3, 0.2, 0.1, 0, 0],
  evening: [0.8, 0.7, 0.6, 0.5, 0.4, 0.4, 0.5, 0.6, 0.8, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.7, 1.6, 1.4, 1.2, 1],
};
const RATES: Record<string, [number, keyof typeof PROFILES]> = {
  "patient.discharged": [40, "discharge"], "discharge.ordered": [40, "discharge"], "transfer.ordered": [12, "day"], "ed.boarding": [10, "evening"],
  "icu.bed_requested": [4, "evening"], "referral.incoming": [5, "day"], "capacity.red": [0.4, "day"], "surgery.cancelled": [2, "day"],
  "device.failure": [3, "day"], "imaging.down": [0.2, "flat"], "power.outage": [0.03, "flat"], "water.outage": [0.03, "flat"],
  "medgas.alarm": [0.1, "flat"], "or.climate_alarm": [0.2, "day"], "fire.alarm": [0.05, "flat"], "stock.critical": [2, "day"],
  "coldchain.alarm": [0.3, "flat"], "recall.notice": [0.1, "day"], "blood.low": [0.3, "day"], "his.outage": [0.1, "flat"],
  "security.incident": [0.1, "flat"], "staff.joined": [0.5, "day"], "staff.left": [0.4, "day"], "complaint.received": [3, "day"],
  "callcenter.overflow": [1, "day"], "patient.fall": [0.6, "evening"],
};
// Koşullu zincirlerin gerçekleşme olasılığı (sanal personelin "evet" deme oranı).
const CONDITION_ODDS: Record<string, number> = {
  yatak_yok: 0.3, erteleme_gerekli: 0.4, guvenli_ortam: 0.7, kalici_eksik: 0.3, uzun_durus: 0.25, onarim_gerekli: 0.6,
  cihaz_hasari: 0.2, kok_neden: 0.35, transfer_yetersiz: 0.4, kagit_kayit: 0.8, kisisel_veri: 0.3,
};
// Gündüz vardiyasında birim başına sanal personel (yoğun operasyon birimleri daha kalabalık).
const DAY_STAFF: Record<string, number> = { CTM: 4, ULS: 3, HIL: 3, YTK: 2, TBR: 2, RND: 2, CAG: 3, ECZ: 2, TKH: 2, BMD: 2, VZN: 2, KBL: 2 };
const isNight = (hour: number) => hour < 8 || hour >= 20;
const MAX_CHAIN = 4;
const MAX_WORK = 45;

type Mode = "phone" | "klinorbis";
type SimEvent = { id: string; type: string; at: number; campus: string; playbook?: string };
type ModeResult = {
  flows: number; steps: number; avgFlowMinutes: number; p90FlowMinutes: number; onTimeRate: number;
  coordinationMinutes: number; calls: number; failedCalls: number; followUpCalls: number; lostHandoffs: number;
  forgottenChains: number; forgottenDelayed: number; escalations: number; bedReadyMinutes: number;
};

function poisson(lambda: number, u: () => number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= u(); } while (p > L && k < 50);
  return k - 1;
}

// Tatbikat ve afet senaryoları: 1. gün 10:00–14:00 arasında olay sıklığı artar, bazı akışlar doğrudan başlar,
// personel azalabilir veya telefonla ulaşmak zorlaşır (santral yükü). Amaç: kriz günü hazırlığını önceden denemek.
export type Scenario = { key: string; label: string; detail: string; multipliers: Record<string, number>; inject: { hour: number; playbook: string }[]; staffFactor: number; extraFail: number };
export const SCENARIOS: Scenario[] = [
  { key: "normal", label: "Olağan gün", detail: "Saate göre değişen olağan olay yükü.", multipliers: {}, inject: [], staffFactor: 1, extraFail: 0 },
  { key: "kitlesel-yaralanma", label: "Kitlesel yaralanma (afet kodu)", detail: "10:00–14:00 acil yatış ×6, yoğun bakım ×5, nakil ×3; afet kodu akışı 10:00'da açılır.", multipliers: { "ed.boarding": 6, "icu.bed_requested": 5, "transfer.ordered": 3, "capacity.red": 8 }, inject: [{ hour: 10, playbook: "afet-kodu" }], staffFactor: 1, extraFail: 0.2 },
  { key: "hbys-kesinti", label: "HBYS kesintisi (4 saat)", detail: "10:00'da HBYS kesinti akışı açılır; kesinti boyunca telefonla ulaşmak zorlaşır.", multipliers: { "callcenter.overflow": 4 }, inject: [{ hour: 10, playbook: "hbys-kesinti" }], staffFactor: 1, extraFail: 0.25 },
  { key: "elektrik-kesinti", label: "Elektrik kesintisi", detail: "10:00'da elektrik kesintisi; cihaz arızası ×5, medikal gaz ve iklim alarmları artar.", multipliers: { "device.failure": 5, "medgas.alarm": 10, "or.climate_alarm": 6 }, inject: [{ hour: 10, playbook: "elektrik-kesinti" }], staffFactor: 1, extraFail: 0.1 },
  { key: "salgin", label: "Salgın şüphesi", detail: "10:00'da salgın şüphesi akışı; yoğun bakım talebi ×3, acil yatış ×2, kritik stok ×3.", multipliers: { "icu.bed_requested": 3, "ed.boarding": 2, "stock.critical": 3 }, inject: [{ hour: 10, playbook: "salgin-suphe" }], staffFactor: 1, extraFail: 0.05 },
  { key: "personel-eksik", label: "Personel eksikliği (%40)", detail: "Olağan olay yükü, ama 10:00–14:00 arasında birimlerde %40 daha az personel.", multipliers: {}, inject: [], staffFactor: 0.6, extraFail: 0.1 },
];
export const scenarioOf = (key: unknown) => SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
const inWindow = (minute: number) => minute >= 600 && minute < 840; // 1. gün 10:00–14:00

export function generateEvents(params: SimParams, scenario: Scenario = SCENARIOS[0]): SimEvent[] {
  const scale = params.beds / 300;
  const events: SimEvent[] = [];
  for (let day = 0; day < params.days; day++) for (let hour = 0; hour < 24; hour++) for (const trigger of EVENT_TRIGGERS) {
    const [daily, profileName] = RATES[trigger.type] ?? [0.1, "flat"];
    const profile = PROFILES[profileName];
    const sum = profile.reduce((a, b) => a + b, 0) || 1;
    const u = mulberry32(hash(`${params.seed}|ev|${day}|${hour}|${trigger.type}`));
    const boost = day === 0 && hour >= 10 && hour < 14 ? scenario.multipliers[trigger.type] ?? 1 : 1;
    const n = poisson(daily * scale * boost * profile[hour] / sum, u);
    for (let i = 0; i < n; i++) {
      const at = (day * 24 + hour) * 60 + Math.floor(u() * 60);
      events.push({ id: `${trigger.type}#${day}.${hour}.${i}`, type: trigger.type, at, campus: u() < 0.7 ? SIM_HOSPITAL.campuses[0] : SIM_HOSPITAL.campuses[1] });
    }
  }
  for (const [i, inj] of scenario.inject.entries()) events.push({ id: `senaryo#${i}`, type: "scenario", playbook: inj.playbook, at: inj.hour * 60, campus: SIM_HOSPITAL.campuses[0] });
  return events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// Küçük ikili yığın (öncelik kuyruğu): hazır olma zamanına göre sıralı adımlar.
// handed: önceki adımın bitişi (+ planlı bekleme); hedef süre buradan sayılır. scheduled: akıştaki planlı bekleme toplamı.
type Pending = { ready: number; handed: number; flowKey: string; playbook: Playbook; index: number; depth: number; origin: number; seq: number; scheduled: number };
class Heap {
  private items: Pending[] = [];
  get size() { return this.items.length; }
  private less(a: Pending, b: Pending) { return a.ready < b.ready || (a.ready === b.ready && a.seq < b.seq); }
  push(item: Pending) { const a = this.items; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() {
    const a = this.items; const top = a[0]; const last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}

function staffFor(unitCode: string, minute: number, beds: number, scenario: Scenario) {
  const base = Math.max(1, Math.round((DAY_STAFF[unitCode] ?? 1) * beds / 300));
  const day = inWindow(minute) ? Math.max(1, Math.round(base * scenario.staffFactor)) : base;
  return isNight(Math.floor((minute % 1440) / 60)) ? Math.max(1, Math.floor(day / 2)) : day;
}

function simulateMode(params: SimParams, events: SimEvent[], mode: Mode, scenario: Scenario = SCENARIOS[0]) {
  const S = params.seed;
  const servers = new Map<string, number[]>(); // birim → her personelin boşalma zamanı
  const unitCoord = new Map<string, number>();
  const hourly = new Map<number, { coord: number; overdueSteps: number }>();
  const addCoord = (unit: string, minutes: number, at: number) => {
    unitCoord.set(unit, (unitCoord.get(unit) ?? 0) + minutes);
    const h = Math.floor(at / 60); const row = hourly.get(h) ?? { coord: 0, overdueSteps: 0 }; row.coord += minutes; hourly.set(h, row);
  };
  const r: ModeResult = { flows: 0, steps: 0, avgFlowMinutes: 0, p90FlowMinutes: 0, onTimeRate: 0, coordinationMinutes: 0, calls: 0, failedCalls: 0, followUpCalls: 0, lostHandoffs: 0, forgottenChains: 0, forgottenDelayed: 0, escalations: 0, bedReadyMinutes: 0 };
  const flowDurations: number[] = [];
  let onTime = 0, seq = 0;
  const heap = new Heap();
  const startFlow = (playbook: Playbook, flowKey: string, ready: number, depth: number, firstUnitCost: boolean) => {
    r.flows++;
    // Akışı başlatan kişinin kayıt maliyeti: kâğıt form ya da tek işlem.
    const cost = mode === "phone" ? (firstUnitCost ? params.paperFormMinutes : 0) : params.klinorbisActionMinutes;
    if (cost) { r.coordinationMinutes += cost; addCoord(playbook.steps[0].unitCode, cost, ready); }
    heap.push({ ready, handed: ready, flowKey, playbook, index: 0, depth, origin: ready, seq: seq++, scheduled: 0 });
  };
  for (const ev of events) {
    const trigger = EVENT_TRIGGERS.find((t) => t.type === ev.type); const pb = playbookOf(ev.playbook ?? trigger?.playbook ?? "");
    if (pb) startFlow(pb, ev.id, ev.at, 0, true);
  }
  while (heap.size) {
    const p = heap.pop();
    const step = p.playbook.steps[p.index];
    const key = `${p.flowKey}|${p.index}`;
    const unit = step.unitCode;
    const pool = servers.get(unit) ?? []; servers.set(unit, pool);
    const need = staffFor(unit, p.ready, params.beds, scenario);
    while (pool.length < need) pool.push(0);
    // En erken boşalan sanal personel (gece vardiyasında yalnız ilk "need" kişi çalışır).
    let best = 0; for (let i = 1; i < need; i++) if (pool[i] < pool[best]) best = i;
    const work = Math.min(MAX_WORK, step.minutes * between(S, `work|${key}`, 0.2, 0.5));
    let start = Math.max(p.ready, pool[best]);
    let byManager = false;
    if (mode === "klinorbis" && start + work - p.handed > step.minutes && start > p.handed + step.minutes * 0.8) {
      // Gecikme yükseltmesi: hedef süre dolunca birim sorumlusu bildirim alır ve işi öne alır/devralır.
      r.escalations++; byManager = true;
      start = Math.min(start, Math.max(p.ready, p.handed + step.minutes) + between(S, `esc|${key}`, 5, 15));
    }
    const end = start + work;
    if (!byManager) pool[best] = end;
    r.steps++;
    const elapsed = end - p.handed;
    if (elapsed <= step.minutes) onTime++;
    else { const h = Math.floor(end / 60); const row = hourly.get(h) ?? { coord: 0, overdueSteps: 0 }; row.overdueSteps++; hourly.set(h, row); }
    // Telefon düzeninde uzun bekleyen işe "ne oldu?" takip aramaları gelir (her 30 dk'da bir, en fazla 3).
    if (mode === "phone") {
      const followUps = Math.min(2, Math.floor((start - p.handed) / 45));
      if (followUps) { r.followUpCalls += followUps; r.calls += followUps; const c = followUps * params.phoneCallMinutes * 2; r.coordinationMinutes += c; addCoord(unit, c, start); }
    } else {
      r.coordinationMinutes += params.klinorbisActionMinutes; addCoord(unit, params.klinorbisActionMinutes, end);
    }
    const last = p.index + 1 >= p.playbook.steps.length;
    if (!last) {
      const next = p.playbook.steps[p.index + 1];
      let delay: number;
      if (next.unitCode === unit) {
        delay = 0; // aynı birimde sıradaki adım: devir yok
      } else if (mode === "phone") {
        // Devir araması: ulaşana kadar dene (gece ulaşmak daha zor). Her deneme arayanın zamanı; başarılı görüşme iki kişinin.
        const fail = Math.min(0.9, params.reachFailRate + (isNight(Math.floor(end / 60) % 24) ? 0.15 : 0) + (inWindow(end) ? scenario.extraFail : 0));
        let attempts = 1; while (attempts < 6 && rnd(S, `call|${key}|${attempts}`) < fail) attempts++;
        const failed = attempts - 1;
        r.calls += attempts; r.failedCalls += failed;
        const cost = failed * params.phoneCallMinutes * 0.5 + params.phoneCallMinutes * 2 + params.paperFormMinutes * 0.5;
        r.coordinationMinutes += cost; addCoord(unit, cost, end);
        delay = failed * params.retryWaitMinutes + params.phoneCallMinutes;
        if (rnd(S, `lost|${key}`) < params.forgottenHandoffRate) {
          // Unutulan devir: sonradan fark edilir, ek arama ve uzun bekleme.
          r.lostHandoffs++; delay += between(S, `lostd|${key}`, 60, 180);
          const c = params.phoneCallMinutes * 2; r.calls++; r.coordinationMinutes += c; addCoord(next.unitCode, c, end);
        }
      } else {
        delay = between(S, `notice|${key}`, 1, 5); // bildirimi görme süresi
        const c = params.klinorbisActionMinutes; r.coordinationMinutes += c; addCoord(next.unitCode, c, end);
        if (rnd(S, `still|${key}`) < params.stillCallRate) { const cc = params.phoneCallMinutes * 2; r.calls++; r.coordinationMinutes += cc; addCoord(unit, cc, end); }
      }
      if (next.waitMinutes) {
        // Gecikmeli adımı (ör. 48 saat sonra arama) kâğıtla hatırlamak: bir kısmı unutulur.
        if (mode === "phone" && rnd(S, `delayed|${key}`) < Math.min(0.5, params.forgottenHandoffRate * 3)) { r.forgottenDelayed++; continue; }
      }
      const handed = end + next.waitMinutes;
      heap.push({ ...p, handed, ready: handed + delay, index: p.index + 1, seq: seq++, scheduled: p.scheduled + next.waitMinutes });
      continue;
    }
    // Akış kapandı.
    const duration = end - p.origin - p.scheduled;
    flowDurations.push(duration);
    if (p.playbook.code === "yatak-hazirlik") r.bedReadyMinutes += duration;
    if (p.depth >= MAX_CHAIN) continue;
    for (const rule of p.playbook.nextRules) {
      if (rule.when && rnd(S, `cond|${p.flowKey}|${rule.when}`) >= (CONDITION_ODDS[rule.when] ?? 0.3)) continue;
      const child = playbookOf(rule.code); if (!child) continue;
      const childKey = `${p.flowKey}>${rule.code}`;
      let ready = end;
      if (mode === "phone") {
        // Bağlı işi başlatmak için ilgili birime ayrıca haber vermek gerekir; bazen unutulur.
        if (rnd(S, `chainlost|${childKey}`) < params.forgottenHandoffRate * 2) { r.forgottenChains++; continue; }
        const c = params.phoneCallMinutes * 2 + params.paperFormMinutes; r.calls++; r.coordinationMinutes += c; addCoord(child.steps[0].unitCode, c, end);
        ready += params.phoneCallMinutes + between(S, `chaind|${childKey}`, 5, 30);
      }
      startFlow(child, childKey, ready, p.depth + 1, false);
    }
  }
  flowDurations.sort((a, b) => a - b);
  r.avgFlowMinutes = flowDurations.length ? Math.round(flowDurations.reduce((a, b) => a + b, 0) / flowDurations.length) : 0;
  r.p90FlowMinutes = flowDurations.length ? Math.round(flowDurations[Math.min(flowDurations.length - 1, Math.floor(flowDurations.length * 0.9))]) : 0;
  r.onTimeRate = r.steps ? Math.round((onTime / r.steps) * 100) : 0;
  r.coordinationMinutes = Math.round(r.coordinationMinutes);
  r.bedReadyMinutes = Math.round(r.bedReadyMinutes);
  return { result: r, unitCoord, hourly };
}

export function runSimulation(raw: unknown, rawScenario?: unknown) {
  const params = cleanParams(raw);
  const scenario = scenarioOf(rawScenario ?? (raw && typeof raw === "object" ? (raw as Record<string, unknown>).scenario : undefined));
  const events = generateEvents(params, scenario);
  const phone = simulateMode(params, events, "phone", scenario);
  const klin = simulateMode(params, events, "klinorbis", scenario);
  const savedMinutes = Math.max(0, phone.result.coordinationMinutes - klin.result.coordinationMinutes);
  const perDay = savedMinutes / params.days;
  const tl = (minutes: number) => Math.round((minutes / 60) * params.staffHourlyCostTL);
  const unitName = (code: string) => HOSPITAL_UNITS.find((u) => u.code === code)?.name ?? code;
  const units = [...new Set([...phone.unitCoord.keys(), ...klin.unitCoord.keys()])].map((code) => {
    const a = Math.round(phone.unitCoord.get(code) ?? 0), b = Math.round(klin.unitCoord.get(code) ?? 0);
    return { unitCode: code, unitName: unitName(code), phoneMinutes: a, klinorbisMinutes: b, savedMinutes: Math.max(0, a - b) };
  }).sort((x, y) => y.savedMinutes - x.savedMinutes);
  const hours = params.days * 24;
  const eventsByHour = Array(hours).fill(0) as number[];
  for (const e of events) if (e.at < hours * 60) eventsByHour[Math.floor(e.at / 60)]++;
  let cumPhone = 0, cumKlin = 0;
  const timeline = eventsByHour.map((n, h) => {
    cumPhone += phone.hourly.get(h)?.coord ?? 0; cumKlin += klin.hourly.get(h)?.coord ?? 0;
    return { hour: h, events: n, phoneOverdue: phone.hourly.get(h)?.overdueSteps ?? 0, klinorbisOverdue: klin.hourly.get(h)?.overdueSteps ?? 0, savedMinutes: Math.max(0, Math.round(cumPhone - cumKlin)) };
  });
  const byType = EVENT_TRIGGERS.map((t) => ({ type: t.type, label: t.label, count: events.filter((e) => e.type === t.type).length })).filter((x) => x.count).sort((a, b) => b.count - a.count);
  const p = phone.result, k = klin.result;
  const fmtH = (m: number) => `${Math.round(m / 60).toLocaleString("tr-TR")} saat`;
  const crisis = scenario.key === "normal" ? null : (() => {
    // Kriz penceresi (1. gün 10:00–18:00): geciken adım sayısı iki düzende.
    const slice = timeline.slice(10, 18);
    return { phoneOverdue: slice.reduce((a, t) => a + t.phoneOverdue, 0), klinorbisOverdue: slice.reduce((a, t) => a + t.klinorbisOverdue, 0) };
  })();
  const summary = [
    ...(scenario.key === "normal" ? [] : [`Senaryo: ${scenario.label}. ${scenario.detail} Kriz saatlerinde (10:00–18:00) hedefi aşan adım: telefonla ${crisis!.phoneOverdue}, Klinorbis ile ${crisis!.klinorbisOverdue}.`]),
    `${SIM_HOSPITAL.name} (${params.beds} yatak, ${SIM_HOSPITAL.campuses.length} yerleşke) için ${params.days} günde ${events.length} olay ve ${k.flows} operasyon akışı oynatıldı.`,
    `Koordinasyon için harcanan personel zamanı telefon ve kâğıtla ${fmtH(p.coordinationMinutes)}, Klinorbis ile ${fmtH(k.coordinationMinutes)}; günde yaklaşık ${fmtH(perDay)} fark.`,
    `Hedef süresinde biten adım oranı %${p.onTimeRate} → %${k.onTimeRate}. Telefonla ${p.lostHandoffs} devir ve ${p.forgottenChains + p.forgottenDelayed} bağlı/gecikmeli iş unutuldu; Klinorbis'te ${k.escalations} iş gecikince yöneticiye yükseldi.`,
  ];
  return {
    label: SIM_LABEL, hospital: SIM_HOSPITAL, params,
    scenario: { key: scenario.key, label: scenario.label, detail: scenario.detail, crisis },
    events: { total: events.length, byType },
    phone: p, klinorbis: k,
    savings: {
      coordinationMinutes: savedMinutes, perDayMinutes: Math.round(perDay),
      perDayTL: tl(perDay), perMonthTL: tl(perDay * 30), perYearTL: tl(perDay * 365),
      // Temkinli alt sınır: modelin bulduğu farkın yarısı (model iyimser olabilir; gerçek pilotla doğrulanmalı).
      conservativeMonthTL: tl(perDay * 30 * 0.5), conservativeYearTL: tl(perDay * 365 * 0.5),
      fteEquivalent: Math.round((perDay / (7.5 * 60)) * 10) / 10,
      calls: Math.max(0, p.calls - k.calls),
      bedReadyMinutesPerFlow: (() => { const pf = events.filter((e) => e.type === "patient.discharged").length; return pf ? Math.round((p.bedReadyMinutes - k.bedReadyMinutes) / Math.max(1, pf)) : 0; })(),
    },
    units: units.slice(0, 12), timeline, summary,
    assumptions: (Object.keys(PARAM_LABELS) as (keyof SimParams)[]).map((key) => ({ key, label: PARAM_LABELS[key], value: params[key] })),
    conditions: Object.entries(CONDITION_ODDS).map(([key, odds]) => ({ label: CHAIN_CONDITIONS[key] ?? key, odds })),
  };
}
export type SimulationResult = ReturnType<typeof runSimulation>;
