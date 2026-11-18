import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Yatak kartı: tek durum rozeti ve tek ana temizlik eylemi; bağımsız kontrol karttan yapılamaz.
test('yatak kartı tek ana eylem olarak yalnız mevcut temizlik kuyruğu geçişlerini kullanır', async()=>{
  const src=await readFile('app/hbys/coordination.tsx','utf8');
  const step=src.match(/const CLEAN_STEP[^\n]*/)?.[0]??'';
  assert.match(step,/queued:\['accept'/);assert.match(step,/accepted:\['start','Temizliğe başla'\]/);assert.match(step,/active:\['complete'/);
  assert.doesNotMatch(step,/inspect|check:/,'bağımsız kontrol (inspect) yatak kartından tetiklenmemeli');
  assert.match(src,/className="more"><summary>Diğer işlemler<\/summary>/);
});
