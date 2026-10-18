// Hasta erişimi: hekim yokluğu → plan → birim onayı → hasta bilgilendirme → hasta yanıtı.
// Gerçek rota kodu, bellek içi SQLite, yalnız sentetik takma adlar.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@klinorbis.test";
const SECRET = "test-only-message-secret";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER, webhookSecret: SECRET });
const now = Date.now();
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Test', 1, 1, 1)");
const MGR = "krd.mgr@klinorbis.test", DOC = "krd.doc@klinorbis.test", AGENT = "cag@klinorbis.test", ORTM = "ort.mgr@klinorbis.test", PRIV = "kvkk@klinorbis.test";
for (const [email, role, unit] of [[MGR, "unit_manager", "KRD"], [DOC, "clinician", "KRD"], [AGENT, "call_agent", "CAG"], [ORTM, "unit_manager", "ORT"], [PRIV, "privacy_officer", "KVT"]]) { staff.run(email, email, role, now); member.run(email, unit); }

const [pa, approvalsRoute, messages, tickets, lib, schedule] = await Promise.all([
  loadRoute("app/api/patient-access/route.ts"), loadRoute("app/api/approvals/route.ts"),
  loadRoute("app/api/integrations/messages/route.ts"), loadRoute("app/api/tickets/route.ts"), loadRoute("lib/patient-access.ts"), loadRoute("app/api/integrations/schedule/route.ts"),
]);
const get = (email) => pa.GET(new Request(`${ORIGIN}/api/patient-access`, { headers: email ? { "oai-authenticated-user-email": email } : {} }));
const post = (email, body) => pa.POST(browserJson("/api/patient-access", body, email));
const decide = (email, reference, decision) => approvalsRoute.POST(browserJson("/api/approvals", { reference, decision }, email));
const appt = (ref) => ({ ...sqlite.prepare("SELECT status, physician_code, starts_at, version FROM appointments WHERE reference = ?").get(ref) });
const changes = (abs) => sqlite.prepare("SELECT * FROM appointment_changes WHERE absence_reference = ? ORDER BY id").all(abs);
const istanbulDay = (ms) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);

let day, absence;
await test("1) kurallar: klinik öncelik hekime, izinli hasta aynı gün başka hekime, kapasite paylaşılmaz, sonra aynı hekim ileri gün", () => {
  const base = Date.parse("2026-10-07T06:00:00Z"); // Çarşamba 09:00 İstanbul
  const physician = { code: "A", displayLabel: "A", unitCode: "KRD", facilityCode: "F01", dailyCapacity: 2, active: true };
  const peer = { ...physician, code: "B" };
  const mk = (r, i, extra = {}) => ({ reference: r, patientAlias: "X", physicianCode: "A", unitCode: "KRD", facilityCode: "F01", startsAt: base + i * 1800000, status: "scheduled", clinicalPriority: false, allowOtherPhysician: false, preferredChannel: "sms", consentChannels: ["sms"], ...extra });
  const plan = lib.planAbsence({ physician, day: "2026-10-07", physicians: [physician, peer], booked: { "B|2026-10-07": 1 }, appointments: [mk("r1", 0, { clinicalPriority: true }), mk("r2", 1, { allowOtherPhysician: true }), mk("r3", 2, { allowOtherPhysician: true }), mk("r4", 3)] });
  assert.deepEqual(plan.map((p) => p.option), ["clinical_review", "substitute_same_day", "same_physician_later", "same_physician_later"]);
  assert.equal(istanbulDay(plan[2].startsAt), "2026-10-08");
  assert.equal(istanbulDay(plan[3].startsAt), "2026-10-08", "A'nın kapasitesi 2: iki kişi ertesi güne sığar");
  // Hafta sonu atlanır: Cuma yokluğu → Pazartesi.
  const fri = lib.planAbsence({ physician: { ...physician, dailyCapacity: 1 }, day: "2026-10-09", physicians: [physician], booked: {}, appointments: [{ ...mk("f1", 0), startsAt: base + 2 * 86400000 }] });
  assert.equal(istanbulDay(fri[0].startsAt), "2026-10-12");
  // Sessiz saat: 23:00 İstanbul'da üretilen bildirim ertesi gün 09:00'a ertelenir; acil olan beklemez.
  const late = Date.parse("2026-10-06T20:00:00Z");
  assert.equal(new Date(lib.sendTime(late, false)).toISOString(), "2026-10-07T06:00:00.000Z");
  assert.equal(lib.sendTime(late, true), late);
  // Kanal: randevuya 24 saatten az kaldıysa telefonla aranır; izin yoksa kanal yok → arama.
  assert.deepEqual(lib.chooseChannel({ preferredChannel: "sms", consentChannels: ["sms", "phone"] }, 5), { channel: "phone", alsoCall: true });
  assert.deepEqual(lib.chooseChannel({ preferredChannel: null, consentChannels: [] }, 72), { channel: null, alsoCall: true });
  // Mesaj güvenliği: tanı kelimesi veya telefon içeren metin reddedilir; hassas branş "poliklinik" yazılır.
  assert.throws(() => lib.assertSafeMessage("Kanser kontrolünüz ertelendi"));
  assert.throws(() => lib.assertSafeMessage("Sizi 0532 123 45 67 arayacak"));
  assert.match(lib.renderMessage("appointment_review", { reference: "RDV-1", unitCode: "PSK", unitLabel: "Ruh Sağlığı ve Hastalıkları", oldStartsAt: base }), /poliklinik randevunuz/);
  assert.equal(lib.classifyRequest("Randevumu iptal etmek istiyorum, gelemeyeceğim").code, "cancel");
});

await test("2) yokluk bildirimi: yetki, birim sınırı, plan ve onay kapısı", async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await post(OWNER,{action:"demo.seed"})).status,200);
  const seed = await (await get(MGR)).json();
  assert.ok(seed.physicians.every((p) => p.unitCode === "KRD"), "birim yöneticisi yalnız kendi birim hekimlerini görür");
  assert.equal(seed.catalog.channels.length, 6);
  const first = sqlite.prepare("SELECT starts_at FROM appointments WHERE physician_code = 'KRD-H01' ORDER BY starts_at LIMIT 1").get();
  day = istanbulDay(first.starts_at);
  assert.equal((await post(AGENT, { action: "absence.report", physicianCode: "KRD-H01", day, reason: "sick" })).status, 403, "çağrı görevlisi yokluk bildiremez");
  assert.equal((await post(ORTM, { action: "absence.report", physicianCode: "KRD-H01", day, reason: "sick" })).status, 403, "başka birimin yöneticisi");
  assert.equal((await post(DOC, { action: "absence.report", physicianCode: "KRD-H01", day, reason: "tatil" })).status, 400);
  assert.equal((await post(DOC, { action: "absence.report", physicianCode: "KRD-H01", day: "2020-01-01", reason: "sick" })).status, 400, "geçmiş gün");
  const r = await post(DOC, { action: "absence.report", physicianCode: "KRD-H01", day, reason: "sick" });
  assert.equal(r.status, 201);
  const body = await r.json();
  absence = body.reference;
  assert.equal(body.plan.length, 6);
  const options = body.plan.map((p) => p.option);
  assert.equal(options.filter((o) => o === "clinical_review").length, 1);
  assert.ok(options.includes("substitute_same_day"), "izin veren hastaya aynı gün başka hekim");
  assert.equal((await post(DOC, { action: "absence.report", physicianCode: "KRD-H01", day, reason: "sick" })).status, 409, "aynı güne ikinci kayıt");
  assert.equal(appt("RDV-EGT-100").status, "needs_action");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM patient_notifications").get().n, 0, "onaydan önce hastaya mesaj çıkmaz");
  assert.equal(sqlite.prepare("SELECT status FROM approvals WHERE reference = ?").get(`ONAY-${absence}`).status, "pending");
});

await test("3) onay: bildiren onaylayamaz; birim yöneticisi onaylar; bildirimler ve çağrı görevleri açılır", async () => {
  const self = await decide(DOC, `ONAY-${absence}`, "approve");
  assert.equal(self.status, 403); assert.equal((await self.json()).code, "SELF_APPROVAL_BLOCKED");
  assert.equal((await decide(AGENT, `ONAY-${absence}`, "approve")).status, 403);
  const [a, b] = await Promise.all([decide(MGR, `ONAY-${absence}`, "approve"), decide(MGR, `ONAY-${absence}`, "approve")]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const rows = changes(absence);
  assert.equal(rows.filter((c) => c.status === "offered").length, 5);
  assert.equal(rows.filter((c) => c.status === "review").length, 1);
  const notes = sqlite.prepare("SELECT * FROM patient_notifications").all();
  assert.equal(notes.length, 6, "her etkilenen hastaya bir bildirim");
  for (const n of notes) {
    assert.doesNotMatch(n.body, /(^|\s)(rapor|izin|hastalı)|EGT-HST/i, "neden ve takma ad mesaja yazılmaz");
    assert.ok(n.body.length <= 320);
  }
  assert.equal(notes.find((n) => n.appointment_reference === "RDV-EGT-104").channel, "phone", "iletişim izni olmayan hasta aranır");
  assert.ok(sqlite.prepare("SELECT COUNT(*) AS n FROM operational_tasks WHERE unit_code = 'CAG' AND source_type = 'appointment'").get().n >= 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM operational_tasks WHERE source_type = 'appointment_review'").get().n, 1, "klinik öncelikli hasta için hekim görevi");
});

await test("4) hasta yanıtı: kabul → randevu taşınır; çift yanıt 409; üç kez ulaşılamadı → takip; ret → geri arama görevi", async () => {
  const rows = changes(absence).filter((c) => c.status === "offered" && c.proposed_starts_at);
  const target = rows[0];
  const r = await post(AGENT, { action: "response.record", changeId: target.id, response: "accepted" });
  assert.equal(r.status, 200, await r.clone().text());
  const moved = appt(target.appointment_reference);
  assert.equal(moved.status, "rescheduled"); assert.equal(moved.physician_code, target.proposed_physician_code); assert.equal(moved.starts_at, target.proposed_starts_at);
  assert.equal((await post(AGENT, { action: "response.record", changeId: target.id, response: "accepted" })).status, 409);
  assert.ok(sqlite.prepare("SELECT COUNT(*) AS n FROM patient_notifications WHERE template = 'appointment_confirmed'").get().n === 1);
  const second = rows[1];
  for (let i = 0; i < 3; i++) assert.equal((await post(AGENT, { action: "response.record", changeId: second.id, response: "unreachable" })).status, 200);
  assert.equal(sqlite.prepare("SELECT status, attempts FROM appointment_changes WHERE id = ?").get(second.id).status, "unreachable");
  assert.equal(appt(second.appointment_reference).status, "needs_action");
  const third = rows[2];
  assert.equal((await post(PRIV, { action: "response.record", changeId: third.id, response: "declined" })).status, 403, "gözetim rolü yazamaz");
  assert.equal((await post(ORTM, { action: "response.record", changeId: third.id, response: "declined" })).status, 403, "başka birim");
  assert.equal((await post(MGR, { action: "response.record", changeId: third.id, response: "declined" })).status, 200);
  assert.ok(sqlite.prepare("SELECT reference FROM operational_tasks WHERE reference = ?").get(`ARA-RED-${third.id}`));
});

await test("5) klinik öncelikli randevu: hekim başka hekim ve zaman seçer; çağrı görevlisi karar veremez", async () => {
  const review = changes(absence).find((c) => c.status === "review");
  assert.equal((await post(AGENT, { action: "review.decide", changeId: review.id, physicianCode: "KRD-H02", startsAt: Date.now() + 2 * 86400000 })).status, 403);
  assert.equal((await post(DOC, { action: "review.decide", changeId: review.id, physicianCode: "KRD-H01", startsAt: Date.now() + 2 * 86400000 })).status, 400, "yokluktaki hekim seçilemez");
  assert.equal((await post(DOC, { action: "review.decide", changeId: review.id, physicianCode: "ORT-H01", startsAt: Date.now() + 2 * 86400000 })).status, 400, "başka branş seçilemez");
  assert.equal((await post(DOC, { action: "review.decide", changeId: review.id, physicianCode: "KRD-H02", startsAt: Date.now() + 2 * 86400000 })).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM appointment_changes WHERE id = ?").get(review.id).status, "offered");
});

const sign = (body, eventId, ts = String(Date.now())) => ({ "content-type": "application/json", "x-klinorbis-timestamp": ts, "x-klinorbis-event-id": eventId, "x-klinorbis-signature": createHmac("sha256", SECRET).update(`${ts}.${eventId}.${body}`).digest("hex") });
await test("6) hastanın SMS/WhatsApp yanıtı: imzalı EVET öneriyi kabul eder; sahte imza ve tekrar işlenmez", async () => {
  const waiting = changes(absence).find((c) => c.status === "offered" && c.proposed_starts_at);
  const body = JSON.stringify({ appointmentReference: waiting.appointment_reference, reply: "evet", channel: "sms" });
  const bad = await messages.POST(new Request(`${ORIGIN}/api/integrations/messages`, { method: "POST", headers: { ...sign(body, "evt-msg-0001"), "x-klinorbis-signature": "0".repeat(64) }, body }));
  assert.equal(bad.status, 401);
  const ok = await messages.POST(new Request(`${ORIGIN}/api/integrations/messages`, { method: "POST", headers: sign(body, "evt-msg-0002"), body }));
  assert.equal(ok.status, 202);
  assert.equal(appt(waiting.appointment_reference).status, "rescheduled");
  const again = await messages.POST(new Request(`${ORIGIN}/api/integrations/messages`, { method: "POST", headers: sign(body, "evt-msg-0002"), body }));
  assert.equal((await again.json()).duplicate, true);
  const junk = JSON.stringify({ appointmentReference: waiting.appointment_reference, reply: "belki yarın", channel: "sms" });
  assert.equal((await messages.POST(new Request(`${ORIGIN}/api/integrations/messages`, { method: "POST", headers: sign(junk, "evt-msg-0003"), body: junk }))).status, 422, "serbest metin işlenmez");
});

await test("7) bildirim kuyruğu: sağlayıcı yokken eğitim kaydı simülasyon olur, gerçek kayıt çağrı görevine düşer", async () => {
  sqlite.prepare("INSERT INTO appointments (reference, patient_alias, physician_code, unit_code, facility_code, starts_at, status, consent_channels, source, training, created_at, updated_at) VALUES ('RDV-GERCEK-1', 'HBYS-ALIAS-1', 'KRD-H02', 'KRD', 'F01', ?, 'scheduled', '[\"sms\"]', 'HBYS', 0, ?, ?)").run(Date.now() + 5 * 86400000, Date.now(), Date.now());
  sqlite.prepare("INSERT INTO patient_notifications (reference, appointment_reference, patient_alias, channel, template, body, status, send_after, created_by, created_at) VALUES ('BLG-GERCEK-1', 'RDV-GERCEK-1', 'HBYS-ALIAS-1', 'sms', 'appointment_confirmed', 'Randevunuz onaylandı.', 'queued', ?, 'test', ?)").run(Date.now() - 1000, Date.now());
  sqlite.prepare("UPDATE patient_notifications SET send_after = ? WHERE status = 'held'").run(Date.now() - 1000);
  assert.equal((await post(PRIV, { action: "notifications.dispatch" })).status, 403);
  const r = await (await post(AGENT, { action: "notifications.dispatch" })).json();
  assert.ok(r.simulated >= 1); assert.equal(r.toCall, 1);
  assert.equal(sqlite.prepare("SELECT status FROM patient_notifications WHERE reference = 'BLG-GERCEK-1'").get().status, "call_task");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM patient_notifications WHERE status = 'sent' AND provider != 'simulation'").get().n, 0, "gerçek gönderim iddiası yok");
});

await test("8) talep kaydı: hasta izin verdiyse 'başvurunuz alındı' bildirimi; acil sinyalde mesaj yok", async () => {
  const normal = await tickets.POST(browserJson("/api/tickets", { patientAlias: "HST-WEB-01", subject: "Randevumu iptal etmek istiyorum", channel: "WhatsApp", notifyChannel: "whatsapp" }, OWNER));
  assert.equal(normal.status, 201);
  const nb = await normal.json();
  assert.equal(nb.requestType.code, "cancel"); assert.equal(nb.patientNotified, false); assert.equal(nb.notificationQueued, true);
  assert.ok(sqlite.prepare("SELECT body FROM patient_notifications WHERE ticket_reference = ?").get(nb.ticket.reference).body.includes(nb.ticket.reference));
  const urgent = await tickets.POST(browserJson("/api/tickets", { patientAlias: "HST-WEB-02", subject: "Annemin göğüs ağrısı var randevu lazım", channel: "WhatsApp", notifyChannel: "whatsapp" }, OWNER));
  const ub = await urgent.json();
  assert.equal(ub.patientNotified, false); assert.equal(ub.notificationQueued, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM patient_notifications WHERE ticket_reference = ?").get(ub.ticket.reference).n, 0);
});

await test("9) plan reddi: randevular eski durumuna döner, aynı gün için yeniden bildirilebilir", async () => {
  const d = istanbulDay(sqlite.prepare("SELECT starts_at FROM appointments WHERE physician_code = 'ORT-H01'").get().starts_at);
  const r = await (await post(ORTM, { action: "absence.report", physicianCode: "ORT-H01", day: d, reason: "congress" })).json();
  assert.equal(appt("RDV-EGT-108").status, "needs_action");
  assert.equal((await decide(OWNER, r.approvalReference, "reject")).status, 200);
  assert.equal(appt("RDV-EGT-108").status, "scheduled");
  assert.equal((await post(ORTM, { action: "absence.report", physicianCode: "ORT-H01", day: d, reason: "congress" })).status, 201);
});

await test("10) HBYS takvim aktarımı: imzalı, kimliksiz, D1 sınırına uygun; yokluk akışındaki randevu ezilmez", async () => {
  const start = Date.now() + 3 * 86400000;
  const appts = Array.from({ length: 30 }, (_, i) => ({ reference: `RDV-HBYS-${i}`, patientAlias: `PRT-${i}A`, physicianCode: "KRD-H90", startsAt: start + i * 900000, clinicalPriority:false,consentChannels: ["sms", "fax"], preferredChannel: "sms", contactMasked: "5** *** 12 34" }));
  appts.push({ reference: "RDV-HBYS-BAD", patientAlias: "12345678950", physicianCode: "KRD-H90", startsAt: start });
  appts.push({ reference: "RDV-EGT-100", patientAlias: "EGT-HST-101", physicianCode: "KRD-H90", startsAt: start, clinicalPriority:false,status: "scheduled" });
  const body = JSON.stringify({ physicians: [{ code: "KRD-H90", displayLabel: "Kardiyoloji Hekimi 90", unitCode: "KRD", facilityCode: "F01", dailyCapacity: 30 }, { code: "x", displayLabel: "", unitCode: "ZZZ", facilityCode: "F01" }], appointments: appts });
  const send = (b, id, headers) => schedule.POST(new Request(`${ORIGIN}/api/integrations/schedule`, { method: "POST", headers: headers ?? sign(b, id), body: b }));
  assert.equal((await send(body, "evt-hbys-0001", { ...sign(body, "evt-hbys-0001"), "x-klinorbis-signature": "f".repeat(64) })).status, 401);
  const before = appt("RDV-EGT-100");
  const r = await send(body, "evt-hbys-0002");
  assert.equal(r.status, 202, await r.clone().text());
  const out = await r.json();
  assert.equal(out.physicians, 1); assert.equal(out.appointments, 31);
  assert.equal(out.rejected.length, 2, "geçersiz hekim ve TCKN içeren takma ad reddedilir");
  const row = sqlite.prepare("SELECT training, consent_channels, source FROM appointments WHERE reference = 'RDV-HBYS-3'").get();
  assert.equal(row.training, 0); assert.equal(row.consent_channels, '["sms"]', "tanımsız kanal atılır"); assert.equal(row.source, "HBYS");
  const after = appt("RDV-EGT-100");
  assert.equal(after.status, before.status, "yokluk akışındaki randevunun durumu korunur");
  assert.equal(after.starts_at, before.starts_at);
  assert.equal((await (await send(body, "evt-hbys-0002")).json()).duplicate, true);
});

await test("saat kilidi: aynı saatte randevusu olan hekime 'aynı gün başka hekim' önerilmez; DB aynı saate iki öneriyi reddeder", () => {
  const base = Date.parse("2026-10-07T06:00:00Z");
  const physician = { code: "A", displayLabel: "A", unitCode: "KRD", facilityCode: "F01", dailyCapacity: 6, active: true };
  const peer = { ...physician, code: "B" };
  const mk = (r, doc, i, extra = {}) => ({ reference: r, patientAlias: "X", physicianCode: doc, unitCode: "KRD", facilityCode: "F01", startsAt: base + i * 1800000, status: "scheduled", clinicalPriority: false, allowOtherPhysician: true, preferredChannel: "sms", consentChannels: ["sms"], ...extra });
  const plan = lib.planAbsence({ physician, day: "2026-10-07", physicians: [physician, peer], booked: {}, appointments: [mk("a1", "A", 0), mk("a2", "A", 1), mk("b1", "B", 0)] });
  assert.equal(plan[0].option, "same_physician_later", "B 09:00'da dolu: aynı saate önerilmez");
  assert.equal(plan[1].option, "substitute_same_day", "B 09:30'da boş");
  // Başka planın ayırdığı saat de dolu sayılır.
  const reserved = lib.planAbsence({ physician, day: "2026-10-07", physicians: [physician, peer], booked: {}, appointments: [mk("a2", "A", 1)], reservedSlots: [{ physicianCode: "B", startsAt: base + 1800000 }] });
  assert.notEqual(reserved[0].option, "substitute_same_day");
  // Veritabanı kilidi: aynı hekim + saat için iki etkin öneri yazılamaz.
  const ins = sqlite.prepare("INSERT INTO appointment_changes (absence_reference, appointment_reference, option, proposed_physician_code, proposed_starts_at, reason, status, updated_at) VALUES (?, ?, 'substitute_same_day', 'KRD-H09', 1893456000000, 'test', 'offered', 0)");
  ins.run("YOK-T1", "RDV-T1");
  assert.throws(() => ins.run("YOK-T2", "RDV-T2"), /UNIQUE/);
});

await test("tek işlem: hasta yanıtı aynı anda iki kanaldan gelirse yalnız biri işlenir, kayıtlar yarım kalmaz", async () => {
  const offered = changes(absence).find((c) => c.status === "offered" && c.proposed_starts_at);
  assert.ok(offered, "yanıt bekleyen öneri olmalı");
  const before = sqlite.prepare("SELECT COUNT(*) n FROM patient_notifications").get().n;
  const [x, y] = await Promise.all([post(AGENT, { action: "response.record", changeId: offered.id, response: "accepted" }), post(MGR, { action: "response.record", changeId: offered.id, response: "cancelled" })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM patient_notifications").get().n, before + 1, "tek bildirim");
  const st = sqlite.prepare("SELECT status FROM appointment_changes WHERE id = ?").get(offered.id).status;
  assert.equal(appt(offered.appointment_reference).status, st === "accepted" ? "rescheduled" : "cancelled", "öneri ve randevu birbiriyle tutarlı");
});

await test("onay tek işlem: yokluk onayı sırasında hata olursa onay da geri alınır (bildirim, görev ve onay birlikte)", async () => {
  // Hekim 2'ye yeni gün için yokluk bildir; onay batch'ini bozmak için kilit satırını önceden yaz.
  const r = await post(DOC, { action: "absence.report", physicianCode: "KRD-H02", day, reason: "sick" });
  assert.equal(r.status, 201, await r.clone().text());
  const ref2 = (await r.json()).reference;
  const pending = sqlite.prepare("SELECT status FROM approvals WHERE reference = ?").get(`ONAY-${ref2}`);
  assert.equal(pending.status, "pending", "planlanacak randevu olmalı");
  sqlite.prepare("INSERT INTO integration_events (event_id, source, event_type, payload_hash, status, received_at) VALUES (?, 'test', 'lock', '-', 'lock', 0)").run(`absence-decision:${ref2}`);
  const notesBefore = sqlite.prepare("SELECT COUNT(*) n FROM patient_notifications").get().n;
  const res = await decide(MGR, `ONAY-${ref2}`, "approve");
  assert.equal(res.status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM approvals WHERE reference = ?").get(`ONAY-${ref2}`).status, "pending", "onay geri alındı");
  assert.equal(sqlite.prepare("SELECT status FROM physician_absences WHERE reference = ?").get(ref2).status, "planned");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM patient_notifications").get().n, notesBefore, "yarım bildirim yok");
});
