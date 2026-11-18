// Kolay kullanım kuralları: rol menüsü her rolün işini kapsar; çalışma alanı kişinin kendi e-postasını döndürür
// ("Benim üstlendiklerim" filtresi için) ve başkasınınkini döndürmez.
import assert from "node:assert/strict";
import test from "node:test";
import { createD1, loadRoute, ORIGIN, setRuntime } from "./helpers/route-harness.mjs";

// K14: eski 22 maddelik rol menüsü testi kaldırıldı; yerine tests/k14-b-menu.test.mjs B listesindeki 12 ekranı sınar.

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
