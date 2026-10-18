// Şema: migrasyonlar temiz veritabanında ve ikinci kez çalıştırıldığında sorunsuz; tablo/kısıt/indeks sayıları.
import assert from "node:assert/strict";
import test from "node:test";
import { freshDb } from "./helpers.ts";
import { migrate } from "../src/migrate.ts";

test("migrasyonlar uygulanır, ikinci çalıştırma hiçbir şey yapmaz", async () => {
  const db = await freshDb();
  assert.deepEqual(await migrate(db), []);
  const tables = (await db.query<{ n: number }>("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema IN ('kb','vault','audit','kvkk') AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%_default'")).rows[0].n;
  const checks = (await db.query<{ n: number }>("SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace s ON s.oid = c.connamespace WHERE s.nspname IN ('kb','vault','audit','kvkk') AND c.contype = 'c'")).rows[0].n;
  const fks = (await db.query<{ n: number }>("SELECT count(*)::int n FROM pg_constraint c JOIN pg_namespace s ON s.oid = c.connamespace WHERE s.nspname IN ('kb','vault','audit','kvkk') AND c.contype = 'f'")).rows[0].n;
  const rls = (await db.query<{ n: number }>("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname IN ('kb','vault','audit','kvkk') AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n;
  console.log(JSON.stringify({ tables, checks, fks, rls }));
  assert.ok(tables >= 70, `tablo ${tables}`);
  assert.ok(checks >= 200, `CHECK ${checks}`);
  assert.ok(fks >= 80, `FK ${fks}`);
  assert.ok(rls >= 60, `RLS ${rls}`);
  await db.close();
});

test("değiştirilmiş eski migrasyon reddedilir", async () => {
  const db = await freshDb();
  await db.query("UPDATE public.schema_migrations SET sha256 = repeat('0', 64) WHERE name = '0001_temel.sql'");
  await assert.rejects(migrate(db), /değiştirilmiş/);
  await db.close();
});
