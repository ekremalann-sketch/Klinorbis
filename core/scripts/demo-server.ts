// Yerel deneme sunucusu: bellek içi PostgreSQL (PGlite) + tamamen kurgusal veri. Gerçek veri veya ağ bağlantısı yok.
// Kullanım: node --experimental-strip-types scripts/demo-server.ts  (port ve imza gizlisi konsola yazılır; yalnız deneme içindir)
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { connectPglite } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";
import { localKeyProvider } from "../src/crypto.ts";
import { provisionTenantKeys } from "../src/keys.ts";
import { createCoreServer } from "../src/server/app.ts";
import { adt } from "../src/bridge/fake-hbys.ts";
import { parseAdt } from "../src/bridge/hl7v2.ts";
import { ingestAdt } from "../src/bridge/ingest.ts";

const db = await connectPglite();
await migrate(db);
const q = async (sql: string, p: unknown[] = []) => (await db.query<{ id: string }>(sql, p)).rows[0]?.id;
const t = await q("INSERT INTO kb.tenants (code, name, kind, deployment) VALUES ('DEMO', 'Kurgusal Örnek Hastanesi', 'ozel', 'demo') RETURNING id");
const c = await q("INSERT INTO kb.campuses (tenant_id, code, name) VALUES ($1, 'MRK', 'Merkez Yerleşke') RETURNING id", [t]);
const unit = (code: string, name: string, kind = "clinical") => q("INSERT INTO kb.units (tenant_id, campus_id, code, name, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id", [t, c, code, name, kind]);
const units: Record<string, string> = { DHL: (await unit("DHL", "İç Hastalıkları Servisi"))!, KRD: (await unit("KRD", "Kardiyoloji Servisi"))!, CTM: (await unit("CTM", "Temizlik Hizmetleri", "operational"))!, YTK: (await unit("YTK", "Yatak Yönetimi", "operational"))! };
for (const [u, rooms] of [["DHL", ["301", "302", "303"]], ["KRD", ["401", "402"]]] as const) for (const r of rooms) {
  const room = await q("INSERT INTO kb.rooms (tenant_id, unit_id, code) VALUES ($1, $2, $3) RETURNING id", [t, units[u], r]);
  for (const b of ["A", "B"]) await q("INSERT INTO kb.beds (tenant_id, room_id, unit_id, code) VALUES ($1, $2, $3, $4) RETURNING id", [t, room, units[u], `${r}-${b}`]);
}
const staff = async (sub: string, label: string, role: string, us: string[]) => {
  const id = await q("INSERT INTO kb.staff (tenant_id, external_subject, display_label) VALUES ($1, $2, $3) RETURNING id", [t, sub, label]);
  await q("INSERT INTO kb.staff_roles (tenant_id, staff_id, role_code, granted_by) VALUES ($1, $2, $3, 'demo') RETURNING staff_id", [t, id, role]);
  for (const u of us) await q("INSERT INTO kb.unit_memberships (tenant_id, staff_id, unit_id) VALUES ($1, $2, $3) RETURNING staff_id", [t, id, units[u]]);
};
await staff("ops.demo", "Operasyon Yöneticisi (demo)", "operations_manager", []);
await staff("tmz.demo", "Temizlik Görevlisi (demo)", "staff", ["CTM"]);
await staff("sorumlu.demo", "Temizlik Sorumlusu (demo)", "unit_manager", ["CTM"]);
const keys = await provisionTenantKeys(db, t!, localKeyProvider(randomBytes(32).toString("base64")));
const now = Date.now(); let i = 0;
const send = async (raw: string) => ingestAdt(db, { tenantId: t! }, keys, parseAdt(raw), raw);
const at = (min: number) => new Date(now - min * 60_000);
for (const [n, u, r, b] of [[1, "DHL", "301", "301-A"], [2, "DHL", "301", "301-B"], [3, "DHL", "302", "302-A"], [4, "KRD", "401", "401-A"], [5, "KRD", "402", "402-B"]] as const)
  await send(adt("A01", { n, visit: `V-${n}`, unit: u, room: r, bed: b }, `DEMO-${++i}`, at(300 - n)));
await send(adt("A03", { n: 2, visit: "V-2", unit: "DHL", room: "301", bed: "301-B" }, `DEMO-${++i}`, at(40)));
await send(adt("A03", { n: 5, visit: "V-5", unit: "KRD", room: "402", bed: "402-B" }, `DEMO-${++i}`, at(25)));
await send(adt("A01", { n: 9, visit: "V-9", unit: "DAHILIYE-B", room: "303", bed: "303-A" }, `DEMO-${++i}`, at(10)));
await send(adt("A02", { n: 3, visit: "V-3", unit: "DHL", room: "303", bed: "303-B" }, `DEMO-${++i}`, at(400), { unit: "DHL", room: "302", bed: "302-A" }));

const secret = randomBytes(24).toString("hex");
const server = createCoreServer({ db, proxySecret: secret, keyrings: async () => keys, bridgeClients: {} });
server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => console.log(JSON.stringify({ port: (server.address() as AddressInfo).port, secret })));
