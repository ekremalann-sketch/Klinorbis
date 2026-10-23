import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(resolve('package.json'));
const satoriRequire = createRequire(require.resolve('satori'));
const fflate = satoriRequire('fflate');
const payload = new TextEncoder().encode('sentetik-override-dogrulamasi');
assert.deepEqual(fflate.gunzipSync(fflate.gzipSync(payload)), payload);
const satoriModule = require('satori');
const satori = satoriModule.default ?? satoriModule;
const svg = await satori({type:'div',props:{style:{display:'flex',width:100,height:50,backgroundColor:'#fff'}}},{width:100,height:50,fonts:[]});
assert.match(svg, /<svg/);
const pkg = require('./package.json');
if (pkg.dependencies.exceljs) {
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sentetik');
  sheet.addRow(['SIM-001',42]);
  sheet.getCell('B2').value = {formula:'B1*2',result:84};
  const data = await book.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(data);
  assert.equal(restored.worksheets[0].getCell('A1').value,'SIM-001');
  assert.equal(restored.worksheets[0].getCell('B2').value.result,84);
}
const temp = resolve('tests/.tmp/override-compat');
await mkdir(temp,{recursive:true});
try {
  await writeFile(resolve(temp,'schema.ts'),"import { sqliteTable, text } from 'drizzle-orm/sqlite-core'; export const sample=sqliteTable('sample',{id:text('id').primaryKey()});");
  const result = spawnSync(process.execPath,[resolve(dirname(require.resolve('drizzle-kit')),'bin.cjs'),'generate','--dialect=sqlite','--schema=./tests/.tmp/override-compat/schema.ts','--out=./tests/.tmp/override-compat/migrations'],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  console.log(result.stdout.trim());
} finally { await rm(temp,{recursive:true,force:true}); }
console.log('PASS: fflate gzip, Satori SVG, Drizzle TypeScript schema'+(pkg.dependencies.exceljs?', ExcelJS XLSX roundtrip':''));

