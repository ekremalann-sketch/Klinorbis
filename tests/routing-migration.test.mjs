import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

test('0014 eski birim ve personel kayıtlarını korur; yalnız yönlendirme tabloları eklenir',async()=>{
 const db=new DatabaseSync(':memory:');
 try {
  const files=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f<'0014_'))db.exec((await readFile('drizzle/'+file,'utf8')).replaceAll('--> statement-breakpoint',''));
  db.prepare("INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)").run('migration@simulation.invalid','Personel S-01','unit_manager',Date.now());
  db.exec("INSERT INTO unit_memberships(email,unit_code,unit_role,can_manage_tickets,can_read_calls,active) VALUES('migration@simulation.invalid','BTI','Birim Sorumlusu',1,1,1)");
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const before=new Map(tables.map(t=>[t.name,db.prepare(`SELECT * FROM "${t.name}"`).all()]));
  db.exec((await readFile('drizzle/0014_birim_yonlendirme.sql','utf8')).replaceAll('--> statement-breakpoint',''));
  for(const table of tables){
   assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table.name).sql,table.sql);
   assert.deepEqual(db.prepare(`SELECT * FROM "${table.name}"`).all(),before.get(table.name),table.name);
  }
  for(const table of ['routing_rules','service_requests'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 }finally{db.close()}
});
