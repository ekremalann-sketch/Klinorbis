import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export function validateCatalog(catalog){
 if(catalog.version!==1||!Array.isArray(catalog.controls)||catalog.controls.length===0)throw new Error('Kontrol kataloğu eksik.');
 const ids=new Set();
 for(const c of catalog.controls){
  if(!/^(LLM\d{2}|ASI\d{2}|DATA\d{2})$/.test(c.id)||ids.has(c.id))throw new Error('Kontrol kimliği geçersiz veya yinelenmiş.');
  ids.add(c.id);
  for(const field of ['category','name','risk','requiredControl','verification'])if(typeof c[field]!=='string'||!c[field].trim())throw new Error('Kontrol tanımı eksik.');
  if(c.status!=='UNVERIFIED'||!Array.isArray(c.evidence)||c.evidence.length)throw new Error('Başlangıç kataloğu kanıtlanmış koruma iddiası içeremez.');
  if(!c.sourceRefs?.length||c.sourceRefs.some(ref=>!catalog.sources?.[ref]?.startsWith('https://')))throw new Error('Kontrol kaynağı eksik.');
 }
 return catalog;
}

const patterns=[
 ['AI_PROVIDER','Yapay zekâ sağlayıcı/istemci adayı',/openai|anthropic|claude|generativelanguage|bedrock|azure.?ai/i],
 ['VECTOR_RAG','Vektör veya belge arama adayı',/embedding|vectorize|pgvector|pinecone|weaviate|retriev|\bRAG\b/i],
 ['DATABASE','Veritabanı erişimi adayı',/drizzle|postgres|sqlite|D1Database|SELECT\s|row.level.security/i],
 ['AGENT_TOOL','Ajan, araç veya kalıcı bellek adayı',/\bMCP\b|tool_call|function_call|agent|memory|context/i],
 ['DATA_TRANSFER','Dış aktarım veya entegrasyon adayı',/\bfetch\s*\(|axios|webhook|export|backup|telemetry|sentry/i]
];
export function observeSources(entries){
 return patterns.map(([id,label,re])=>({id,label,files:entries.filter(e=>re.test(e.content)).map(e=>e.path).sort()}));
}

const safe=value=>String(value??'').replace(/[^\p{L}\p{N} ._:/-]/gu,'_').slice(0,240);
export function buildReport(catalog,signals,sha,skipped=[]){
 validateCatalog(catalog);
 if(!/^[a-f0-9]{40,64}$/.test(sha))throw new Error('Geçerli kaynak SHA bulunamadı.');
 return {version:1,sourceSha:sha,generatedAt:new Date().toISOString(),securityVerdict:'NOT_ASSESSED',verifiedControls:0,unverifiedControls:catalog.controls.length,warning:'Bu rapor envanter ve inceleme kontrol listesidir. Eşleşme açık kanıtı değildir; eşleşme yokluğu güvenlik kanıtı değildir. Bulut/hesap/sözleşme ayarları ve çalışma zamanı denenmedi.',signals:signals.map(s=>({id:s.id,label:s.label,files:s.files.map(safe)})),skippedFiles:skipped.map(safe),controls:catalog.controls.map(c=>({id:c.id,name:c.name,risk:c.risk,requiredControl:c.requiredControl,verification:c.verification,status:'UNVERIFIED',evidence:[],sources:c.sourceRefs.map(r=>catalog.sources[r])}))};
}
export function markdownReport(report){
 const lines=['# Yapay zekâ, veritabanı ve veri aktarımı inceleme raporu','',`Kaynak SHA: ${report.sourceSha}`,`Kanıtlı kontrol: ${report.verifiedControls}/${report.controls.length}; güvenlik kararı: İNCELENMEDİ.`,report.warning,'','## Kaynakta görülen inceleme yüzeyleri'];
 for(const s of report.signals)lines.push(`- ${safe(s.label)}: ${s.files.length} dosya. ${s.files.slice(0,30).join(', ')}${s.files.length>30?' (ilk 30)':''}`);
 lines.push(`Atlanan kaynak dosyası: ${report.skippedFiles.length}.`,'','## Tek tek kontrol listesi','','| Kimlik / risk | Gereken güvenlik koşulu | Nasıl doğrulanacak? | Durum |','|---|---|---|---|');
 for(const c of report.controls)lines.push(`| ${safe(c.id)} ${safe(c.name)} | ${safe(c.requiredControl)} | ${safe(c.verification)} | KANIT YOK |`);
 lines.push('','## Sınırlar','Kaynak metinleri, anahtarlar, promptlar, müşteri/hasta kayıtları ve hesap değerleri bu rapora alınmaz. Yalnız izlenen Git kaynaklarının sınırlı metin taraması yapılır; geçmiş sır taraması ayrı workflowdadır. Bir kontrolün uygulanamaz sayılması da gerekçeli inceleme ister.','');
 return lines.join('\n');
}

export function readSourceSnapshot(root,sha){
 if(!/^[a-f0-9]{40,64}$/.test(sha))throw new Error('Geçersiz kaynak SHA.');
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
 const objects=git(['ls-tree','-rz','--full-tree',sha]).split('\0').filter(Boolean);
 const entries=[],skipped=[];
 for(const object of objects){
  const tab=object.indexOf('\t');
  if(tab<0)throw new Error('Git ağaç kaydı geçersiz.');
  const [mode,type,oid]=object.slice(0,tab).split(' '),path=object.slice(tab+1);
  if(!/\.(?:[cm]?js|tsx?|jsx|jsonc?|ya?ml|toml|sql)$/.test(path)||/(^|\/)(node_modules|dist|build|\.git|\.security)(\/|$)/.test(path)||path==='scripts/ai-data-review.mjs'||path==='scripts/ai-data-review.test.mjs')continue;
  if(!['100644','100755'].includes(mode)||type!=='blob'||!/^[a-f0-9]{40,64}$/.test(oid)){skipped.push(path);continue;}
  const size=Number(git(['cat-file','-s',oid]).trim());
  if(!Number.isSafeInteger(size)||size<0||size>1024*1024){skipped.push(path);continue;}
  entries.push({path,content:execFileSync('git',['cat-file','blob',oid],{cwd:root,encoding:'utf8',maxBuffer:1024*1024})});
 }
 return {entries,skipped};
}
function run(){
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
 const catalog=JSON.parse(readFileSync(join(root,'.security','ai-data-controls.json'),'utf8'));
 const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const {entries,skipped}=readSourceSnapshot(root,sha);
 const report=buildReport(catalog,observeSources(entries),sha,skipped);
 process.stdout.write(process.argv.includes('--json')?JSON.stringify(report,null,2)+'\n':markdownReport(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{run();}catch{process.stderr.write('AI/veri inceleme envanteri oluşturulamadı. Bu sonuç güvenli veya temiz değildir.\n');process.exitCode=1;}
}
