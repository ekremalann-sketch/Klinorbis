// K5: yatak panosu 6 durum + "bu durumda kaç dakikadır" sayacı; hasta adı yok.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createD1, loadRoute } from "./helpers/route-harness.mjs";

const bb = await loadRoute("lib/bed-board.ts");
const base = { physical: "departed", hbys: "vacant", cleaning: "dirty", technical: 1, staffed: 1, review: 0, ready: false, stale: false };

test("6 durumun hepsi ayrı görünür", () => {
  const cases = [
    [{ ...base, physical: "occupied", hbys: "occupied" }, "dolu"],
    [{ ...base, cleaning: "queued" }, "kirli"],
    [{ ...base, cleaning: "active" }, "temizleniyor"],
    [{ ...base, cleaning: "check" }, "kontrol"],
    [{ ...base, cleaning: "ready", ready: true }, "hazir"],
    [{ ...base, technical: 0 }, "engelli"],
  ];
  for (const [bed, key] of cases) assert.equal(bb.boardState(bed).key, key, JSON.stringify(bed));
  assert.equal(new Set(bb.BOARD_STATES.map((s) => s.tone)).size, 6, "her durumun rengi farklı");
  assert.equal(bb.boardState({ ...base, review: 1, cleaning: "ready", ready: true }).key, "engelli", "inceleme gereken yatak hazır sayılmaz");
});

test("dakika sayacı", () => {
  const now = Date.UTC(2026, 10, 11, 12, 0);
  assert.equal(bb.minutesInState(now - 17 * 60_000, now), 17);
  assert.equal(bb.durationLabel(17), "17 dk");
  assert.equal(bb.durationLabel(135), "2 sa 15 dk");
  assert.equal(bb.durationLabel(120), "2 sa");
  assert.equal(bb.minutesInState(null, now), null);
  assert.equal(bb.durationLabel(null), "süre bilinmiyor");
  assert.equal(bb.minutesInState(now + 3_600_000, now), null, "gelecekteki zaman kabul edilmez");
});

test("veritabanı: durum değişince sayaç sıfırlanır, ilgisiz değişiklikte sıfırlanmaz", async () => {
  const { sqlite } = await createD1();
  try {
    sqlite.prepare("INSERT INTO simops_beds (tenant,id,campus,building,floor,unit,room) VALUES ('t','B1','K','A','1','YTK','11')").run();
    const since = () => sqlite.prepare("SELECT state_since FROM simops_beds WHERE id='B1'").get().state_since;
    const first = since();
    assert.ok(first > 1_700_000_000_000, "eklenince zaman yazılır");
    sqlite.prepare("UPDATE simops_beds SET state_since = 1 WHERE id='B1'").run();
    sqlite.prepare("UPDATE simops_beds SET version = version + 1 WHERE id='B1'").run();
    assert.equal(since(), 1, "sürüm değişikliği sayacı sıfırlamaz");
    sqlite.prepare("UPDATE simops_beds SET cleaning = 'active' WHERE id='B1'").run();
    assert.ok(since() > 1_700_000_000_000, "temizlik başlayınca sayaç yeniden başlar");
  } finally { sqlite.close(); }
});

test("pano karosu durum, süre gösterir; hasta adı alanı kullanılmaz", async () => {
  const src = await readFile(new URL("../app/hbys/coordination.tsx", import.meta.url), "utf8");
  const board = src.slice(src.indexOf("function BedBoard"));
  assert.match(board, /durationLabel\(mins\)/);
  assert.match(board, /BOARD_STATES\.map/);
  assert.doesNotMatch(board, /patient/i);
});
