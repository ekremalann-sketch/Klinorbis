import {readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
// Validate the compiled Worker in workerd, where cloudflare: imports are supported.
export async function createArtifactWorker(workerPath='dist/server/index.js'){
const root=dirname(resolve(workerPath));
const files=(await readdir(root,{recursive:true})).filter(f=>f.endsWith('.js')).map(f=>resolve(root,f));
const modules=[resolve(workerPath),...files.filter(f=>f!==resolve(workerPath))].map(path=>({type:'ESModule',path}));
return new Miniflare(convertV4MiniflareOptions({modules,scriptPath:resolve(workerPath),modulesRoot:dirname(resolve(workerPath)),compatibilityDate:'2026-07-02',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],serviceBindings:{ASSETS:()=>new Response('Not Found',{status:404})},port:0}));

}
