// Çekirdek sunucusunu başlatır. Gerekli ortam değişkenleri (değerler gizli kasada tutulur, depoya yazılmaz):
//   DATABASE_URL, KB_PROXY_SECRET, KB_KEK_BASE64 (yerel deneme; üretimde KMS/HSM sağlayıcısı kullanın),
//   KB_BRIDGE_CLIENTS = JSON {"kopru-01":{"secret":"…","tenantCode":"HASTANE"}}, PORT (varsayılan 8443 arkasında TLS vekili)
import { connectPostgres } from "../db.ts";
import { localKeyProvider } from "../crypto.ts";
import { loadKeyring } from "../keys.ts";
import { createCoreServer } from "../server/app.ts";

const need = (k: string) => { const v = process.env[k]; if (!v) { console.error(`${k} tanımlı değil.`); process.exit(1); } return v; };
const db = await connectPostgres(need("DATABASE_URL"));
const kms = localKeyProvider(need("KB_KEK_BASE64"));
const clients = JSON.parse(process.env.KB_BRIDGE_CLIENTS ?? "{}") as Record<string, { secret: string; tenantCode: string }>;
const bridgeClients: Record<string, { secret: string; tenantId: string }> = {};
for (const [k, v] of Object.entries(clients)) {
  const id = (await db.query<{ id: string }>("SELECT id FROM kb.tenants WHERE code = $1", [v.tenantCode])).rows[0]?.id;
  if (id) bridgeClients[k] = { secret: v.secret, tenantId: id };
}
const cache = new Map<string, Awaited<ReturnType<typeof loadKeyring>>>();
const server = createCoreServer({
  db, proxySecret: need("KB_PROXY_SECRET"), bridgeClients,
  keyrings: async (t) => { if (!cache.has(t)) cache.set(t, await loadKeyring(db, t, kms)); return cache.get(t)!; },
});
server.listen(Number(process.env.PORT ?? 8080), "127.0.0.1", () => console.log("Klinorbis çekirdeği çalışıyor (yalnız yerel arayüz; önünde TLS vekili olmalı)."));
