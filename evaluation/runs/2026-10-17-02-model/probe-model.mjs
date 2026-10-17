import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const out=resolve('evaluation/runs/2026-10-17-02-model');
process.env.ASAR_AI_DISABLED='0';
process.env.ASAR_AI_THREADS='2';
const nativeFetch=globalThis.fetch;
let calls=[];
globalThis.fetch=async (url,opts)=>{
 if(!String(url).endsWith('/v1/chat/completions')) return nativeFetch(url,opts);
 const start=performance.now();
 const entry={request:JSON.parse(opts.body)};calls.push(entry);
 try{const r=await nativeFetch(url,opts);entry.http_status=r.status;entry.response=await r.clone().json();entry.elapsed_ms=performance.now()-start;return r;}
 catch(e){entry.elapsed_ms=performance.now()-start;entry.error=String(e);throw e;}
};
const {startLocalAI}=await import(pathToFileURL(resolve('scripts/start-ai.mjs')));
const {answerQuestion,getAIStatus}=await import(pathToFileURL(resolve('server/assistant.mjs')));
const t=performance.now();let child;let app;
try{
 child=await startLocalAI();
 const status=await getAIStatus();
 await writeFile(out+'/startup.json',JSON.stringify({elapsed_ms:performance.now()-t,status,threads:2,context:2048,parallel:1,gpu_layers:0},null,2));
 if(!status.ready) throw Error('Model not ready');
 const cases=(await readFile('evaluation/runs/2026-10-17-01/fallback-results.jsonl','utf8')).trim().split('\n').map(JSON.parse);
 const users={employee:{id:'audit-employee',role:'employee',leaveBalance:24,leaveReserved:5},hr:{id:'audit-hr',role:'hr',leaveBalance:24,leaveReserved:0}};
 for(let repeat=1;repeat<=3;repeat++) for(const c of cases){
  calls=[];const start=performance.now();
  const result=await answerQuestion({question:c.question,lang:c.lang,user:users[c.actor]});
  const entry={repeat,id:c.id,lang:c.lang,question:c.question,actor:c.actor,expected_category:c.expected_category,elapsed_ms:performance.now()-start,...result,model_calls:calls};
  await appendFile(out+'/model-results.jsonl',JSON.stringify(entry)+'\n');
  console.log(JSON.stringify({repeat,id:c.id,mode:result.mode,elapsed_ms:entry.elapsed_ms,model_calls:calls.length}));
 }
 const {createApplication}=await import(pathToFileURL(resolve('server/app.mjs')));
 const password='Isolated-model-eval-only-2026!';
 app=createApplication({dataDir:out+'/http-data',seed:true,demoPassword:password});
 await new Promise((done,fail)=>{app.server.once('error',fail);app.server.listen(0,'127.0.0.1',done)});
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const cookies={};
 for(const actor of ['employee','hr']){
  const r=await nativeFetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:actor+'@asar.demo',password})});
  if(r.status!==200)throw Error('Login failed '+r.status);
  cookies[actor]=r.headers.get('set-cookie').split(';')[0];
 }
 const bootstrap=await nativeFetch(origin+'/api/bootstrap',{headers:{Cookie:cookies.employee}});
 const trusted=(await bootstrap.json()).user;
 await writeFile(out+'/http-trusted-context.json',JSON.stringify({leaveBalance:trusted.leaveBalance,leaveReserved:trusted.leaveReserved},null,2));
 for(const c of cases){
  calls=[];const start=performance.now();
  const r=await nativeFetch(origin+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookies[c.actor]},body:JSON.stringify({question:c.question,lang:c.lang})});
  const result=await r.json();
  const entry={id:c.id,lang:c.lang,question:c.question,actor:c.actor,http_status:r.status,elapsed_ms:performance.now()-start,...result,model_calls:calls};
  await appendFile(out+'/http-results.jsonl',JSON.stringify(entry)+'\n');
  console.log(JSON.stringify({http:true,id:c.id,status:r.status,mode:result.mode,elapsed_ms:entry.elapsed_ms}));
 }
 await writeFile(out+'/completed.json',JSON.stringify({complete:true,cases:60,finished_at:new Date().toISOString()}));
}finally{if(app){await new Promise(done=>app.server.close(done));app.close();}if(child)child.kill('SIGTERM');}
