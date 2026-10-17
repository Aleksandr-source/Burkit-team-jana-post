import {readFile,writeFile} from 'node:fs/promises';import{pathToFileURL}from'node:url';import{resolve}from'node:path';import{createHash}from'node:crypto';
const out=resolve('evaluation/runs/2026-10-17-04-candidates');
const {knowledge,knowledgeForRole}=await import(pathToFileURL(resolve('server/knowledge.mjs')));
const prior=JSON.parse(await readFile('evaluation/runs/2026-10-17-03-full-evidence/validated/cases.json','utf8'));
const prompts=JSON.parse(await readFile('evaluation/runs/2026-10-17-03-full-evidence/validated/configs.json','utf8')).prompts;
const positive=[
 ['rejection-reason','leave-decisions','leave-balance','employee','Должен ли руководитель объяснить отказ в отпуске и увижу ли я причину?','Басшы демалыстан бас тарту себебін көрсетуі керек пе және мен оны көре аламын ба?'],
 ['approved-cancel','leave-decisions','leave-submit','employee','Отпуск уже окончательно одобрен. Могу ли я отменить его сам или надо обратиться в HR?','Демалысым соңғы рет мақұлданды. Оны өзім жоя аламын ба, әлде HR маманына жүгінуім керек пе?'],
 ['overlap','leave-days','leave-balance','employee','Можно ли отправить новую заявку с датами, пересекающимися с уже одобренным отпуском?','Күндері мақұлданған демалыспен қабаттасатын жаңа өтініш беруге бола ма?'],
 ['quiz-retry','academy-learning','onboarding','employee','Не набрал проходной балл в тесте курса. Разрешена ли повторная попытка?','Курс тестінде өту балын жинамадым. Қайта тапсыруға бола ма?'],
 ['profile-error','onboarding','leave-balance','employee','В кабинете неверно указаны моя должность и подразделение. К кому обращаться?','Жеке кабинетте лауазымым мен бөлімшем қате көрсетілген. Кімге хабарласуым керек?'],
 ['manager-self','manager-review','leave-days','manager','Я руководитель. Можно ли согласовать собственную заявку вместо моего руководителя?','Мен басшымын. Өз өтінішімді өз басшымның орнына мақұлдай аламын ба?']
];
const negative=[
 ['advance-eligibility','leave-submit','leave-balance','Кто имеет право на аванс: только штатные сотрудники или также стажёры?','Авансты тек штаттағы қызметкерлер ала ма, әлде тағылымдамадан өтушілер де ала ала ма?'],
 ['minimum-tenure','leave-days','leave-submit','Сколько месяцев нужно отработать, чтобы впервые получить отпуск?','Алғаш рет демалыс алу үшін неше ай жұмыс істеу керек?'],
 ['certificate','academy-learning','hr-guide','Сколько лет действует сертификат после завершения курса?','Курсты аяқтағаннан кейін сертификат неше жыл жарамды болады?'],
 ['hr-number','onboarding','assistant-limits','Назови точный номер телефона HR для консультации.','Кеңес алу үшін HR бөлімінің нақты телефон нөмірін айт.'],
 ['file-size','leave-submit','privacy','Какой максимальный размер файла разрешён во вложении к заявке?','Өтінішке тіркелетін файлдың ең үлкен рұқсат етілген көлемі қандай?'],
 ['law-number','leave-days','demo-scope','Какой номер статьи закона устанавливает описанный порядок расчёта?','Осы есептеу тәртібін заңның қай нөмірлі бабы белгілейді?']
];
function docs(ids,lang,role){return ids.map(id=>{const d=knowledgeForRole(role).find(x=>x.id===id);if(!d)throw Error('ACL '+id);return{id,title:d.title[lang],version:d.version,text:d.content[lang]}})}
const controls=[];
for(const lang of ['ru','kk']){
 for(const [topic,target,distractor,role,ru,kk]of positive)for(const position of [1,2])controls.push({id:`new-${topic}-${lang}-p${position}`,topic,split:'new_control',lang,role,question:lang==='ru'?ru:kk,expected:position,expected_source:target,evidence:docs(position===1?[target,distractor]:[distractor,target],lang,role)});
 for(const [topic,a,b,ru,kk]of negative){const role=topic==='certificate'?'hr':'employee';controls.push({id:`new-${topic}-${lang}`,topic,split:'new_control',lang,role,question:lang==='ru'?ru:kk,expected:0,expected_source:null,evidence:docs([a,b],lang,role)})}
}
await writeFile(out+'/existing-cases.json',JSON.stringify(prior,null,2));await writeFile(out+'/new-control-cases.json',JSON.stringify(controls,null,2));await writeFile(out+'/knowledge-snapshot.json',JSON.stringify(knowledge,null,2));
const protocol={prompts,configs:[{id:'deterministic',temperature:0,max_tokens:16,seed:42},{id:'sampled',temperature:0.7,top_p:0.8,top_k:20,min_p:0,max_tokens:16,seed:42}],thinking:false,threads:2,context:2048,parallel:1,quantization:'Q4_K_M',development:'existing-cases split=dev; two configurations, same for both models',test:'existing holdout + new_control, selected configuration per model, 2 repeats',selection:'Development: maximum worst-language accuracy, then overall, then lower p95. Compare final candidates only if gates pass; prefer smaller verified weights if both pass.',gates:{accuracy_each_language_each_test_split_min:0.90,absent_fact_recall:1,invalid_outputs:0,max_observed_seconds:10},score:'Exact integer 0/1/2 equals gold:100, otherwise0. Not full natural-language answer rubric.',citations:'Renderer uses only selected allowed source with id/version and verbatim text; correct existence is separate from relevance.',cleanup:'Only after suitable winner: remove losing experimental weights and old Qwen3.5 weights plus downloaded runtime archive; retain shared runtime and all test evidence. No winner: retain weights and report no accepted model.'};
await writeFile(out+'/protocol.json',JSON.stringify(protocol,null,2));await writeFile(out+'/dataset-manifest.json',JSON.stringify({frozen_at:new Date().toISOString(),existing_cases:prior.length,new_cases:controls.length,existing_sha256:createHash('sha256').update(JSON.stringify(prior)).digest('hex'),new_sha256:createHash('sha256').update(JSON.stringify(controls)).digest('hex')},null,2));console.log('Frozen:',prior.length,controls.length);
