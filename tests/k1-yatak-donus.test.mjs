// Çözüm Mimarı K1 ve 18 Kasım pano bulguları (Klinorbis): yatak dönüş segmentleri, kullanım amacı sayfası, ekran düzeltmeleri.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRoute} from './helpers/route-harness.mjs';
const t=await loadRoute('lib/bed-turnaround.ts');
const M=60000;

test('K1: segment ortancaları ve toplam dönüş süresi; eksik adım sayılmaz',()=>{
  const j=(c,a,s,d,i)=>({created:0,'job.accept':a*M,'job.start':s*M,'job.complete':d*M,...(i!=null?{'job.inspect':i*M}:{})});
  const r=t.turnaround([j(0,10,15,45,50),j(0,20,25,65,80),{created:0,'job.accept':5*M}]);
  const seg=Object.fromEntries(r.segments.map(s=>[s.key,s]));
  assert.equal(seg.wait.medianMin,10);assert.equal(seg.wait.count,3);
  assert.equal(seg.clean.medianMin,35);assert.equal(seg.clean.count,2);
  assert.equal(seg.check.medianMin,10);assert.equal(r.totalMedianMin,65);assert.equal(r.completed,2);
  assert.equal(t.turnaround([]).totalMedianMin,null);
});

test('K2/K7 ve tasarım bulguları: kullanım amacı sayfası, yapay zekâ ayrı başlık, birim arama, son kullanılan talepler, tek "Yeni talep"',async()=>{
  const page=await readFile('app/kullanim-amaci/page.tsx','utf8');
  for(const p of [/Tanı koymaz/,/tıbbi cihaz olarak tasarlanmamış/,/bilgilendirme amaçlıdır/,/kurgusal \(sentetik\)/])assert.match(page,p);
  assert.doesNotMatch(page,/triyaj|erken uyarı|klinik öneri/i);
  assert.match(await readFile('app/site-chrome.tsx','utf8'),/href="\/kullanim-amaci"/);
  assert.match(await readFile('app/gizlilik/page.tsx','utf8'),/<h2>Yapay zekâ \(varsayılan kapalı\)<\/h2>/);
  const dash=await readFile('app/dashboard.tsx','utf8');assert.match(dash,/aria-label="Birim ara"/);assert.match(dash,/unit-grid-compact/);
  const mw=await readFile('app/my-work.tsx','utf8');assert.match(mw,/kb\.recentTypes/);assert.doesNotMatch(mw,/"Talep aç"|>Talep aç </);
  assert.match(await readFile('app/hbys/coordination.tsx','utf8'),/Yatak dönüş süreleri/);
});

test("ana sayfa hukuk onayı bekleyen kullanım amacı sayfasına bağlantı vermez (diğer sayfalarda alt bilgide kalır)", async () => {
  const { readFile } = await import("node:fs/promises");
  const home = await readFile("app/page.tsx", "utf8");
  assert.doesNotMatch(home, /kullanim-amaci/);
  assert.match(home, /<Footer home \/>/);
  assert.match(await readFile("app/site-chrome.tsx", "utf8"), /\{!home&&<Link href="\/kullanim-amaci">/);
});
