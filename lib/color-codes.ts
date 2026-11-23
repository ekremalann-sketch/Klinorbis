// KG2: renkli kodlar. Tek dokunuşla kod çağrısı; ilgili ekip birimlerine ve operasyon yöneticisine anında bildirim
// (web push açıksa telefona da sinyal). Çağrı → onay → varış → kapanış zamanları değişmez şekilde kaydedilir.
// Sınır: Mavi kod yalnız lojistiktir (ekibi çağırır, süreyi kaydeder); tıbbi müdahaleye yön vermez. Hasta bilgisi yok.
// Yetki sunucuda: çağrıyı her operasyon personeli yapar; onay/varış/kapanış yalnız ekip birimi üyesi veya operasyon yöneticisi.
import { getDb } from "../db";
import { auditStatements } from "./audit";
import { findUnit } from "./hospital-units";
import { notificationStatements, roleRecipients, unitRecipients } from "./notifications";
import { runBatch } from "./playbook-store";
import { redactPII } from "./privacy";
import { requireOperationalWriter, SecurityError, type RequestActor } from "./security";
import { dispatchPush } from "./web-push";

// Ekip birimleri hastane prosedürüne göre değişebilir; varsayılan eşleme aşağıdadır.
export const COLOR_CODES = {
  mavi: { label: "Mavi kod", meaning: "Acil tıbbi müdahale ekibi çağrısı (yalnız ekip çağırma ve süre kaydı)", teams: ["ACY"] },
  beyaz: { label: "Beyaz kod", meaning: "Çalışana şiddet veya tehdit", teams: ["GVN"] },
  pembe: { label: "Pembe kod", meaning: "Bebek veya çocuk kaçırma girişimi", teams: ["GVN"] },
  kirmizi: { label: "Kırmızı kod", meaning: "Yangın", teams: ["GVN", "TKH", "ISG"] },
  turuncu: { label: "Turuncu kod", meaning: "Hastane prosedüründe tanımlı tehlikeli madde / KBRN durumu", teams: ["GVN", "ISG", "ACY"] },
} as const;
type Color = keyof typeof COLOR_CODES;
type Row = { id: number; reference: string; color: Color; location: string; drill: number; called_by: string; called_at: number; acked_by: string | null; acked_at: number | null; arrived_by: string | null; arrived_at: number | null; closed_by: string | null; closed_at: number | null; close_note: string | null };

const d1 = () => {
  const d = (globalThis as typeof globalThis & { __KLINORBIS_DB?: D1Database }).__KLINORBIS_DB;
  if (!d) throw new SecurityError(503, "Veritabanı kullanılamıyor.", "DATABASE_UNAVAILABLE");
  return d;
};
const MANAGERS = ["operations_manager", "unit_manager"];
const isTeam = (actor: RequestActor, color: Color) => actor.role === "operations_manager" || COLOR_CODES[color].teams.some((u) => actor.unitCodes.includes(u));
const secs = (a: number | null, b: number | null) => (a && b ? Math.round((b - a) / 1000) : null);
const view = (r: Row, actor: RequestActor) => ({
  reference: r.reference, color: r.color, label: COLOR_CODES[r.color].label, location: r.location, drill: !!r.drill,
  calledAt: r.called_at, ackedAt: r.acked_at, arrivedAt: r.arrived_at, closedAt: r.closed_at,
  ackSeconds: secs(r.called_at, r.acked_at), arriveSeconds: secs(r.called_at, r.arrived_at), closeNote: r.close_note,
  next: r.closed_at ? null : !isTeam(actor, r.color) ? null : !r.acked_at ? "ack" : !r.arrived_at ? "arrive" : "close",
});

export async function listCodes(actor: RequestActor) {
  const open = (await d1().prepare("SELECT * FROM emergency_codes WHERE closed_at IS NULL ORDER BY called_at DESC LIMIT 50").all<Row>()).results;
  const history = MANAGERS.includes(actor.role)
    ? (await d1().prepare("SELECT * FROM emergency_codes WHERE closed_at IS NOT NULL ORDER BY called_at DESC LIMIT 50").all<Row>()).results
      .filter((r) => actor.role === "operations_manager" || isTeam(actor, r.color))
    : [];
  return {
    open: open.map((r) => view(r, actor)), history: history.map((r) => view(r, actor)),
    colors: Object.entries(COLOR_CODES).map(([code, c]) => ({ code, label: c.label, meaning: c.meaning, teams: c.teams.map((u) => findUnit(u).name) })),
    canDrill: MANAGERS.includes(actor.role),
  };
}

export async function callCode(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  requireOperationalWriter(actor);
  const color = typeof input.color === "string" && Object.hasOwn(COLOR_CODES, input.color) ? input.color as Color : null;
  if (!color) throw new SecurityError(400, "Kod rengini seçin.", "INVALID_INPUT");
  const location = typeof input.location === "string" ? redactPII(input.location.trim().slice(0, 80)).maskedText : "";
  if (location.length < 2) throw new SecurityError(400, "Yeri yazın (ör. 3. kat B blok koridor).", "INVALID_INPUT");
  const drill = input.drill === true;
  if (drill && !MANAGERS.includes(actor.role)) throw new SecurityError(403, "Tatbikatı yalnız yönetici başlatır; gerçek çağrı her zaman açıktır.", "DRILL_MANAGER_ONLY");
  // Aynı yerden aynı renk 2 dakika içinde tekrar çağrılırsa yeni kayıt açılmaz (çift dokunuş).
  const dup = await d1().prepare("SELECT reference FROM emergency_codes WHERE color=? AND location=? AND closed_at IS NULL AND called_at>?").bind(color, location, now - 120_000).first<string>("reference");
  if (dup) return { reference: dup, duplicate: true };
  const c = COLOR_CODES[color];
  const reference = `KOD-${now.toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
  await d1().prepare("INSERT INTO emergency_codes(reference,color,location,drill,called_by,called_at) VALUES(?,?,?,?,?,?)").bind(reference, color, location, drill ? 1 : 0, actor.email, now).run();
  const db = getDb();
  const recipients = [...new Set([...(await Promise.all(c.teams.map((u) => unitRecipients(db, u)))).flat(), ...await roleRecipients(db, "operations_manager")])];
  const title = `${drill ? "TATBİKAT · " : ""}${c.label}: ${location}`;
  await runBatch(db, [
    ...notificationStatements(db, recipients, { kind: "code", title, detail: c.meaning, path: "/kodlar", key: `code:${reference}` }, new Date(now)),
    ...await auditStatements(db, [{ actor: actor.email, action: "code.called", resource: reference, detail: `${c.label}${drill ? " (tatbikat)" : ""} · ${location}` }]),
  ] as Parameters<typeof runBatch>[1], "Kod bildirimi yazılamadı; tekrar deneyin.");
  // Telefon sinyali en iyi çabadır; anahtar yoksa no-op. Uygulama içi bildirim zaten yazıldı.
  await dispatchPush().catch(() => undefined);
  return { reference, duplicate: false, notified: recipients.length };
}

/** Onay, varış ve kapanış: her adım bir kez kaydedilir (ilk yapanın adı ve zamanı); sıra atlanamaz. */
export async function advanceCode(actor: RequestActor, input: Record<string, unknown>, now = Date.now()) {
  const reference = typeof input.reference === "string" ? input.reference.slice(0, 40) : "";
  const r = await d1().prepare("SELECT * FROM emergency_codes WHERE reference=?").bind(reference).first<Row>();
  if (!r) throw new SecurityError(404, "Kod kaydı bulunamadı.", "NOT_FOUND");
  if (!isTeam(actor, r.color)) throw new SecurityError(403, "Bu kodu yalnız ilgili ekip veya operasyon yöneticisi ilerletir.", "TEAM_ONLY");
  let sql: string, args: unknown[], action: string;
  switch (input.step) {
    case "ack": sql = "UPDATE emergency_codes SET acked_by=?,acked_at=? WHERE id=? AND acked_at IS NULL AND closed_at IS NULL"; args = [actor.email, now, r.id]; action = "code.acked"; break;
    case "arrive": sql = "UPDATE emergency_codes SET arrived_by=?,arrived_at=? WHERE id=? AND acked_at IS NOT NULL AND arrived_at IS NULL AND closed_at IS NULL"; args = [actor.email, now, r.id]; action = "code.arrived"; break;
    case "close": {
      const note = typeof input.note === "string" && input.note.trim() ? redactPII(input.note.trim().slice(0, 300)).maskedText : null;
      sql = "UPDATE emergency_codes SET closed_by=?,closed_at=?,close_note=? WHERE id=? AND arrived_at IS NOT NULL AND closed_at IS NULL"; args = [actor.email, now, note, r.id]; action = "code.closed"; break;
    }
    default: throw new SecurityError(400, "Bilinmeyen adım.", "INVALID_INPUT");
  }
  const res = await d1().prepare(sql).bind(...args).run();
  if (!Number(res.meta?.changes ?? 0)) throw new SecurityError(409, "Bu adım zaten kaydedildi veya sırası gelmedi; listeyi yenileyin.", "CODE_STATE");
  const db = getDb();
  await runBatch(db, await auditStatements(db, [{ actor: actor.email, action, resource: r.reference, detail: `${COLOR_CODES[r.color].label}${r.drill ? " (tatbikat)" : ""} · +${Math.round((now - r.called_at) / 1000)} sn` }]) as Parameters<typeof runBatch>[1], "Kayıt yazılamadı.");
  return { reference: r.reference, step: input.step };
}
