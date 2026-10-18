// Veri sözlüğü üretici: migrasyonları geçici veritabanında çalıştırır, tablo/sütun/açıklama/kısıt sayılarını
// docs/core/VERI-SOZLUGU.md dosyasına yazar. Kaynak tek: migrasyon dosyaları.
import { writeFile } from "node:fs/promises";
import { connectPglite } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";

const db = await connectPglite();
await migrate(db);
const tables = (await db.query<{ schema: string; name: string; comment: string | null }>(`SELECT n.nspname AS schema, c.relname AS name, obj_description(c.oid) AS comment
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('kb','vault','audit','kvkk') AND c.relkind IN ('r','p') AND c.relname NOT LIKE '%\\_default' AND NOT c.relispartition ORDER BY 1, 2`)).rows;
let out = "# Klinorbis Türkiye çekirdeği · veri sözlüğü\n\nBu dosya `npm run docs:dictionary` ile migrasyonlardan üretilir; elle düzenlemeyin.\n\n";
for (const t of tables) {
  const cols = (await db.query<{ column_name: string; data_type: string; is_nullable: string }>("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position", [t.schema, t.name])).rows;
  const checks = (await db.query<{ n: number }>("SELECT count(*)::int n FROM pg_constraint WHERE conrelid = ($1 || '.' || $2)::regclass AND contype = 'c'", [t.schema, t.name])).rows[0].n;
  out += `## ${t.schema}.${t.name}\n\n${t.comment ?? ""}\n\nKısıt (CHECK): ${checks}\n\n| Sütun | Tür | Boş olabilir |\n|---|---|---|\n${cols.map((c) => `| ${c.column_name} | ${c.data_type} | ${c.is_nullable === "YES" ? "evet" : "hayır"} |`).join("\n")}\n\n`;
}
await writeFile(new URL("../../docs/core/VERI-SOZLUGU.md", import.meta.url), out);
console.log(`${tables.length} tablo yazıldı`);
await db.close();
