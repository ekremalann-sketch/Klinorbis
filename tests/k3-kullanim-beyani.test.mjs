// K3: her modülün başında kullanım amacı beyanı; ürün metinlerinde yasaklı ifadeler geçmez.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness.mjs";

const help = await loadRoute("lib/screen-help.ts");
const dashboard = readFileSync("app/dashboard.tsx", "utf8");
const views = [...dashboard.match(/const viewPaths: Record<View, string> = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);

test("her ekranın kullanım amacı beyanı var ve klinik sınırı söylüyor", () => {
  assert.ok(views.length >= 20, `ekran listesi okunamadı: ${views.length}`);
  for (const view of views) {
    const text = help.usageStatement(view);
    assert.ok(text, `${view} için beyan yok`);
    assert.match(text, /^Kullanım amacı: /, view);
    assert.match(text, /Klinik karar, tanı veya tedavi önerisi üretmez/, view);
    assert.ok(text.length < 400, `${view} beyanı tek satırı aşmasın`);
  }
  assert.match(readFileSync("app/screen-help-box.tsx", "utf8"), /usageStatement\(view\)/);
  assert.match(dashboard, /<ScreenHelpBox key=\{initialView\} view=\{initialView\} \/>/);
});

const BANNED = /triyaj|triage|erken uyar[ıi]|early warning|klinik [öo]neri/i;
const walk = (dir) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`;
  if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
  return /\.(ts|tsx|js|mjs|css|html|json|md|sql)$/.test(e.name) ? [p] : [];
}) : [];

test("ürün metinlerinde 'triyaj', 'erken uyarı', 'klinik öneri' geçmez", () => {
  // Tasarım ve araştırma belgeleri sınırı tartıştığı için bu kelimeleri anar; ürün kodu ve metinleri anmaz.
  const files = [...walk("app"), ...walk("lib"), ...walk("db"), ...walk("public"), ...walk("docs").filter((f) => !/TASARIM-BELGESI|ARASTIRMA/.test(f))];
  assert.ok(files.length > 50);
  const hits = files.filter((f) => BANNED.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);
});
