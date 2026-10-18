// Yedek zamanlayıcı (GitHub Actions) sunucudaki imza biçimiyle birebir uyumlu olmalı.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const wf = await readFile(new URL("../.github/workflows/automation-tick.yml", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/automation/agent/route.ts", import.meta.url), "utf8");
test("imza timestamp.eventId.body biçiminde, sha256= önekiyle ve doğru adrese gönderilir", () => {
  assert.match(wf, /printf '%s\.%s\.%s' "\$TS" "\$EVENT" "\$BODY"/);
  assert.match(route, /`\$\{timestamp\}\.\$\{eventId\}\.\$\{raw\}`/);
  assert.match(wf, /x-klinorbis-signature: sha256=\$SIG/);
  assert.match(wf, /\$ORIGIN\/api\/automation\/agent/);
  assert.match(wf, /\{"action":"tick"\}/);
});
test("anahtar veya adres yoksa iş sessizce geçmez, hata verir", () => {
  assert.match(wf, /::error::/);
  assert.match(wf, /exit 1/);
});
