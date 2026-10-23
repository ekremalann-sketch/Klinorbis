import test from 'node:test';
import assert from 'node:assert/strict';
import {observeSources,buildReport,markdownReport,validateCatalog} from './ai-data-review.mjs';
const catalog=()=>({version:1,sources:{AI:'https://genai.owasp.org/llm-top-10/'},controls:[{id:'LLM01',category:'AI',name:'Prompt Injection',risk:'Yetkisiz talimat',requiredControl:'Araç yetkisi',verification:'Sentetik reddetme',status:'UNVERIFIED',evidence:[],sourceRefs:['AI']}]});
const sha='a'.repeat(40);
test('kaynak eşleşmesi ham kaynak veya sahte sır değerini rapora taşımaz',()=>{
 const source='openai fetch( SYNTHETIC_CONTENT_DO_NOT_PUBLISH';
 const result=buildReport(catalog(),observeSources([{path:'lib/provider.ts',content:source}]),sha);
 assert.ok(result.signals.find(s=>s.id==='AI_PROVIDER').files.includes('lib/provider.ts'));
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC_CONTENT_DO_NOT_PUBLISH'));
});
test('hiç eşleşme bulunmaması kontrolleri sağlandı yapmaz',()=>{
 const result=buildReport(catalog(),observeSources([]),sha);
 assert.equal(result.verifiedControls,0);assert.equal(result.controls[0].status,'UNVERIFIED');assert.equal(result.securityVerdict,'NOT_ASSESSED');
});
test('kanıtsız geçti iddiası ve yinelenmiş kontrol reddedilir',()=>{
 const c=catalog();c.controls[0].status='VERIFIED';assert.throws(()=>validateCatalog(c));
 const d=catalog();d.controls.push({...d.controls[0]});assert.throws(()=>validateCatalog(d));
});
test('kaynak veya SHA eksikse denetim raporu üretilmez',()=>{
 const c=catalog();c.controls[0].sourceRefs=['UNKNOWN'];assert.throws(()=>validateCatalog(c));
 assert.throws(()=>buildReport(catalog(),[],''));
});
test('dosya adındaki markdown ve satır ekleme rapora talimat katmaz',()=>{
 const r=buildReport(catalog(),[{id:'AI',label:'AI',files:['file\n<img>|[click](bad).ts']}],sha);
 const output=markdownReport(r);assert.ok(!output.includes('<img>'));assert.ok(!output.includes('[click]'));assert.ok(!r.signals[0].files[0].includes('\n'));
});
test('atlanan dosyalar ve tüm kontrol tanımları görünür kalır',()=>{
 const r=buildReport(catalog(),[],sha,['large.sql']);const m=markdownReport(r);
 assert.equal(r.skippedFiles.length,1);assert.ok(m.includes('Atlanan kaynak dosyası: 1'));assert.ok(m.includes('Sentetik reddetme'));assert.ok(m.includes('KANIT YOK'));
});
