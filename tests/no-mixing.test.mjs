// Uygulamalar birbirine karışmasın: Klinorbis kaynak ve kamu metinlerinde Teksanor'a ait ad veya saha servis
// terimleri bulunmaz; pakette gizli dosya yer almaz; demo verisinde gerçek kişi gibi görünen ad/telefon yoktur.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath: Windows'ta da doğru yol (URL.pathname "/C:/..." üretip boş tarama yapıyordu).
const ROOT = fileURLToPath(new URL("..", import.meta.url));
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next", "build"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css|json|sql|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const files = ["app", "lib", "worker", "db", "core"].flatMap((d) => walk(join(ROOT, d)));

test("tarama gerçekten dosya buldu (boş tarama yanlış güven vermesin)", () => {
  assert.ok(files.length >= 100, `taranan dosya: ${files.length}`);
  assert.ok(files.some((f) => f.endsWith("dashboard.tsx")));
});

test("Klinorbis kaynağında Teksanor adı ve saha servis modülleri geçmez", () => {
  const offenders = files.filter((file) => /teksanor|servis masası|iş emri modülü|teksanor_session/i.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders.map((f) => f.replace(ROOT, "")), []);
});

test("Pakette gizli ortam dosyası yok", () => {
  for (const name of [".dev.vars", ".env"]) assert.equal(existsSync(join(ROOT, name)), false, name);
});

test("Örnek ve demo verisinde gerçek kişi gibi görünen telefon numarası yok", () => {
  const demo = files.filter((f) => /seed|demo|pilot|sample|fixture/i.test(f));
  const phones = demo.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\b0?5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g)].map((m) => `${file.replace(ROOT, "")}: ${m[0]}`));
  assert.deepEqual(phones, []);
});
