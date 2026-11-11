import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Yatak tahtası: varsayılan görünüm, birim gruplaması, aynı filtre ve tek temizlik adımı; liste görünümü korunur.
test('yatak tahtası varsayılan; gruplanmış kutular aynı durum ve tek adım kurallarını kullanır', async()=>{
  const src=await readFile('app/hbys/coordination.tsx','utf8');
  assert.match(src,/useState<'board'\|'list'>\('board'\)/);
  assert.match(src,/function BedBoard/);
  assert.match(src,/`\$\{b\.campus\} · \$\{b\.floor\} · \$\{b\.unit\}`/);
  const board=src.slice(src.indexOf('function BedBoard'));
  assert.match(board,/bedStatus\(b,reserved\.has\(b\.id\)\)/);
  assert.match(board,/CLEAN_STEP\[cj\.status\]/);
  assert.doesNotMatch(board,/inspect/,'bağımsız kontrol tahtadan yapılamaz');
  assert.match(src,/<div hidden=\{view!=='list'\}>/,'liste görünümü korunur');
});
