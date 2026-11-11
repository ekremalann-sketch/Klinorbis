// K1: Transfer kabul/ret kararı yalnız yetkili hekimde; sistem otomatik karar veya yönlendirme üretmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1,loadRoute,setRuntime,browserJson} from './helpers/route-harness.mjs';

const OWNER='owner@klinorbis.test',DOC='doctor@klinorbis.test',AGENT='agent@klinorbis.test';
const {d1,sqlite}=await createD1();setRuntime(d1,{ownerEmail:OWNER});
const now=Date.now();
for(const [e,r] of [[DOC,'clinician'],[AGENT,'call_agent']])sqlite.prepare('INSERT INTO staff_accounts(email,display_label,system_role,active,created_at) VALUES(?,?,?,1,?)').run(e,'Personel SIM',r,now);
const route=await loadRoute('app/api/transfer-decisions/route.ts');
const post=(body,email=DOC)=>route.POST(browserJson('/api/transfer-decisions',body,email));
const row=ref=>sqlite.prepare('SELECT status,decision_code,target_facility_code,decision_detail FROM transfer_requests WHERE reference=?').get(ref);
function seed(ref,alternatives='[]'){sqlite.prepare("INSERT INTO transfer_requests(reference,patient_alias,source_facility_code,target_facility_code,requested_unit_code,resource_code,resource_label,status,alternatives,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'awaiting_decision',?,?,?)").run(ref,'SIM-01','KRM','F01','YOG','ICU_BED','Yoğun bakım yatağı',alternatives,now,now);}

await test('kaynak kod: otomatik kabul/ret/yönlendirme yolu yok',async()=>{
 const src=await readFile('lib/control-tower.ts','utf8');
 assert.doesNotMatch(src,/auto_accepted|auto_rejected|auto_rerouted|rerouteToAlternative/);
 assert.match(src,/status: "awaiting_decision"/);
 const decide=src.slice(src.indexOf('async function decideCapacity'),src.indexOf('async function runScheduledReports'));
 assert.doesNotMatch(decide,/reserved:\s*sql/,'sistem kapasite ayırmaz');
});

await test('yetkili hekim kabul eder; kapasitede görünen kampüsü seçebilir; ikinci karar reddedilir',async()=>{
 seed('XFR-T1',JSON.stringify([{facilityCode:'F02',available:2}]));
 assert.equal((await post({reference:'XFR-T1',decision:'accept',physician:'yanlış'})).status,422);
 assert.equal((await post({reference:'XFR-T1',decision:'accept',physician:'HKM-SIM-01',facilityCode:'F09'})).status,422,'listede olmayan kampüs');
 const r=await post({reference:'XFR-T1',decision:'accept',physician:'HKM-SIM-01',facilityCode:'F02'});assert.equal(r.status,200);
 assert.deepEqual({...row('XFR-T1')}.status,'accepted');assert.equal(row('XFR-T1').target_facility_code,'F02');assert.equal(row('XFR-T1').decision_code,'human_accepted');
 assert.equal((await post({reference:'XFR-T1',decision:'reject',physician:'HKM-SIM-01',reason:'Tekrar'})).status,409);
});

await test('ret gerekçe ister; yetkisiz rol karar veremez',async()=>{
 seed('XFR-T2');
 assert.equal((await post({reference:'XFR-T2',decision:'reject',physician:'HKM-SIM-02'})).status,422);
 assert.equal((await post({reference:'XFR-T2',decision:'accept',physician:'HKM-SIM-02'},AGENT)).status,403);
 assert.equal((await post({reference:'XFR-T2',decision:'reject',physician:'HKM-SIM-02',reason:'Kurgusal: hedefte uygun yatak yok'})).status,200);
 assert.equal(row('XFR-T2').status,'rejected');assert.match(row('XFR-T2').decision_detail,/Gerekçe/);
});
