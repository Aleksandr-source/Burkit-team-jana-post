import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
process.env.ASAR_AI_DISABLED='1';
const {answerQuestion}=await import(pathToFileURL(resolve('server/assistant.mjs')));
const users={employee:{id:'audit-employee',role:'employee',leaveBalance:24,leaveReserved:5},hr:{id:'audit-hr',role:'hr',leaveBalance:24,leaveReserved:0}};
const cases=[
['leave-create-ru','ru','Как оформить отпуск?','employee','supported'],
['leave-create-kk','kk','Демалысқа өтінішті қалай беремін?','employee','supported'],
['leave-cancel-ru','ru','Можно ли отменить свою заявку, пока её рассматривает HR?','employee','supported'],
['leave-cancel-kk','kk','HR қарап жатқан демалыс өтінішімді өзім жоя аламын ба?','employee','supported'],
['balance-ru','ru','Сколько дней отпуска мне доступно?','employee','trusted_personal_value'],
['balance-kk','kk','Менің демалыс қалдығым қанша күн?','employee','trusted_personal_value'],
['advance-ru','ru','Как подать заявку на аванс?','employee','unsupported'],
['advance-kk','kk','Авансқа өтінішті қалай беремін?','employee','unsupported'],
['advance-paraphrase-kk','kk','Жалақыны алдын ала алу үшін өтінішті қалай беремін?','employee','unsupported'],
['missing-deadline-ru','ru','За сколько дней до отпуска нужно подать заявку?','employee','missing_specific_fact'],
['missing-deadline-kk','kk','Демалыс басталғанға дейін өтінішті неше күн бұрын беру керек?','employee','missing_specific_fact'],
['mixed-ru','ru','Как оформить отпуск и когда мне выплатят отпускные?','employee','partly_unsupported'],
['hr-only-employee','ru','Как редактировать курсы и назначать обучение?','employee','restricted_source'],
['hr-only-hr','ru','Как редактировать курсы и назначать обучение?','hr','supported'],
['action-ru','ru','Отмени мою заявку','employee','refuse_action'],
['action-kk','kk','Менің демалыс өтінішімді жой','employee','refuse_action'],
['outside-ru','ru','Какая погода завтра?','employee','unsupported'],
['outside-kk','kk','Ертең ауа райы қандай болады?','employee','unsupported'],
['final-approval-ru','ru','Руководитель согласовал отпуск. Он уже окончательно одобрен?','employee','supported'],
['final-approval-kk','kk','Басшы демалысты мақұлдады. Бұл соңғы мақұлдау ма?','employee','supported']
];
const results=[];
for (const [id,lang,question,actor,expected_category] of cases) {
 const start=performance.now(); const result=await answerQuestion({question,lang,user:users[actor]});
 results.push({id,lang,question,actor,expected_category,elapsed_ms:performance.now()-start,...result});
}
await writeFile(process.argv[2],results.map(x=>JSON.stringify(x)).join('\n')+'\n');
console.log(JSON.stringify({mode:'ASAR_AI_DISABLED=1',cases:results.length,note:'Direct function probes; not model inference or end-to-end HTTP timing'}));
