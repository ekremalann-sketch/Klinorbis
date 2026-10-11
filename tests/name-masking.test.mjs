// Hasta adı maskeleme: tüm rollerin ekranına giden serbest metinlerde olası kişi adları gizlenir (sentetik cümleler).
import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute } from "./helpers/route-harness.mjs";
const p = await loadRoute("lib/privacy.ts");
const v = await loadRoute("lib/oversight-view.ts");

test("iki büyük harfli kelime, unvan ve 'Ad Soyad:' kalıbı maskelenir", () => {
  assert.equal(p.redactForDisplay("Ayşe Yılmaz geri aranacak"), "[AD MASKELİ] geri aranacak");
  assert.equal(p.redactForDisplay("Dr. Mehmet Öz aradı"), "Dr. [AD MASKELİ] aradı");
  assert.match(p.redactForDisplay("Ad Soyad: Fatma Demir, tel 05321234567"), /^Ad Soyad: \[AD MASKELİ\], tel \[PHONE_MASKED\]$/);
  assert.equal(p.redactForDisplay("AYŞE YILMAZ randevu"), "[AD MASKELİ] randevu");
  assert.equal(p.redactForDisplay("Zeynep Hanım kontrol için arıyor"), "[AD MASKELİ] Hanım kontrol için arıyor");
});
test("birim, rol ve kategori adları maskelenmez; maske tekrar maskelenmez", () => {
  for (const s of ["Geri Arama Talebi Çağrı Merkezi kuyruğuna atandı", "Kalp ve Damar Cerrahisi", "HST-EĞİTİM-01 STANDART TALEP", "Acil Yönlendirme", "[AD MASKELİ] zaten"]) assert.equal(p.redactForDisplay(s), s);
});
test("ad-soyad biçimli takma ad reddedilir, kurum kodları kabul edilir", () => {
  assert.equal(p.validPatientAlias("AYŞE.YILMAZ"), false);
  assert.equal(p.validPatientAlias("HST-EĞİTİM-01"), true);
  assert.equal(p.validPatientAlias("DEMO-ACIL"), false);
  assert.equal(p.validPatientAlias("DEMO-ACIL-01"), true);
  assert.equal(p.maskEmail("ayse.kaya@kurum.org"), "ays…@kurum");
});
test("operasyon rolü yanıtında serbest metin adları ve ad biçimli takma ad maskelenir", () => {
  const out = v.oversightView({ role: "operations_manager", email: "o@t" }, { calls: [{ reference: "C-1", patientAlias: "AYSE.KAYA", summary: "Hasta Ali Veli Kardiyoloji randevusu", messages: [{ message: "Ben Ayşe Kaya" }] }] });
  assert.equal(out.calls[0].reference, "C-1");
  assert.equal(out.calls[0].patientAlias, "[AD MASKELİ]");
  assert.equal(out.calls[0].summary, "Hasta [AD MASKELİ] Kardiyoloji randevusu");
  assert.equal(out.calls[0].messages[0].message, "Ben [AD MASKELİ]");
});
