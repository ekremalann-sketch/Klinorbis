// Kullanılabilirlik fazı davranış testleri: İşlerim (kabul → başla → tamamla), sahiplik yarışı, temizlik bağımsız kontrolü,
// devir, vardiya/yeniden görevlendirme onayı, arıza bildirimi ve kullanıcı kabulü, rol ekranlarının sunucu yetkisi.
// Gerçek rota kodu, bellek içi SQLite, yalnız kurgusal hesaplar.
import assert from "node:assert/strict";
import test from "node:test";
import { browserJson, createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const OWNER = "ops@kurgu.test";
const { d1, sqlite } = await createD1();
setRuntime(d1, { ownerEmail: OWNER, demoEnabled: "0" });
const now = Date.now();
const A = "ctm.a@kurgu.test", B = "ctm.b@kurgu.test", M = "ctm.sorumlu@kurgu.test", Y = "ytk.gorevli@kurgu.test", K = "kvkk@kurgu.test", S = "servis.hemsire@kurgu.test";
const staff = sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES (?, ?, ?, 1, ?)");
const member = sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES (?, ?, 'Kurgu', 1, 1, 1)");
for (const [email, label, role, unit] of [[A, "Görevli A", "call_agent", "CTM"], [B, "Görevli B", "call_agent", "CTM"], [M, "Sorumlu M", "unit_manager", "CTM"], [Y, "Görevli Y", "call_agent", "YTK"], [K, "KVKK", "privacy_officer", "KVT"], [S, "Hemşire S", "clinician", "DAH"]]) { staff.run(email, label, role, now); member.run(email, unit); }

const [playbooks, myWork, myUnit, focus, workload] = await Promise.all(["app/api/playbooks/route.ts", "app/api/my-work/route.ts", "app/api/my-unit/route.ts", "app/api/operations-focus/route.ts", "app/api/workload/route.ts"].map(loadRoute));
const pb = (email, body) => playbooks.POST(browserJson("/api/playbooks", body, email));
const mw = (email, body) => myWork.POST(browserJson("/api/my-work", body, email));
const wl = (email, body) => workload.POST(browserJson("/api/workload", body, email));
const getJson = async (route, path, email) => { const r = await route.GET(new Request(`${ORIGIN}${path}`, { headers: { "oai-authenticated-user-email": email } })); return { status: r.status, body: await r.json() }; };
const task = (ref) => sqlite.prepare("SELECT status, assigned_user, title, location FROM operational_tasks WHERE reference = ?").get(ref);
const run = (ref) => sqlite.prepare("SELECT status, current_step, version FROM playbook_runs WHERE reference = ?").get(ref);

/** yatak-hazirlik başlatır ve TBR adımını geçirir → temizlik işi CTM kuyruğunda. */
async function cleaningTask(location = "312-B") {
  const r = await pb(OWNER, { action: "start", code: "yatak-hazirlik", fields: { location } });
  assert.equal(r.status, 201);
  const ref = (await r.json()).reference;
  assert.equal((await pb(OWNER, { action: "step.complete", reference: ref, version: 1 })).status, 200);
  return { ref, taskRef: `TSK-${ref}-2` };
}

let flow;
await test("iş kartı: başlık ve konum görevle birlikte kaydedilir; personel İşlerim'de alınabilir iş olarak görür", async () => {
  flow = await cleaningTask();
  assert.equal(task(flow.taskRef).title, "Oda temizliği ve dezenfeksiyon");
  assert.equal(task(flow.taskRef).location, "312-B");
  const { status, body } = await getJson(myWork, "/api/my-work", A);
  assert.equal(status, 200);
  const card = body.available.find((t) => t.reference === flow.taskRef);
  assert.equal(card.action, "accept"); assert.equal(card.actionLabel, "Kabul et");
  assert.match(card.nextStep, /Teknik/);
});

await test("sahiplik yarışı: aynı anda iki kabulden yalnız biri kazanır; kaybeden kimin aldığını görür", async () => {
  const [r1, r2] = await Promise.all([mw(A, { action: "accept", reference: flow.taskRef }), mw(B, { action: "accept", reference: flow.taskRef })]);
  const codes = [r1.status, r2.status].sort();
  assert.deepEqual(codes, [200, 409]);
  const loser = r1.status === 409 ? await r1.json() : await r2.json();
  assert.equal(loser.code, "TASK_TAKEN");
  const owner = task(flow.taskRef).assigned_user;
  assert.ok([A, B].includes(owner));
  if (owner === B) { // Testin geri kalanı A'yı sahip kabul eder.
    sqlite.prepare("UPDATE operational_tasks SET assigned_user = ? WHERE reference = ?").run(A, flow.taskRef);
  }
});

await test("başkasının işi: başlatamaz, tamamlayamaz, engel/devir öneremez; başka birim ve gözetim rolü dokunamaz", async () => {
  assert.equal((await mw(B, { action: "start", reference: flow.taskRef })).status, 409);
  assert.equal((await mw(B, { action: "complete", reference: flow.taskRef })).status, 403);
  assert.equal((await mw(B, { action: "block", reference: flow.taskRef, reason: "Denemedir engel" })).status, 403);
  assert.equal((await mw(B, { action: "handoff", reference: flow.taskRef, email: B })).status, 403);
  assert.equal((await mw(Y, { action: "accept", reference: flow.taskRef })).status, 403, "başka birim");
  assert.equal((await mw(K, { action: "accept", reference: flow.taskRef })).status, 403, "gözetim rolü yazamaz");
  const b = (await getJson(myWork, "/api/my-work", B)).body;
  assert.ok(!b.available.some((t) => t.reference === flow.taskRef), "başkasının işi alınabilir listede değil");
  const a = (await getJson(myWork, "/api/my-work", A)).body;
  assert.equal(a.mine.find((t) => t.reference === flow.taskRef).action, "start");
});

await test("temizlik: tamamla → bağımsız kontrol; temizleyen kontrol edemez; geçmezse gerekçeli yeniden temizlik açılır", async () => {
  assert.equal((await mw(A, { action: "complete", reference: flow.taskRef })).status, 200, "kabul edilmiş iş doğrudan tamamlanabilir");
  assert.equal(task(flow.taskRef).status, "completed");
  assert.equal(run(flow.ref).current_step, 1, "akış kontrol olmadan ilerlemez");
  const ins = sqlite.prepare("SELECT inspection_task_reference AS r FROM cleaning_inspections WHERE run_reference = ? AND status = 'pending'").get(flow.ref).r;
  const self = await mw(A, { action: "inspect", reference: ins, pass: true });
  assert.equal(self.status, 403);
  assert.equal((await mw(B, { action: "inspect", reference: ins, pass: true })).status, 403, "görevli rolü kontrol yapamaz");
  assert.equal((await mw(M, { action: "inspect", reference: ins, pass: false, reason: "x" })).status, 400, "gerekçe zorunlu");
  const fail = await mw(M, { action: "inspect", reference: ins, pass: false, reason: "Banyo dezenfekte edilmemiş" });
  assert.equal(fail.status, 200);
  const rework = (await fail.json()).result.rework;
  assert.equal(task(rework).status, "queued");
  assert.match(task(rework).title, /Yeniden temizlik/);
  assert.equal(run(flow.ref).current_step, 1);
  assert.equal((await mw(M, { action: "inspect", reference: ins, pass: true })).status, 409, "sonuçlanan kontrol tekrar verilemez");
  // Yeniden temizliği B yapar; kontrolden geçince akış teknik kontrole ilerler.
  for (const action of ["accept", "start", "complete"]) assert.equal((await mw(B, { action, reference: rework })).status, 200, action);
  const ins2 = sqlite.prepare("SELECT inspection_task_reference AS r, cleaned_by FROM cleaning_inspections WHERE run_reference = ? AND status = 'pending'").get(flow.ref);
  assert.equal(ins2.cleaned_by, B);
  const [p1, p2] = await Promise.all([mw(M, { action: "inspect", reference: ins2.r, pass: true }), mw(OWNER, { action: "inspect", reference: ins2.r, pass: true })]);
  assert.deepEqual([p1.status, p2.status].sort(), [200, 409], "çift kontrol: yalnız biri işlenir");
  assert.equal(run(flow.ref).current_step, 2);
  assert.equal(task(`TSK-${flow.ref}-3`).status, "queued", "teknik kontrol işi açıldı");
});

await test("devir: kabul edilene kadar eski sahip sorumlu; yalnız aynı birimin üyesine önerilir", async () => {
  const f = await cleaningTask("214-A");
  assert.equal((await mw(A, { action: "accept", reference: f.taskRef })).status, 200);
  assert.equal((await mw(A, { action: "handoff", reference: f.taskRef, email: Y })).status, 400, "başka birim");
  assert.equal((await mw(A, { action: "handoff", reference: f.taskRef, email: B, note: "Mola" })).status, 200);
  assert.equal((await mw(A, { action: "handoff", reference: f.taskRef, email: B })).status, 409, "bekleyen öneri tek");
  assert.equal(task(f.taskRef).assigned_user, A, "öneri sahipliği değiştirmez");
  const h = (await getJson(myWork, "/api/my-work", B)).body.handoffs[0];
  assert.equal((await mw(M, { action: "handoff.decide", id: h.id, accept: true })).status, 404, "yalnız önerilen kişi yanıtlar");
  assert.equal((await mw(B, { action: "handoff.decide", id: h.id, accept: true })).status, 200);
  assert.equal(task(f.taskRef).assigned_user, B);
  assert.equal((await mw(A, { action: "start", reference: f.taskRef })).status, 409, "eski sahip artık başlatamaz");
});

await test("görevlendirme: vardiya dışı kişiye ve başkasının işine sessiz atama yok; açık onayla yapılır", async () => {
  const f = await cleaningTask("118-C");
  sqlite.prepare("INSERT INTO staff_shifts (reference, staff_label, facility_code, unit_code, role, shift_code, status, staff_email, training, started_at, ends_at, updated_at) VALUES ('VRD-K1','Görevli A','KRG','CTM','Temizlik','gunduz','active',?,1,?,?,?)").run(A, now - 10 * 3_600_000, now - 3_600_000, now);
  assert.equal((await wl(B, { action: "assign", reference: f.taskRef, email: A })).status, 403, "görevli atayamaz");
  const off = await wl(M, { action: "assign", reference: f.taskRef, email: A });
  assert.equal(off.status, 409); assert.equal((await off.json()).code, "OFF_SHIFT");
  assert.equal(task(f.taskRef).assigned_user, null);
  assert.equal((await wl(M, { action: "assign", reference: f.taskRef, email: A, confirmOffShift: true })).status, 200);
  assert.equal(task(f.taskRef).assigned_user, A);
  const re = await wl(M, { action: "assign", reference: f.taskRef, email: B });
  assert.equal(re.status, 409); assert.equal((await re.json()).code, "REASSIGN_CONFIRM");
  assert.equal((await wl(M, { action: "assign", reference: f.taskRef, email: B, confirmReassign: true })).status, 200);
  assert.equal(task(f.taskRef).assigned_user, B); assert.equal(task(f.taskRef).status, "queued", "yeni kişi kendisi kabul eder");
  const people = (await getJson(myUnit, "/api/my-unit", M)).body.people;
  assert.equal(people.find((p) => p.email === A).shift, "vardiya_disi");
});

await test("arıza: tür seçmek yeterli, doğru teknik birime gider; bitiş ile bildirenin kabulü ayrı izlenir", async () => {
  assert.equal((await mw(K, { action: "fault.report", category: "cihaz" })).status, 403, "gözetim rolü açamaz");
  assert.equal((await mw(S, { action: "fault.report" })).status, 400, "tür zorunlu");
  const r = await mw(S, { action: "fault.report", category: "cihaz", location: "Dahiliye 4-12", note: "Alarm veriyor, ara 0532 111 22 33" });
  assert.equal(r.status, 200);
  const { reference, runReference, routedTo } = (await r.json()).result;
  assert.match(routedTo, /Biyomedikal/i);
  assert.equal(task(`TSK-${runReference}-1`).location, "Dahiliye 4-12");
  assert.match(sqlite.prepare("SELECT note FROM playbook_runs WHERE reference = ?").get(runReference).note, /PHONE_MASKED/);
  assert.equal((await mw(S, { action: "fault.confirm", reference, resolved: true })).status, 409, "iş bitmeden kabul yok");
  for (let i = 0; i < 5; i++) { const v = run(runReference).version; assert.equal((await pb(OWNER, { action: "step.complete", reference: runReference, version: v })).status, 200, `adım ${i + 1}`); }
  assert.equal(sqlite.prepare("SELECT status FROM fault_reports WHERE reference = ?").get(reference).status, "awaiting_confirmation");
  assert.equal((await mw(A, { action: "fault.confirm", reference, resolved: true })).status, 404, "başkası onaylayamaz");
  const again = await mw(S, { action: "fault.confirm", reference, resolved: false, note: "Alarm sürüyor" });
  assert.equal(again.status, 200);
  const row = sqlite.prepare("SELECT status, reopened_run_reference AS r FROM fault_reports WHERE reference = ?").get(reference);
  assert.equal(row.status, "reopened");
  assert.equal(run(row.r).status, "active");
  assert.equal(sqlite.prepare("SELECT parent_reference AS p FROM playbook_runs WHERE reference = ?").get(row.r).p, runReference);
});

await test("rol ekranları sunucuda korunur: Operasyon yalnız operasyon yöneticisi, Birimim yalnız sorumlular; birim sızıntısı yok", async () => {
  assert.equal((await getJson(focus, "/api/operations-focus", OWNER)).status, 200);
  assert.equal((await getJson(focus, "/api/operations-focus", M)).status, 403);
  assert.equal((await getJson(focus, "/api/operations-focus", A)).status, 403);
  assert.equal((await getJson(myUnit, "/api/my-unit", A)).status, 403);
  const own = await getJson(myUnit, "/api/my-unit?birim=YTK", M);
  assert.equal(own.status, 200); assert.equal(own.body.selected.code, "CTM", "başka birim istenirse kendi birimi döner");
  const all = Object.values(own.body.groups).flat();
  assert.ok(all.every((t) => t.unitCode === "CTM"));
  const y = (await getJson(myWork, "/api/my-work", Y)).body;
  assert.ok([...y.mine, ...y.available].every((t) => t.unitCode === "YTK" || t.owner?.mine), "personel yalnız kendi birimini görür");
  const f = (await getJson(focus, "/api/operations-focus", OWNER)).body;
  assert.ok(f.beds && Array.isArray(f.items) && /HBYS bağlı değilse|kurgusal/i.test(f.beds.source), "kaynak açıkça yazılır");
});
