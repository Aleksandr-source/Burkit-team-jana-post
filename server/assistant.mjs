import { localModelProvider } from './ai/local-model-provider.mjs';
import { knowledgeForRole, knowledgeSource } from './knowledge.mjs';
import { supportedKnowledge, supportedExcerpt } from './knowledge-support.mjs';

const langOf = (lang) => ['ru', 'kk', 'en'].includes(lang) ? lang : 'ru';
const local = (lang, ru, kk, en) => ({ ru, kk, en })[lang];
function refuse(lang, reason = 'unknown') {
  const answer = reason === 'privacy'
    ? local(lang,
      'Я не раскрываю персональные данные коллег и не выполняю кадровые действия из чата. Свои данные смотрите в личном кабинете, разрешённые данные команды — в соответствующем разделе. Для особого запроса обратитесь в HR.',
      'Мен әріптестердің жеке деректерін ашпаймын және чаттан кадрлық әрекет жасамаймын. Өз деректеріңізді жеке кабинеттен, команданың рұқсат етілген деректерін тиісті бөлімнен қараңыз. Арнайы сұрақ бойынша HR маманына хабарласыңыз.',
      'I cannot disclose colleagues’ personal data or perform personnel actions from chat. View your own data in your dashboard and permitted team data in the relevant section. Contact HR for a specific request.')
    : local(lang,
      'В доступной демонстрационной базе знаний нет надёжного ответа на этот вопрос. Я не буду придумывать кадровое правило. Уточните вопрос или нажмите «Передать вопрос HR» — специалист ответит в обращении.',
      'Қолжетімді демонстрациялық білім базасында бұл сұраққа сенімді жауап жоқ. Мен кадрлық ереже ойлап таппаймын. Сұрақты нақтылаңыз немесе «Сұрақты HR-ға жіберу» түймесін басыңыз — маман өтініште жауап береді.',
      'The available demonstration knowledge base does not contain a reliable answer to this question. I will not invent an employment policy. Rephrase the question or click “Send question to HR” — a specialist will reply to your inquiry.');
  return { answer, sources: [], mode: 'refusal' };
}

const normalize = (value) => value.toLowerCase().normalize('NFKC').replace(/ё/g, 'е');
function isPrivateOrAction(question) {
  const privateIntent = /(?:отпуск|остат|заявк|телефон|почт|leave|balance|request)/iu.test(question);
  const namedSubject = /(?:^|\s)у\s+(?!меня(?:\s|[?.!,]|$)|нас(?:\s|[?.!,]|$)|руководителя(?:\s|[?.!,]|$))[\p{L}]+/iu.test(question)
    || /(?:[\p{L}]+['’]s)\s+(?:leave|balance|requests)/iu.test(question);
  return (privateIntent && namedSubject)
    || /(?:игнорируй|забудь|ignore|forget).*(?:инструкц|правил|instruct|system)|(?:system\s*prompt|системн.*промпт|jailbreak)|(?:повыс|сделай|назначь).*(?:роль|админ|меня\s+hr)|(?:approve|cancel|delete|change)\s+(?:my|this|the)\s+(?:request|role)|(?:отмени|одобри|удали)\s+(?:мою|эту|все)\s+заявк|(?:жалақы|зарплат|salary|password|парол|құпиясөз|токен|api.?key)|(?:чуж|коллег|других\s+сотрудник|other\s+employee|colleague|әріптес).*(?:данн|отпуск|заявк|телефон|email|balance|request|data|дерек)|(?:отпуск|остаток|заявк|leave|balance).*(?:иванов|айгерим|алихан|мария|иван|\bof\s+[a-z]+\s+[a-z]+)|(?:покажи|список|выведи|show|list).*(?:сотрудник|команд|employees|team|қызметкер)/iu.test(question);
}

function ownBalance(question, user, lang, allowed) {
  const q = normalize(question);
  // A possessive pronoun in a policy question does not request a personal
  // counter: preserve the requested fact about cancellation or approval.
  if (/отмен|отказ|спис|когда|жой|мақұл|шегер|қашан|cancel|reject|deduct|when/u.test(q)) return null;
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

// Role filtering, refusal rules and rendering remain independent of inference.
export function createAssistant({ modelProvider = localModelProvider } = {}) {
  if (typeof modelProvider?.status !== 'function' || typeof modelProvider?.select !== 'function') {
    throw new TypeError('Model provider must implement status() and select()');
  }
  async function getAIStatus() {
    try { return await modelProvider.status(); }
    catch { return { ready: false, engine: 'knowledge_search', model: modelProvider.model || 'Model' }; }
  }
  // Shared with the isolated evaluation service. The raw output is the actual
  // selector number, never a server-composed answer disguised as model JSON.
  async function selectEvidence(question, sentences) {
    const result = { selected: null, raw_model_output: null, model_context_ids: [], generation_ms: null };
    try {
      // Keep complete sources together so selection cannot lose the fact
      // needed to answer or correctly refuse the question.
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
      const output = await modelProvider.select({ question, previews: choices.map(({ preview }) => preview) });
      const content = output?.raw_model_output;
      result.raw_model_output = typeof content === 'string' ? content : null;
      for (const key of ['model_request_ms', 'generation_ms', 'input_tokens', 'output_tokens']) {
        if (Number.isFinite(output?.[key]) && output[key] >= 0) result[key] = output[key];
      }
      if (typeof content !== 'string' || content.length > 100) return { ...result, error: 'invalid_model_output' };
      const parsed = JSON.parse(content);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > choices.length) return { ...result, error: 'invalid_model_output' };
      return { ...result, selected: parsed === 0 ? [] : choices[parsed - 1].group };
    } catch (error) {
      const known = ['model_busy', 'model_unavailable', 'model_http_error'];
      const code = known.includes(error?.code) ? error.code : error instanceof SyntaxError ? 'invalid_model_output' : 'model_connection_error';
      if (code === 'model_busy' || code === 'model_unavailable') result.model_context_ids = [];
      return { ...result, error: code };
    }
  }

  async function answerQuestion({ question, lang: inputLang, user } = {}) {
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
    const supported = supportedKnowledge(clean, allowed);
    if (!supported.length) return refuse(lang);
    const balance = ownBalance(clean, user, lang, allowed);
    if (balance) return balance;
    const documents = supported.map(item => item.document);
    const sentences = sentencesFrom(documents, lang);
    const { selected } = await selectEvidence(clean, sentences);
    if (selected?.length === 0) return refuse(lang);
    const mode = selected ? 'local_model' : 'knowledge_search';
    // Output is rendered only from original source text. The model chooses
    // evidence, and cannot fabricate policy text, links, numbers or employees.
    const sourceIds = new Set((selected || sentences).map(({ document }) => document.id));
    const evidence = supported.filter(({ document }) => sourceIds.has(document.id));
    return {
      answer: evidence.map(item => supportedExcerpt(item, lang)).join('\n\n'),
      sources: evidence.map(({ document }) => knowledgeSource(document, lang)),
      mode,
    };
  }

  return { getAIStatus, selectEvidence, answerQuestion };
}

// Preserve public imports used by the app, setup command and evaluation server.
const defaultAssistant = createAssistant();
export const { getAIStatus, selectEvidence, answerQuestion } = defaultAssistant;
