import './environment.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const production=process.argv.includes('--production');
const children=[];
function start(args,extra={},critical=true) {const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,...extra}});children.push(child);child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>{if(!stopping&&critical&&code!==0)stop(code||1);});return child;}
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children){
  if(child.exitCode!==null||child.signalCode!==null)continue;
  if(process.platform==='win32'&&child.pid){
    // Windows SIGTERM terminates the Node wrapper immediately, so explicitly
    // terminate its llama-server descendant as part of the same process tree.
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    killer.on('error',()=>child.kill('SIGTERM'));
  }else child.kill('SIGTERM');
}setTimeout(()=>process.exit(code),process.platform==='win32'?1500:400).unref();}
if(existsSync(resolve(root,'.local-ai'))&&process.env.ASAR_DISABLE_AI!=='1')start(['scripts/start-ai.mjs'],{},false);
start(['server/index.mjs'],{PORT:production?(process.env.PORT||'3000'):(process.env.API_PORT||'3001')});
if(!production)start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3000','--strictPort']);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
