// Kripto ve kasa: AES-GCM bütünlüğü ve bağlam bağlılığı, kör indeks, takma ad, TCKN biçim kontrolü, kasa kaydı/geri dönüş.
import assert from "node:assert/strict";
import test from "node:test";
import { blindIndex, open, pseudonymToken, seal, validNationalId } from "../src/crypto.ts";
import { withContext } from "../src/db.ts";
import { maskIdentity, registerIdentity, reidentify } from "../src/vault.ts";
import { freshDb, seedTenant } from "./helpers.ts";
import { FICTIONAL, syntheticNationalId, testKek } from "./fixtures.ts";
import { provisionTenantKeys } from "../src/keys.ts";

test("AES-256-GCM: doğru bağlamda açılır; başka bağlamda veya bozulunca açılmaz", () => {
  const key = Buffer.alloc(32, 7);
  const s = seal(key, Buffer.from("gizli"), Buffer.from("kurum-a|identity|P-1"));
  assert.equal(open(key, s, Buffer.from("kurum-a|identity|P-1")).toString(), "gizli");
  assert.throws(() => open(key, s, Buffer.from("kurum-b|identity|P-1")));
  const bad = Buffer.from(s); bad[bad.length - 1] ^= 1;
  assert.throws(() => open(key, bad, Buffer.from("kurum-a|identity|P-1")));
});

test("KEK zarfı: veri anahtarı sarılır ve açılır", async () => {
  const kek = testKek(); const dek = Buffer.alloc(32, 3);
  const { wrapped, kekRef } = await kek.wrap(dek);
  assert.notDeepEqual(wrapped.subarray(28), dek);
  assert.deepEqual(await kek.unwrap(wrapped, kekRef), dek);
});

test("TCKN biçimi ve sentetik numaralar; kör indeks ve belirteç kuruma özgü", () => {
  assert.equal(validNationalId("12345678901"), false);
  assert.equal(validNationalId(syntheticNationalId(42)), true);
  const k = Buffer.alloc(32, 1), n = syntheticNationalId(42);
  assert.equal(blindIndex(k, "A", n), blindIndex(k, "A", n));
  assert.notEqual(blindIndex(k, "A", n), blindIndex(k, "B", n));
  assert.match(pseudonymToken(k, "A", n), /^P-[0-9A-F]{12}$/);
});

test("kasa: köprü kaydeder (aynı kişi tek belirteç), yetkili gerekçeyle çözer, veritabanında düz metin yok", async () => {
  const db = await freshDb(); const A = await seedTenant(db, "KASA-A"); const keys = await provisionTenantKeys(db, A.tenantId, testKek());
  const nid = syntheticNationalId(7);
  const bridgeCtx = { tenantId: A.tenantId, actor: "kopru", role: "kb_bridge" as const };
  const t1 = await withContext(db, bridgeCtx, (tx) => registerIdentity(tx, A.tenantId, keys, { nationalId: nid, ...FICTIONAL }));
  const t2 = await withContext(db, bridgeCtx, (tx) => registerIdentity(tx, A.tenantId, keys, { nationalId: nid, ...FICTIONAL }));
  assert.equal(t1, t2);
  await assert.rejects(withContext(db, bridgeCtx, (tx) => registerIdentity(tx, A.tenantId, keys, { nationalId: "11111111111", ...FICTIONAL })), /TCKN/);
  await assert.rejects(withContext(db, { tenantId: A.tenantId, actor: "app" }, (tx) => registerIdentity(tx, A.tenantId, keys, { nationalId: syntheticNationalId(8), ...FICTIONAL })), /permission denied/, "uygulama rolü kasaya yazamaz");
  const raw = await db.query<{ t: string }>("SELECT identity_ciphertext::text AS t FROM vault.identities");
  assert.ok(!raw.rows.some((r) => r.t.includes(Buffer.from(nid).toString("hex")) || r.t.includes(nid)), "TCKN düz metin değil");
  const who = await withContext(db, { tenantId: A.tenantId, actor: "hekim@a", canReidentify: true }, (tx) => reidentify(tx, A.tenantId, keys, t1, "Hasta yakınına bilgi verilecek, kimlik teyidi"));
  assert.equal(who?.nationalId, nid);
  assert.deepEqual(maskIdentity(who!), { name: "De*** Ku***", nationalId: `${nid[0]}******${nid.slice(-2)}` });
  await db.close();
});
