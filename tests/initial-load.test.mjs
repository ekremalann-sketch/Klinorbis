import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Canlıda görülen "Çalışma alanı açılamadı · signal is aborted without reason" hatasının geri gelmemesi için kaynak kuralları.
const source = await readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
test("iptal edilen istek kullanıcıya hata olarak gösterilmez", () => {
  assert.match(source, /aborted && !timedOut/);
  assert.match(source, /refreshAbort\.current !== controller/);
  assert.doesNotMatch(source, /setError\(\s*cause instanceof Error\s*\?\s*cause\.message/);
});
test("ilk yükleme bitmeden yoklama, görünürlük yenilemesi ve otomasyon nabzı başlamaz", () => {
  assert.match(source, /visibilityState === "visible" && firstLoadDone\.current\) await refresh\(true\)/);
  assert.match(source, /!firstLoadDone\.current \|\| document\.visibilityState !== "visible"/);
});
test("ilk açılışta 20 sn zaman aşımı ve bir otomatik yeniden deneme var; Yeniden bağlan sayfa yenilemeden temiz istek açar", () => {
  assert.match(source, /controller\.abort\(\); \}, 20000\)/);
  assert.match(source, /attempt < 1/);
  assert.match(source, /onClick=\{reconnect\}/);
});
