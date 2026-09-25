// Davranış testleri için: gerçek rota modülünü esbuild ile paketler ve Drizzle
// migrasyonlarıyla kurulan bellek içi SQLite'ı D1 arayüzüyle sunar.
// Yalnız sentetik test verisi kullanır; ağ veya üretim verisine dokunmaz.
import { build } from "esbuild";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const norm = (params) => params.map((value) => (value === undefined ? null : typeof value === "boolean" ? Number(value) : value));

export async function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(root, "drizzle");
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of (await readFile(join(dir, file), "utf8")).split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  const statement = (sql, params = []) => ({
    bind: (...next) => statement(sql, next),
    // Her çağrı olay döngüsüne döner: eşzamanlı isteklerin araya girmesi gerçekçi olur.
    async all() { await tick(); return { results: sqlite.prepare(sql).all(...norm(params)), success: true, meta: {} }; },
    async run() { await tick(); const r = sqlite.prepare(sql).run(...norm(params)); return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    async first(column) { await tick(); const row = sqlite.prepare(sql).get(...norm(params)); return column ? row?.[column] ?? null : row ?? null; },
    async raw() {
      await tick();
      const prepared = sqlite.prepare(sql);
      if (typeof prepared.setReturnArrays === "function") { prepared.setReturnArrays(true); return prepared.all(...norm(params)); }
      return prepared.all(...norm(params)).map((row) => Object.values(row));
    },
  });
  const d1 = {
    prepare: (sql) => statement(sql),
    async batch(list) { const out = []; for (const item of list) out.push(await item.all()); return out; },
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; },
  };
  return { d1, sqlite };
}

export async function loadRoute(relativePath) {
  const outdir = await mkdtemp(join(tmpdir(), "klinorbis-route-"));
  const outfile = join(outdir, "route.mjs");
  await build({
    entryPoints: [join(root, relativePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile,
    logLevel: "silent",
    external: ["node:*"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  return import(pathToFileURL(outfile).href);
}

export function setRuntime(d1, env) {
  globalThis.__KLINORBIS_DB = d1;
  globalThis.__KLINORBIS_SECURITY_ENV = env;
  globalThis.__KLINORBIS_OPERATIONAL_SEEDED = false;
}

export const ORIGIN = "https://klinorbis.test";

export function browserJson(path, body, email) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "x-klinorbis-request": "browser",
      ...(email ? { "oai-authenticated-user-email": email } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function writeScratch(name, content) {
  const dir = await mkdtemp(join(tmpdir(), "klinorbis-"));
  const file = join(dir, name);
  await writeFile(file, content);
  return file;
}
