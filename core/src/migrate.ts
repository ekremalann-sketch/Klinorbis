// Migrasyon çalıştırıcı: dosyalar sırayla, her biri tek işlemde uygulanır; uygulanan dosyanın karması saklanır.
// Daha önce uygulanmış bir dosya değiştirilmişse çalıştırıcı durur (geçmiş migrasyon düzenlenemez).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

export async function migrate(db: Database, dir = MIGRATIONS_DIR) {
  await db.exec(`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Map((await db.query<{ name: string; sha256: string }>("SELECT name, sha256 FROM public.schema_migrations")).rows.map((r) => [r.name, r.sha256]));
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const done: string[] = [];
  for (const name of files) {
    const sql = await readFile(join(dir, name), "utf8");
    const sha = createHash("sha256").update(sql).digest("hex");
    const prev = applied.get(name);
    if (prev) {
      if (prev !== sha) throw new Error(`Uygulanmış migrasyon değiştirilmiş: ${name}. Yeni numaralı migrasyon ekleyin.`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO public.schema_migrations (name, sha256) VALUES ($1, $2)", [name, sha]);
    });
    done.push(name);
  }
  return done;
}
