// Kolay kullanım kuralları: rol menüsü her rolün işini kapsar; çalışma alanı kişinin kendi e-postasını döndürür
// ("Benim üstlendiklerim" filtresi için) ve başkasınınkini döndürmez.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

test("rol menüsü: her rol Personel ve Yetki'yi (Benim işim) ve ana ekranını görür; tanımsız ekran yok", async () => {
  const src = await readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
  const views = [...src.slice(src.indexOf("const nav:"), src.indexOf("const ROLE_VIEWS")).matchAll(/view: "([a-z]+)"/g)].map((m) => m[1]);
  const block = src.slice(src.indexOf("const ROLE_VIEWS"), src.indexOf("const NAV_GROUP_OF"));
  const roles = [...block.matchAll(/(\w+): \[([^\]]+)\]/g)].map((m) => [m[1], [...m[2].matchAll(/"([a-z]+)"/g)].map((x) => x[1])]);
  assert.equal(roles.length, 7);
  const homes = { operations_manager: "dashboard", unit_manager: "myunit", clinician: "mywork", call_agent: "calls", privacy_officer: "privacy", security_officer: "security", unit_staff: "mywork" };
  for (const [role, list] of roles) {
    assert.ok(list.includes("staff"), `${role}: Personel ve Yetki`);
    assert.equal(list[0], homes[role], `${role}: ana ekran ${homes[role]}`);
    for (const v of list) assert.ok(views.includes(v), `${role}: ${v} menüde var`);
  }
  assert.match(src, /Diğer ekranlar/);
  // Teknik/entegrasyon ekranları günlük iş rollerinin menüsünde (Diğer dahil) yer almaz.
  for (const role of ["unit_manager", "clinician", "call_agent", "unit_staff"]) {
    const list = roles.find(([r]) => r === role)[1];
    for (const v of ["integrations", "security", "automation", "audit"]) assert.ok(!list.includes(v), `${role}: ${v} menüde olmamalı`);
  }
  assert.match(src, /TECHNICAL_VIEWS: View\[\] = \["integrations", "security", "automation", "audit", "privacy"\]/);
});

test("çalışma alanı kimliği kendi e-postasını içerir", async () => {
  const { d1, sqlite } = await createD1();
  setRuntime(d1, { ownerEmail: "ops@klinorbis.test" });
  sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES ('agent@klinorbis.test','Çağrı','call_agent',1,?)").run(Date.now());
  sqlite.prepare("INSERT INTO unit_memberships (email, unit_code, unit_role, can_manage_tickets, can_read_calls, active) VALUES ('agent@klinorbis.test','CAG','Test',1,1,1)").run();
  const route = await loadRoute("app/api/workspace/route.ts");
  const r = await route.GET(new Request(`${ORIGIN}/api/workspace`, { headers: { "oai-authenticated-user-email": "agent@klinorbis.test" } }));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.identity.email, "agent@klinorbis.test");
  assert.equal(body.identity.role, "call_agent");
  assert.ok(!JSON.stringify(body.staff ?? []).includes("ops@klinorbis.test"));
});
