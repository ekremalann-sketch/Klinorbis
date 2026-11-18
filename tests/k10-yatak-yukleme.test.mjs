// K10: Excel'den yatak listesi (kurgusal kodlar) ve QR etiket sayfası.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson} from './helpers/route-harness.mjs';

const lib=await loadRoute('lib/bed-import.ts');
const rows100=['yatak_kodu\tkampus\tbina\tkat\tbirim\toda',...Array.from({length:100},(_,i)=>`YTK-SIM-${String(101+i).padStart(3,'0')}\tKampüs A\tBina 1\tKat ${1+Math.floor(i/20)}\tYTK\t${300+i}`)].join('\n');

test('Excel yapıştırma (sekme) ve CSV (noktalı virgül, tırnak) okunur; başlık atlanır',()=>{
  const r=lib.parseBedList(rows100);assert.deepEqual(r.errors,[]);assert.equal(r.rows.length,100);
  assert.deepEqual(r.rows[0],{id:'YTK-SIM-101',campus:'Kampüs A',building:'Bina 1',floor:'Kat 1',unit:'YTK',room:'300'});
  const csv=lib.parseBedList('yatak_kodu;kampus;bina;kat;birim;oda\n"CRT-SIM-001";"Kampüs B";"Bina 2";"Kat 1";"crt";"12A"');
  assert.deepEqual(csv.rows[0],{id:'CRT-SIM-001',campus:'Kampüs B',building:'Bina 2',floor:'Kat 1',unit:'CRT',room:'12A'});
});

test('hatalar satır numarasıyla: gerçek görünen kod, tekrar, eksik alan; 500 satır sınırı',()=>{
  const r=lib.parseBedList('YATAK-12\tA\tB\tC\tYTK\t1\nYTK-SIM-001\tA\tB\tC\tYTK\t1\nYTK-SIM-001\tA\tB\tC\tYTK\t1\nYTK-SIM-002\tA\t\tC\tYTK\t1');
  assert.equal(r.errors.length,3);assert.match(r.errors[0],/^1\. satır: yatak kodu kurgusal/);assert.match(r.errors[1],/^3\. satır: YTK-SIM-001 iki kez/);assert.match(r.errors[2],/^4\. satır/);
  assert.match(lib.parseBedList(Array.from({length:501},(_,i)=>`YTK-SIM-${i}\tA\tB\tC\tYTK\t1`).join('\n')).errors[0],/En fazla 500/);
});

await test('100 yataklık liste tek istekte yüklenir; var olan yatak değişmez; yalnız yönetici yükler',async()=>{
  const {d1,sqlite}=await createD1();const OPS='ops@klinorbis.test',UM='um@klinorbis.test';setRuntime(d1,{ownerEmail:OPS,demoEnabled:'0'});
  sqlite.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)").run(UM,'UM','unit_manager',Date.now());
  sqlite.prepare("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES(?,'YTK','Test',1,0,1)").run(UM);
  const main=await loadRoute('app/api/hospital-coordination/route.ts');const imp=await loadRoute('app/api/hospital-coordination/import/route.ts');
  const req=(api,path,body,email=OPS)=>{const r=browserJson(path,body,email);r.headers.set('x-klinorbis-sim-tenant','SIM-KURUM-A');return api.POST(r);};
  try{
    assert.equal((await req(main,'/api/hospital-coordination',{action:'init'})).status,200);
    sqlite.prepare("INSERT INTO simops_members(tenant,email) VALUES('SIM-KURUM-A',?)").run(UM);
    sqlite.prepare("UPDATE simops_beds SET cleaning='active' WHERE id='YTK-SIM-001'").run();
    assert.equal((await req(imp,'/api/hospital-coordination/import',{text:rows100},UM)).status,403);
    const started=Date.now();
    const r=await req(imp,'/api/hospital-coordination/import',{text:rows100+'\nYTK-SIM-001\tX\tY\tZ\tYTK\t9'});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,added:100,skipped:1});
    assert.ok(Date.now()-started<5*60*1000);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM simops_beds WHERE tenant='SIM-KURUM-A'").get().n,108);
    assert.deepEqual({...sqlite.prepare("SELECT campus,cleaning FROM simops_beds WHERE id='YTK-SIM-001'").get()},{campus:'Örnek Kampüs A',cleaning:'active'},'var olan yatak değişmedi');
    assert.equal((await req(imp,'/api/hospital-coordination/import',{text:'GERCEK-1\tA\tB\tC\tYTK\t1'})).status,422);
  }finally{sqlite.close();}
});

test('QR sayfası: her yatak için /temizlik?yatak= adresli etiket, yazdır düğmesi',async()=>{
  const src=await readFile('app/yatak/qr/qr-labels.tsx','utf8');
  assert.match(src,/\/temizlik\?yatak=\$\{encodeURIComponent\(b\.id\)\}/);
  assert.match(src,/window\.print\(\)/);
  assert.match(src,/@media print/);
  assert.doesNotMatch(src,/patient/i);
});
