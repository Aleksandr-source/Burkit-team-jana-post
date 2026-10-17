import {readFile,appendFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
process.env.ASAR_AI_DISABLED='0';process.env.ASAR_AI_THREADS='2';
const out=resolve('evaluation/runs/2026-10-17-02-model');
const {startLocalAI}=await import(pathToFileURL(resolve('scripts/start-ai.mjs')));
const {knowledge}=await import(pathToFileURL(resolve('server/knowledge.mjs')));
const cases=[];
for(const lang of ['ru','kk']){
 const a=knowledge.find(x=>x.id==='leave-days').content[lang].slice(0,35);
 const b=knowledge.find(x=>x.id==='leave-submit').content[lang].slice(0,35);
 const q=lang==='ru'?'Как считаются дни отпуска?':'Демалыс күндері қалай есептеледі?';
 for(const position of [1,2])cases.push({id:`count-${lang}-position${position}`,lang,question:q,choices:position===1?[a,b]:[b,a],expected:position});
 cases.push({id:`absent-${lang}`,lang,question:lang==='ru'?'Когда выплачивают отпускные?':'Демалыс ақысы қашан төленеді?',choices:[a,b],expected:0});
}
await writeFile(out+'/selector-control-cases.json',JSON.stringify(cases,null,2));
let child;
try{
 child=await startLocalAI();const config=JSON.parse(await readFile('.local-ai/runtime.json','utf8'));
 for(let repeat=1;repeat<=3;repeat++)for(const c of cases){
 const request={model:'asar-hr-local',temperature:0,max_tokens:3,stream:false,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:'Select evidence number. None: 0.'},{role:'user',content:`${c.question.slice(0,80)}\n${c.choices.map((x,i)=>`${i+1}: ${x}`).join('\n')}`}],response_format:{type:'json_object',schema:{type:'integer',enum:[0,1,2]}}};
 const t=performance.now();const r=await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});const response=await r.json();
 let actual=null;try{actual=JSON.parse(response.choices[0].message.content)}catch{}
 const row={...c,repeat,request,response,http_status:r.status,actual,correct:actual===c.expected,elapsed_ms:performance.now()-t};
 await appendFile(out+'/selector-control-results.jsonl',JSON.stringify(row)+'\n');console.log(c.id,repeat,actual,row.correct);
 }
}finally{if(child)child.kill('SIGTERM')}
