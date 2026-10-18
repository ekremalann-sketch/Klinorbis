// Acil olasılık sinyali: Türkçe çekim ekleri, olumsuzlama ve yanlış pozitifler (sentetik cümleler).
import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute } from "./helpers/route-harness.mjs";

const { urgencySignal } = await loadRoute("lib/privacy.ts");
const yes = ["Göğüs ağrım var", "göğüs ağrısından şikayetçiyim", "Babamın göğsüm ağrıyor dediği", "Annem bayıldı", "Nefes alamıyorum", "nefes alamıyor şu an", "Kanaması durmuyor", "bilincini kaybetti", "Aşırı doz aldı", "inme geçiriyor olabilir", "Nöbet geçiriyor"];
const no = ["Göğüs ağrısı yok, sadece randevu", "Bayilik başvurusu hakkında", "otobüsten inmek istiyorum", "Randevumu değiştirmek istiyorum", "nefes darlığı değil, kontrol için"];

test("ürün sınırı: belirtiler klinik puan veya acil yönlendirme üretmez", () => {
  for (const t of yes) assert.equal(urgencySignal(t).isEmergency, false, t);
});
test("acil: olumsuz ve ilgisiz cümleler acil sayılmaz", () => {
  for (const t of no) assert.equal(urgencySignal(t).isEmergency, false, t);
});
