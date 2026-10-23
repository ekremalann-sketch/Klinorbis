import {readFile} from 'node:fs/promises';
import {createArtifactWorker} from './artifact-runtime.mjs';
const [workerPath,hostingPath]=process.argv.slice(2);
if(!workerPath||!hostingPath)throw Error('Worker ve manifest yolları gerekli.');
const hosting=JSON.parse(await readFile(hostingPath,'utf8'));
if(!hosting.project_id)throw Error('Sites proje kimliği eksik.');
const mf=await createArtifactWorker(workerPath);
try{const r=await mf.dispatchFetch('http://localhost/');if(r.status!==200)throw Error('Worker ana sayfa doğrulaması başarısız: '+r.status+' '+(await r.text()).slice(0,2500));const body=await r.text();if(!body.includes('KLINORBIS'))throw Error('Worker beklenen uygulama içeriğini üretmedi.');}finally{await mf.dispose();}

