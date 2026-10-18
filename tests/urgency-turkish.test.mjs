// Acil ifade → yalnız 112 bilgilendirmesi (puan/triyaj yok, ADR-003): Türkçe çekim ekleri, olumsuzlama ve yanlış pozitifler (sentetik cümleler).
import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute } from "./helpers/route-harness.mjs";

const { emergencyWordsNotice, EMERGENCY_NOTICE_TEXT } = await loadRoute("lib/privacy.ts");
const yes = ["Göğüs ağrım var", "göğüs ağrısından şikayetçiyim", "Babamın göğsüm ağrıyor dediği", "Annem bayıldı", "Nefes alamıyorum", "nefes alamıyor şu an", "Kanaması durmuyor", "bilincini kaybetti", "Aşırı doz aldı", "inme geçiriyor olabilir", "Nöbet geçiriyor"];
const no = ["Göğüs ağrısı yok, sadece randevu", "Bayilik başvurusu hakkında", "otobüsten inmek istiyorum", "Randevumu değiştirmek istiyorum", "nefes darlığı değil, kontrol için"];

test("acil: ekli biçimler yakalanır", () => {
  for (const t of yes) assert.equal(emergencyWordsNotice(t).notice, true, t);
});
test("acil: olumsuz ve ilgisiz cümleler acil sayılmaz", () => {
  for (const t of no) assert.equal(emergencyWordsNotice(t).notice, false, t);
});

test("ADR-003: sonuçta puan, aciliyet sınıfı veya klinik birim önerisi yok", () => {
  const r = emergencyWordsNotice("Göğüs ağrım var");
  assert.deepEqual(Object.keys(r).sort(), ["matched", "notice"]);
  assert.match(EMERGENCY_NOTICE_TEXT, /112/);
});
