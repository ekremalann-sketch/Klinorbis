// K14: menüde yalnız B listesindeki ekranlar; yeni iş rolleri (temizlik, taşıma, sorumlu hemşire, acil sekreteri).
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

const m = await loadRoute("lib/b-menu.ts");
const B_LABELS = ["Bugün", "Yatak panosu", "Temizlik işlerim", "Temizlik kontrolü", "Taşıma işlerim", "Taşıma dağıtım", "Transfer talepleri", "Arıza ve cihazlar", "Operasyon devri", "Komuta ekranı", "Raporlar", "Ayarlar"];
const ROLES = ["operations_manager", "unit_manager", "clinician", "call_agent", "unit_staff", "privacy_officer", "security_officer"];
const REMOVED = ["requests", "appointments", "access", "calls", "playbooks", "simulation", "flow", "inbox", "units"];
const TECHNICAL = ["integrations", "security", "automation", "audit", "privacy"];

test("B listesi tam 12 ekran", () => {
  assert.deepEqual(Object.values(m.B_SCREENS).map((s) => s.label), B_LABELS);
});

test("her rolün menüsü yalnız B ekranlarından oluşur; ürün dışı ve teknik ekranlar günlük rollerde yok", async () => {
  const src = await readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
  const views = [...src.slice(src.indexOf("const nav:"), src.indexOf("function NavigationIcon")).matchAll(/view: "([a-z]+)"/g)].map((x) => x[1]);
  for (const role of ROLES) {
    const menu = m.bMenu(role, []);
    assert.ok(menu.length >= 1 && menu.length <= 8, `${role}: ${menu.length}`);
    for (const item of menu) {
      assert.ok(B_LABELS.includes(item.label), `${role}: ${item.label}`);
      if (item.view) assert.ok(views.includes(item.view), `${role}: ${item.view} tanımlı`);
      assert.ok(!REMOVED.includes(item.view), `${role}: ${item.view} ürün dışı`);
    }
    if (!["operations_manager", "privacy_officer", "security_officer"].includes(role)) {
      for (const item of menu) assert.ok(!TECHNICAL.includes(item.view), `${role}: ${item.view} teknik`);
      assert.equal(m.SETTINGS_LINKS[role], undefined);
    }
  }
  assert.equal(m.bMenu("operations_manager")[0].label, "Komuta ekranı");
  assert.equal(m.bMenu("clinician")[0].label, "Bugün");
  // Menü bu tek kaynaktan çiziliyor; eski "Diğer ekranlar" anahtarı kalmadı.
  assert.match(src, /bMenu\(menuRole, previewRole \? \[\] : snapshot\.identity\.unitRoles\)/);
  assert.doesNotMatch(src, /Diğer ekranlar|sidebar-sim-links/);
});

test("yeni iş rolleri birim rolünden tanınır ve kendi menüsünü görür", () => {
  assert.equal(m.jobRoleOf(["Temizlik Personeli"]), "temizlik");
  assert.equal(m.jobRoleOf(["Hasta taşıyıcı"]), "tasima");
  assert.equal(m.jobRoleOf(["Sorumlu Hemşire"]), "sorumlu_hemsire");
  assert.equal(m.jobRoleOf(["Acil sekreteri"]), "acil_sekreteri");
  assert.equal(m.jobRoleOf(["Randevu Operatörü"]), null);
  assert.deepEqual(m.bMenu("unit_staff", ["Temizlik personeli"]).map((s) => s.label), ["Temizlik işlerim", "Bugün"]);
  assert.deepEqual(m.bMenu("unit_staff", ["Taşıma personeli"]).map((s) => s.label), ["Taşıma işlerim", "Bugün"]);
  assert.ok(m.bMenu("unit_manager", ["Sorumlu hemşire"]).some((s) => s.label === "Temizlik kontrolü"));
  assert.deepEqual(m.bMenu("call_agent", ["Acil sekreteri"]).map((s) => s.label), ["Bugün", "Yatak panosu", "Transfer talepleri"]);
  // Yönetici iş rolüyle daraltılmaz.
  assert.equal(m.bMenu("operations_manager", ["Temizlik personeli"])[0].label, "Komuta ekranı");
});

test("çalışma alanı kimliği birim rollerini taşır; 'Klinik Rol' adı yok", async () => {
  const { d1, sqlite } = await createD1();
  setRuntime(d1, { ownerEmail: "ops@klinorbis.test" });
  sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES ('tm@klinorbis.test','Temizlik','call_agent',1,?)").run(Date.now());
  sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES ('tm@klinorbis.test','HIL','Temizlik personeli',1,0,1)").run();
  const route = await loadRoute("app/api/workspace/route.ts");
  const body = await (await route.GET(new Request(`${ORIGIN}/api/workspace`, { headers: { "oai-authenticated-user-email": "tm@klinorbis.test" } }))).json();
  assert.deepEqual(body.identity.unitRoles, ["Temizlik personeli"]);
  for (const f of ["app/dashboard.tsx", "lib/role-map.ts"]) assert.doesNotMatch(await readFile(new URL(`../${f}`, import.meta.url), "utf8"), /Klinik Rol/);
});

test("personel formunda yeni iş rolleri seçilebilir ve birim rolü olarak kaydedilir", async () => {
  const src = await readFile(new URL("../app/staff-management.tsx", import.meta.url), "utf8");
  assert.match(src, /Object\.values\(JOB_ROLES\)\.map/);
  assert.match(src, /unitRole: form\.jobRole/);
  const staff = await loadRoute("lib/staff.ts");
  assert.equal(typeof staff, "object");
});
