import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Klinisyen ana ekranındaki sınır cümlesi kaldırılmamalı: ürün klinik karar aracı değildir.
test('klinisyen ana ekranı klinik karar vermediğini söyler (K3: yasaklı ifade yerine)', async()=>{
  const src=await readFile('app/dashboard.tsx','utf8');
  assert.match(src,/Sistem klinik karar vermez; karar sizindir\./);
});
test('kenar menü ve demo bandında 12 px altı yazı ve 44 px altı özet hedefi yok', async()=>{
  const css=await readFile('app/workspace-polish.css','utf8');
  assert.doesNotMatch(css,/\.sidebar nav p\{font-size:11px/);
  assert.doesNotMatch(css,/\.profile-banner summary\{[^}]*min-height:24px/);
});
