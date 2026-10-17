import './environment.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourceMessage, resourcePlan } from './resources.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const production=process.argv.includes('--production');
const plan=resourcePlan();
// Both names remain accepted by earlier distributions of the assistant.
const sharedEnv={...process.env,UV_THREADPOOL_SIZE:process.env.UV_THREADPOOL_SIZE||(plan.profile==='low'?'2':'4')};
if(plan.disabled){sharedEnv.ASAR_AI_DISABLED='1';sharedEnv.ASAR_DISABLE_AI='1';}
const children=[];
function start(args,extra={},critical=true) {
  const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...sharedEnv,...extra},windowsHide:true,detached:process.platform!=='win32'});
  children.push(child);
  child.on('error',error=>{console.error(error.message);if(critical)stop(1);});
  child.on('exit',code=>{if(!stopping&&critical)stop(code||0);});
  return child;
}
let stopping=false;
function signalChild(child,signal){
  if(process.platform==='win32')return child.kill(signal);
  try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')child.kill(signal);}
}
function stop(code=0){if(stopping)return;stopping=true;for(const child of children){
  if(child.exitCode!==null||child.signalCode!==null)continue;
  if(process.platform==='win32'&&child.pid){
    // Windows SIGTERM terminates the Node wrapper immediately, so explicitly
    // terminate its llama-server descendant as part of the same process tree.
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    killer.on('error',()=>child.kill('SIGTERM'));
  }else signalChild(child,'SIGTERM');
}setTimeout(()=>{if(process.platform!=='win32')for(const child of children)signalChild(child,'SIGKILL');process.exit(code);},2500).unref();}
console.log(resourceMessage(plan));
// Start HR immediately. A missing, slow or failed optional AI never takes down
// login, SQLite, requests or Academy. Ready production needs no node_modules.
start([`--max-old-space-size=${plan.nodeHeapMiB}`,'server/index.mjs'],{PORT:production?(process.env.PORT||'3000'):(process.env.API_PORT||'3001')});
if(!production)start(['--max-old-space-size=384','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3000','--strictPort']);
if(existsSync(resolve(root,'.local-ai'))&&!plan.disabled)start(['--max-old-space-size=128','scripts/start-ai.mjs'],{},false);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
