// K2: Serbest metin yorumlanmaz. Acil, öncelik, birim ve talep türü yalnız talebi giren personelin seçimidir.
// (Eski tests/urgency-turkish.test.mjs metinden acil çıkaran fonksiyonu sınıyordu; o davranış ürün sınırı gereği
// kaldırıldı. Aynı acil ifadeli cümleler burada artık hiçbir otomatik sonuç üretmediği için yeniden sınanıyor.)
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createD1, loadRoute, ORIGIN, setRuntime } from './helpers/route-harness.mjs';

const privacy = await loadRoute('lib/privacy.ts');
const route = await loadRoute('app/api/tickets/route.ts');
const callsRoute = await loadRoute('app/api/calls/route.ts');
const EMERGENCY_TEXTS = ['Göğüs ağrım var', 'Annem bayıldı', 'Nefes alamıyorum', 'kalp krizi geçiriyor', 'Kanaması durmuyor'];

async function setup() {
  const { d1, sqlite } = await createD1();
  setRuntime(d1, { ownerEmail: 'owner@klinorbis.test', demoEnabled: '0' });
  sqlite.prepare("INSERT INTO staff_accounts (email, display_label, system_role, active, created_at) VALUES ('ops@klinorbis.test', 'Ops', 'operations_manager', 1, ?)").run(Date.now());
  const req = (path, body) => new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-klinorbis-request': 'browser', 'oai-authenticated-user-email': 'ops@klinorbis.test' }, body: JSON.stringify(body) });
  return { sqlite, req };
}

test('metinden acil çıkaran fonksiyon artık yok; acil yalnız açık personel işareti', () => {
  assert.equal(privacy.emergencyWordsNotice, undefined);
  for (const t of EMERGENCY_TEXTS) assert.equal(privacy.staffUrgentFlag(undefined).notice, false, t);
  assert.deepEqual(privacy.staffUrgentFlag(true), { notice: true, source: 'staff' });
  assert.equal(privacy.staffUrgentFlag('evet').notice, false);
  assert.match(privacy.EMERGENCY_NOTICE_TEXT, /112/);
});

test('acil ifadeli metin: durum, öncelik ve birim değişmez; 112 bilgisi sabit gösterilir', async () => {
  const { sqlite, req } = await setup();
  try {
    for (const [i, subject] of EMERGENCY_TEXTS.entries()) {
      const res = await route.POST(req('/api/tickets', { patientAlias: `TEST-K2-${i}`, subject: `${subject} - kurgusal kayıt` }));
      assert.equal(res.status, 201, subject);
      const data = await res.json();
      assert.equal(data.ticket.status, 'Yeni', subject);
      assert.equal(data.ticket.priority, 'Normal', subject);
      assert.equal(data.ticket.humanApprovalRequired, false, subject);
      assert.equal(data.destination.unitCode, 'HIL', subject);
      assert.equal(data.automation.textInterpreted, false);
      assert.equal(data.automation.prioritySource, 'talep eden personel');
      assert.match(data.automation.emergencyNotice, /112/);
      assert.ok(data.ticket.subject.startsWith(subject), 'metin olduğu gibi iletilir');
    }
  } finally { sqlite.close(); }
});

test('personel seçimi: öncelik, talep türü birimi ve acil işareti yalnız formdan', async () => {
  const { sqlite, req } = await setup();
  try {
    const high = await (await route.POST(req('/api/tickets', { patientAlias: 'TEST-K2-11', subject: 'Randevu bilgisi isteniyor', priority: 'Yüksek', requestType: 'cancel' }))).json();
    assert.equal(high.ticket.priority, 'Yüksek');
    assert.equal(high.destination.unitCode, 'RND');
    assert.equal(high.requestType.code, 'cancel');
    // Metinde "iptal/şikâyet" geçse de tür seçilmediyse genel bilgi kalır.
    const plain = await (await route.POST(req('/api/tickets', { patientAlias: 'TEST-K2-12', subject: 'Şikâyet etmek ve iptal etmek istiyorum' }))).json();
    assert.equal(plain.requestType.code, 'info');
    assert.equal(plain.destination.unitCode, 'HIL');
    assert.equal(plain.playbook, null);
    const urgent = await (await route.POST(req('/api/tickets', { patientAlias: 'TEST-K2-13', subject: 'Kurgusal görüşme kaydı', staffUrgent: true }))).json();
    assert.equal(urgent.ticket.status, 'Personele aktarıldı');
    assert.equal(urgent.automation.staffReview, true);
    const event = sqlite.prepare("SELECT detail FROM ticket_events WHERE ticket_reference = ? AND event_type = 'automation_paused'").get(urgent.ticket.reference);
    assert.match(event.detail, /personel acil olarak işaretledi/);
  } finally { sqlite.close(); }
});

test('çağrı: acil ifade devri açmaz, görevli işareti açar', async () => {
  const { sqlite, req } = await setup();
  try {
    const a = await (await callsRoute.POST(req('/api/calls', { patientAlias: 'TEST-K2-21', openingMessage: 'Göğüs ağrım var, randevu istiyorum' }))).json();
    assert.equal(a.call.status, 'active');
    assert.equal(a.call.requiresHuman, false);
    const b = await (await callsRoute.POST(req('/api/calls', { patientAlias: 'TEST-K2-22', openingMessage: 'Kurgusal arama', staffUrgent: true }))).json();
    assert.equal(b.call.status, 'human_handoff');
  } finally { sqlite.close(); }
});

test('"Klinik triyaj" rol adı ve metinden acil çıkarma kodu kaynakta yok', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  for (const file of [...walk('lib'), ...walk('app')]) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /Klinik [Tt]riyaj/, file);
    assert.doesNotMatch(src, /emergencyWordsNotice|classifyRequest\(/, file);
  }
});
