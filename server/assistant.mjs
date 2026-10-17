import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_MODEL } from '../scripts/ai-model.mjs';
import { knowledgeForRole, knowledgeSource } from './knowledge.mjs';

const langOf = (lang) => ['ru', 'kk', 'en'].includes(lang) ? lang : 'ru';
const local = (lang, ru, kk, en) => ({ ru, kk, en })[lang];
const MODEL = AI_MODEL.label;
const stateFile = fileURLToPath(new URL('../.local-ai/runtime.json', import.meta.url));
let generating = false;

// Never accept a caller-supplied URL or model endpoint. Model traffic can only
// reach the local llama.cpp process started by scripts/start-ai.mjs.
async function runtime() {
  if (process.env.ASAR_AI_DISABLED === '1' || process.env.ASAR_DISABLE_AI === '1') return null;
  try {
    const config = JSON.parse(await readFile(stateFile, 'utf8'));
    if (config.model !== AI_MODEL.name || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535
      || typeof config.key !== 'string' || !/^[a-f0-9]{64}$/.test(config.key)) return null;
    return { url: `http://127.0.0.1:${config.port}`, key: config.key };
  } catch { return null; }
}

export async function getAIStatus() {
  const config = await runtime();
  if (config) {
    try {
      const response = await fetch(`${config.url}/v1/models`, {
        headers: { Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(700), redirect: 'error',
      });
      if (response.ok) {
        const body = await response.json();
        if (body.data?.some((item) => item.id === 'asar-hr-local')) return { ready: true, engine: 'llama.cpp · CPU · local', model: MODEL };
      }
    } catch { /* Knowledge search remains available while the local model loads. */ }
  }
  return { ready: false, engine: 'knowledge_search', model: MODEL };
}

function refuse(lang, reason = 'unknown') {
  const answer = reason === 'privacy'
    ? local(lang,
      'Я не раскрываю персональные данные коллег и не выполняю кадровые действия из чата. Свои данные смотрите в личном кабинете, разрешённые данные команды — в соответствующем разделе. Для особого запроса обратитесь в HR.',
      'Мен әріптестердің жеке деректерін ашпаймын және чаттан кадрлық әрекет жасамаймын. Өз деректеріңізді жеке кабинеттен, команданың рұқсат етілген деректерін тиісті бөлімнен қараңыз. Арнайы сұрақ бойынша HR маманына хабарласыңыз.',
      'I cannot disclose colleagues’ personal data or perform personnel actions from chat. View your own data in your dashboard and permitted team data in the relevant section. Contact HR for a specific request.')
    : local(lang,
      'В доступной демонстрационной базе знаний нет надёжного ответа на этот вопрос. Я не буду придумывать кадровое правило. Уточните вопрос или обратитесь в HR через раздел «Сотрудники» / к своему руководителю.',
      'Қолжетімді демонстрациялық білім базасында бұл сұраққа сенімді жауап жоқ. Мен кадрлық ереже ойлап таппаймын. Сұрақты нақтылаңыз немесе «Қызметкерлер» бөлімі арқылы HR маманына не басшыңызға хабарласыңыз.',
      'The available demonstration knowledge base does not contain a reliable answer to this question. I will not invent an employment policy. Rephrase the question or contact HR through People / your manager.');
  return { answer, sources: [], mode: 'refusal' };
}

const normalize = (value) => value.toLowerCase().normalize('NFKC').replace(/ё/g, 'е');
const groups = [
  { stems: ['отпуск', 'демалыс', 'leave', 'vacation', 'holiday'], ids: ['leave-submit', 'leave-days', 'leave-balance', 'leave-decisions'] },
  { stems: ['подат', 'оформ', 'созда', 'өтініш', 'request', 'apply', 'submit'], ids: ['leave-submit'] },
  { stems: ['счита', 'рассч', 'календар', 'выходн', 'праздник', 'күн', 'count', 'weekend', 'inclusive', 'days'], ids: ['leave-days'] },
  { stems: ['остат', 'резерв', 'баланс', 'спис', 'қалдық', 'резерв', 'balance', 'reserv', 'available', 'deduct'], ids: ['leave-balance'] },
  { stems: ['соглас', 'отказ', 'отмен', 'статус', 'одобр', 'мақұл', 'бас тарт', 'жою', 'cancel', 'reject', 'approv', 'status'], ids: ['leave-decisions'] },
  { stems: ['обуч', 'курс', 'академ', 'тест', 'урок', 'прогресс', 'оқу', 'сабақ', 'academy', 'learn', 'course', 'quiz', 'lesson', 'progress'], ids: ['academy-learning'] },
  { stems: ['перв', 'нович', 'онборд', 'алғаш', 'onboard', 'first day', 'new employee'], ids: ['onboarding'] },
  { stems: ['доступ', 'рол', 'безопас', 'защит', 'құқық', 'рөл', 'access', 'role', 'privacy', 'secur'], ids: ['privacy'] },
  { stems: ['руковод', 'басшы', 'manager'], ids: ['manager-review', 'leave-decisions'] },
  { stems: ['редактор', 'редакт', 'назнач', 'құру', 'өңде', 'тағай', 'editor', 'edit', 'assign', 'create employee'], ids: ['hr-guide'] },
  { stems: ['демо', 'настоящ', 'реальн', 'демонстрац', 'нақты', 'fiction', 'demo', 'real polic'], ids: ['demo-scope'] },
  { stems: ['ассистент', 'источник', 'жауап', 'дереккөз', 'assistant', 'source', 'unknown'], ids: ['assistant-limits'] },
];
const stopWords = new Set(['как', 'что', 'для', 'мне', 'мой', 'мои', 'меня', 'это', 'the', 'how', 'and', 'can', 'with', 'you', 'are', 'мен', 'үшін', 'бұл', 'қалай']);
function retrieve(question, allowed, lang) {
  allowed = allowed.filter(document => document.kind !== 'demo_script');
  const normalized = normalize(question);
  const tokens = normalized.match(/[\p{L}\p{N}]{3,}/gu)?.filter((token) => !stopWords.has(token)) || [];
  const scores = new Map(allowed.map((item) => [item.id, 0]));
  let knownTopic = false;
  for (const group of groups) {
    if (!group.stems.some((stem) => normalized.includes(stem))) continue;
    knownTopic = true;
    for (const id of group.ids) if (scores.has(id)) scores.set(id, scores.get(id) + (id === 'hr-guide' ? 8 : 4));
  }
  if (!knownTopic) return [];
  return allowed.map((item) => {
    const title = normalize(item.title[lang]);
    const content = normalize(item.content[lang]);
    const score = scores.get(item.id) + tokens.reduce((sum, token) => sum + (title.includes(token) ? 2 : content.includes(token) ? 0.4 : 0), 0);
    return { item, score };
  }).filter(({ score }) => score >= 4).sort((a, b) => b.score - a.score).slice(0, 2).map(({ item }) => item);
}

function isPrivateOrAction(question) {
  const privateIntent = /(?:отпуск|остат|заявк|телефон|почт|leave|balance|request)/iu.test(question);
  const namedSubject = /(?:^|\s)у\s+(?!меня(?:\s|[?.!,]|$)|нас(?:\s|[?.!,]|$)|руководителя(?:\s|[?.!,]|$))[\p{L}]+/iu.test(question)
    || /(?:[\p{L}]+['’]s)\s+(?:leave|balance|requests)/iu.test(question);
  return (privateIntent && namedSubject)
    || /(?:игнорируй|забудь|ignore|forget).*(?:инструкц|правил|instruct|system)|(?:system\s*prompt|системн.*промпт|jailbreak)|(?:повыс|сделай|назначь).*(?:роль|админ|меня\s+hr)|(?:approve|cancel|delete|change)\s+(?:my|this|the)\s+(?:request|role)|(?:отмени|одобри|удали)\s+(?:мою|эту|все)\s+заявк|(?:жалақы|зарплат|salary|password|парол|құпиясөз|токен|api.?key)|(?:чуж|коллег|других\s+сотрудник|other\s+employee|colleague|әріптес).*(?:данн|отпуск|заявк|телефон|email|balance|request|data|дерек)|(?:отпуск|остаток|заявк|leave|balance).*(?:иванов|айгерим|алихан|мария|иван|\bof\s+[a-z]+\s+[a-z]+)|(?:покажи|список|выведи|show|list).*(?:сотрудник|команд|employees|team|қызметкер)/iu.test(question);
}

function ownBalance(question, user, lang, allowed) {
  const q = normalize(question);
  if (!/(?:остат|баланс|резерв|сколько.*(?:дн|отпуск)|қалдық|қанша.*күн|balance|days.*(?:left|available)|available.*days)/u.test(q)
    || /(?:как\s+(?:счит|рассчит|начисл)|how.*(?:calculat|count)|қалай.*есеп)/u.test(q)
    || !/(?:^|[^\p{L}])(?:мой|мои|моего|мне|меня|менің|маған|my|to me|do i|i have)(?=$|[^\p{L}])/u.test(q)) return null;
  if (!Number.isFinite(user?.leaveBalance) || !Number.isFinite(user?.leaveReserved)) return null;
  const balance = Math.max(0, user.leaveBalance), reserved = Math.max(0, user.leaveReserved);
  const available = Math.max(0, balance - reserved);
  const document = allowed.find((item) => item.id === 'leave-balance');
  return {
    answer: local(lang,
      `В вашем личном кабинете: остаток — ${balance} дн., зарезервировано — ${reserved} дн., доступно для новой заявки — ${available} дн. Это демонстрационные данные. Дни резервируются при подаче и списываются после окончательного подтверждения HR.`,
      `Жеке кабинетіңізде: қалдық — ${balance} күн, резерв — ${reserved} күн, жаңа өтініш үшін қолжетімді — ${available} күн. Бұл демонстрациялық деректер. Күндер өтініш бергенде резервтеліп, HR соңғы растауынан кейін шегеріледі.`,
      `Your dashboard: balance ${balance} days, reserved ${reserved} days, available for a new request ${available} days. These are demonstration records. Days are reserved on submission and deducted after final HR approval.`),
    sources: [knowledgeSource(document, lang)], mode: 'knowledge_search',
  };
}

function sentencesFrom(documents, lang) {
  return documents.flatMap((document) => (document.content[lang].match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [])
    .map((text) => ({ text: text.trim(), document })).filter(({ text }) => text))
    .map((sentence, index) => ({ ...sentence, number: index + 1 }));
}

// Shared with the isolated evaluation service. The raw output is the actual
// selector number, never a server-composed answer disguised as model JSON.
export async function selectEvidence(question, sentences) {
  const started = performance.now();
  const result = { selected: null, raw_model_output: null, model_context_ids: [], generation_ms: null };
  const config = await runtime();
  if (!config || generating) return { ...result, error: generating ? 'model_busy' : 'model_unavailable' };
  generating = true;
  try {
    // Preserve complete evidence and document boundaries. A 35-character
    // preview can hide the very fact needed to answer or correctly abstain.
    const byDocument = new Map();
    for (const sentence of sentences) {
      const id = sentence.document.id;
      if (!byDocument.has(id)) byDocument.set(id, []);
      byDocument.get(id).push(sentence);
    }
    const choices = [...byDocument.values()].slice(0, 2).map(group => ({
      group, preview: group.map(({ text }) => text).join(' '),
    }));
    result.model_context_ids = [...new Set(choices.flatMap(({ group }) => group.map(({ document }) => document.id)))];
    // Reserve headroom within the 10-second demo target for API/renderer work.
    // A timeout uses the explicitly labelled knowledge-search fallback below.
    const response = await fetch(`${config.url}/v1/chat/completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
        model: 'asar-hr-local', temperature: 0, max_tokens: 16, stream: false,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: 'Выбери номер источника, который содержит ответ на вопрос. Используй только приведённые тексты. Если ответа в них нет, верни 0. Верни только одно число: 0, 1 или 2.' },
          { role: 'user', content: `${question}\n${choices.map(({ preview }, index) => `${index + 1}: ${preview}`).join('\n')}` },
        ],
        response_format: { type: 'json_object', schema: { type: 'integer', enum: [0, ...choices.map((_, index) => index + 1)] } },
      }),
    });
    if (!response.ok) return { ...result, error: 'model_http_error' };
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    result.raw_model_output = typeof content === 'string' ? content : null;
    result.model_request_ms = performance.now() - started;
    // A buffered HTTP duration includes prefill and transport. Only report
    // generation time when the engine actually provides that measurement.
    if (Number.isFinite(data.timings?.predicted_ms) && data.timings.predicted_ms >= 0) result.generation_ms = data.timings.predicted_ms;
    if (data.usage && Number.isInteger(data.usage.prompt_tokens)) result.input_tokens = data.usage.prompt_tokens;
    if (data.usage && Number.isInteger(data.usage.completion_tokens)) result.output_tokens = data.usage.completion_tokens;
    if (typeof content !== 'string' || content.length > 100) return { ...result, error: 'invalid_model_output' };
    const parsed = JSON.parse(content);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > choices.length) return { ...result, error: 'invalid_model_output' };
    return { ...result, selected: parsed === 0 ? [] : choices[parsed - 1].group };
  } catch (error) { return { ...result, error: error instanceof SyntaxError ? 'invalid_model_output' : 'model_connection_error' }; }
  finally { generating = false; }
}

export async function answerQuestion({ question, lang: inputLang, user } = {}) {
  const lang = langOf(inputLang);
  if (!user || !['employee', 'manager', 'hr'].includes(user.role)) return refuse(lang, 'privacy');
  if (typeof question !== 'string' || question.trim().length < 3 || question.length > 1200) return refuse(lang);
  const clean = question.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (isPrivateOrAction(clean)) return refuse(lang, 'privacy');
  const normalized = normalize(clean);
  if (/(?:битко|bitcoin|доллар|рубл|тенге|валют|крипто|cryptocurrenc|exchange\s+rate|\bbtc\b|\busd\b|\beur\b)/u.test(normalized)) return refuse(lang);
  if (/(?:компенсац|больничн|беремен|декрет|увольнен|свадьб|бракосочет|похорон|донор|аванс|страхов|учебн[\p{L}\s]*отпуск|сколько.*(?:положен|в\s+год)|по\s+закону|sick\s+leave|maternity|dismissal|compensation|annual\s+entitlement|wedding|bereave|insurance|salary\s+advance|ауру|өтемақы)/u.test(normalized)) return refuse(lang);
  // Access filtering happens before retrieval, scoring and model invocation.
  const allowed = knowledgeForRole(user.role);
  // A rehearsed demo quote is intentionally distinct from model inference.
  // Only this complete RU question matches; appended instructions do not.
  if (lang === 'ru' && normalized.replace(/[?!.]+$/u, '').trim() === 'как оформить отпуск') {
    const document = allowed.find(item => item.id === 'demo-leave-walkthrough');
    if (document) return { answer: document.content[lang], sources: [knowledgeSource(document, lang)], mode: 'demo_quote' };
  }
  const balance = ownBalance(clean, user, lang, allowed);
  if (balance) return balance;
  const documents = retrieve(clean, allowed, lang);
  if (!documents.length) return refuse(lang);
  const sentences = sentencesFrom(documents, lang);
  const { selected } = await selectEvidence(clean, sentences);
  if (selected?.length === 0) return refuse(lang);
  const mode = selected ? 'local_model' : 'knowledge_search';
  // Output is rendered only from original source text. The model chooses
  // evidence, and cannot fabricate policy text, links, numbers or employees.
  const result = selected || sentences.slice(0, Math.min(6, sentences.length));
  const sourceIds = new Set(result.map(({ document }) => document.id));
  return {
    answer: `${local(lang, 'По демонстрационным правилам:', 'Демонстрациялық ережелер бойынша:', 'According to the demonstration policies:')}\n\n${result.map(({ text }) => text).join(' ')}`.slice(0, 3500),
    sources: documents.filter((item) => sourceIds.has(item.id)).map((item) => knowledgeSource(item, lang)),
    mode,
  };
}
