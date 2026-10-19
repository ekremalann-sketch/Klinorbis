// Çekirdek sunucusu: vekil imzası olmadan erişim yok, yetkisiz rol entegrasyonu göremez, CSRF koruması, başka kurumun
// yatağına işlem yapılamaz, imzalı köprü mesajı ACK alır, imzasız mesaj reddedilir, sayfalar güvenlik başlıklarıyla gelir.
import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createCoreServer } from "../src/server/app.ts";
import { signProxyHeaders } from "../src/server/auth.ts";
import { sign } from "../src/bridge/signer.ts";
import { adt } from "../src/bridge/fake-hbys.ts";
import { provisionTenantKeys } from "../src/keys.ts";
import { freshDb, seedTenant } from "./helpers.ts";
import { testKek } from "./fixtures.ts";

const SECRET = "test-proxy-secret-only";
const db = await freshDb();
const A = await seedTenant(db, "SRV-A"), B = await seedTenant(db, "SRV-B");
await A.staff("ops.a", "operations_manager", []); await A.staff("tmz.a", "staff", [A.units.ctm]); await B.staff("ops.b", "operations_manager", []); await A.staff("cag.a", "call_agent", []);
const kek = testKek();
const rings = new Map([[A.tenantId, await provisionTenantKeys(db, A.tenantId, kek)], [B.tenantId, await provisionTenantKeys(db, B.tenantId, kek)]]);
const server = createCoreServer({ db, proxySecret: SECRET, keyrings: async (t) => rings.get(t)!, bridgeClients: { "kopru-a1": { secret: "bridge-secret-test", tenantId: A.tenantId } } });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const as = (tenant: string, sub: string) => signProxyHeaders(SECRET, tenant, sub);
const post = (path: string, headers: Record<string, string>, body: unknown, extra: Record<string, string> = { "x-kb-request": "1" }) =>
  fetch(base + path, { method: "POST", headers: { ...headers, ...extra, "content-type": "application/json" }, body: JSON.stringify(body) });

test("kimlik: imzasız, sahte veya eski imza reddedilir; personel kaydı olmayan 403", async () => {
  assert.equal((await fetch(base + "/api/beds")).status, 401);
  assert.equal((await fetch(base + "/api/beds", { headers: { ...as("SRV-A", "ops.a"), "x-kb-signature": "0".repeat(64) } })).status, 401);
  assert.equal((await fetch(base + "/api/beds", { headers: signProxyHeaders(SECRET, "SRV-A", "ops.a", Date.now() - 10 * 60_000) })).status, 401);
  assert.equal((await fetch(base + "/api/beds", { headers: as("SRV-A", "yabanci") })).status, 403);
  assert.equal((await fetch(base + "/saglik")).status, 200);
});

test("yetki: temizlik görevlisi entegrasyon merkezini, çağrı görevlisi yatak engelini kullanamaz", async () => {
  assert.equal((await fetch(base + "/api/integration", { headers: as("SRV-A", "tmz.a") })).status, 403);
  assert.equal((await fetch(base + "/api/integration", { headers: as("SRV-A", "ops.a") })).status, 200);
  assert.equal((await post(`/api/beds/${A.bedId}/block`, as("SRV-A", "cag.a"), { reason: "teknik" })).status, 403);
});

test("CSRF: özel başlık olmadan veya başka kökenden işlem yapılamaz", async () => {
  assert.equal((await post(`/api/beds/${A.bedId}/block`, as("SRV-A", "ops.a"), { reason: "teknik" }, {})).status, 403);
  assert.equal((await post(`/api/beds/${A.bedId}/block`, as("SRV-A", "ops.a"), { reason: "teknik" }, { "x-kb-request": "1", origin: "https://kotu.example" })).status, 403);
});

test("kurum ayrımı: B kurumu A'nın yatağına işlem yapamaz ve göremez", async () => {
  assert.equal((await post(`/api/beds/${A.bedId}/block`, as("SRV-B", "ops.b"), { reason: "teknik" })).status, 404);
  const beds = await (await fetch(base + "/api/beds", { headers: as("SRV-B", "ops.b") })).json() as { beds: { id: string }[] };
  assert.ok(!beds.beds.some((b) => b.id === A.bedId));
  const ok = await post(`/api/beds/${A.bedId}/block`, as("SRV-A", "ops.a"), { reason: "personel", note: "Gece vardiyası eksik (kurgusal)" });
  assert.equal(ok.status, 200);
  assert.equal((await post(`/api/beds/${A.bedId}/block`, as("SRV-A", "ops.a"), { reason: "teknik" })).status, 409, "ikinci engel çakışma");
});

test("köprü: imzalı ADT mesajı ACK AA; imzasız AR; tekrar mesaj yeniden işlenmez", async () => {
  const body = adt("A01", { n: 4, visit: "V-44", unit: "DHL", room: "312", bed: "312-A" }, "SRV-0001");
  const env = sign("bridge-secret-test", "kopru-a1", body);
  const h = { "content-type": "application/hl7-v2", "x-kb-key-id": env.keyId, "x-kb-timestamp": env.timestamp, "x-kb-nonce": env.nonce, "x-kb-signature": env.signature };
  const r = await fetch(base + "/bridge/adt", { method: "POST", headers: h, body });
  assert.equal(r.status, 200); assert.match(await r.text(), /MSA\|AA\|SRV-0001/);
  assert.equal((await fetch(base + "/bridge/adt", { method: "POST", headers: h, body })).status, 401, "aynı imza ikinci kez kullanılamaz");
  const env2 = sign("bridge-secret-test", "kopru-a1", body);
  const again = await fetch(base + "/bridge/adt", { method: "POST", headers: { ...h, "x-kb-timestamp": env2.timestamp, "x-kb-nonce": env2.nonce, "x-kb-signature": env2.signature }, body });
  assert.match(await again.text(), /duplicate/);
  assert.equal((await fetch(base + "/bridge/adt", { method: "POST", headers: { "content-type": "application/hl7-v2" }, body })).status, 401);
});

test("sayfa: güvenlik başlıkları ve nonce'lu CSP; menüde yetkisiz ekran yok", async () => {
  const r = await fetch(base + "/yatak", { headers: as("SRV-A", "tmz.a") });
  assert.equal(r.status, 200);
  const csp = r.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self' 'nonce-/); assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  const html = await r.text();
  assert.ok(!html.includes("/entegrasyon\""), "temizlik görevlisine entegrasyon menüsü gösterilmez");
});

test.after(async () => { server.close(); await db.close(); });
