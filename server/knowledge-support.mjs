// Explicit coverage of the small product KB. Topic similarity alone is not
// evidence that a document contains the requested fact. Unrecognised aspects
// fail closed, including when inference is unavailable or chooses a source.
// Strip only a leading social greeting; never remove a policy condition or instruction.
const greeting = /^(?:\s*(?:здравствуйте|привет|добрый\s+(?:день|вечер)|доброе\s+утро|сәлеметсіз\s+бе|сәлем|қайырлы\s+(?:күн|таң|кеш)|hello|hi|good\s+(?:morning|afternoon|evening))(?:[\s!,.?:;—-]+|$))+/u;
const normalize = value => value.toLowerCase().normalize('NFKC').replace(/ё/g, 'е').replace(greeting, '');
const courtesy = /^(?:explain|tell)$/u;
const common = /^(?:как|что|где|кто|когда|какой|какие|делать|если|может|своей|собственную|собственный|собственное|уже|ли|можно|могу|мне|мой|мои|мою|моей|меня|мы|нам|наш|наши|это|эти|этот|эта|нужно|надо|нужен|нужна|нужны|в|во|на|по|за|до|от|из|для|при|после|перед|и|или|а|но|не|нет|да|о|об|с|со|к|у|же|только|все|всех|свой|свои|свою|своего|его|ее|их|он|она|я|расскажите|пожалуйста|подскажите|объясните|порядок|jana|janamen|academy|hr|ai|the|a|an|how|what|where|who|when|can|could|do|does|is|are|i|my|me|we|our|your|you|to|of|for|in|on|at|by|with|and|or|it|its|this|that|all|before|after|not|please|about|need|should|will|be|have|only|қалай|қайда|кім|қашан|не|мен|менің|маған|мені|өз|өзімнің|бола|болады|болмайды|ма|ме|ба|бе|па|пе|үшін|және|немесе|керек|қажет|бұл|осы|оны|туралы|кейін|дейін|ғана|бар|жоқ)$/u;
const leave = /отпуск|демалыс|leave|vacation|time off/u;
const course = /курс|обуч|урок|тест|прогрес|сабақ|оқу|оқыт|academy|learn|course|lesson|quiz|progress/u;
const requestTerms = 'заяв|өтін|request';
const leaveTerms = 'отпуск|демалыс|leave|vacation|holiday|time|off';
// Discourse words carry no policy condition. Keep substantive qualifiers in
// the fact vocabulary below; unknown qualifiers must still fail closed.
const discourse = /^(?:с|чего|начать|личн[\p{L}]*|кому|куда|происходит|будет|будут|мой|моя|моем|моему|сво[йяеё]|собствен|число|найти|по|при|не|я|к|в|входит|входят|как|ли|после|когда|теперь|неден|жеке|кабинет|кабинетте|ретінде|өз|ала|алады|аламын|алмай|алмадым|өте|қайта|қай|жерде|кімге|қайдан|мен|ма|ме|бола|болады|керек|қалай|when|where|should|as|am|allowed|will|would|may|happens|happen|receive|receives|again|try|if|up|use|uses|dashboard|a|an|the|my|to|me|do|i|it)$/u;
const cards = [
  {
    id: 'leave-submit', sentences: [0, 1, 3, 4],
    match: q => leave.test(q) && /подат|подач|оформ|созда|отправ|өтініш.*(?:бер|жіб)|(?:бер|жіб).*өтініш|рәсім|apply|submit|request(?:ing)?\s+(?:time\s+off|leave|vacation)|request.*(?:creat|send)|(?:creat|send).*request/u.test(q),
    terms: `${leaveTerms}|${requestTerms}|подат|подач|оформ|созда|отправ|нача|оконча|дат|коммент|влож|добав|остат|доступ|числ|дн|день|дней|провери|кабинет|өтініш|бер|жібер|рәсім|күн|баста|аяқтал|қалдық|рәсім|time|off|apply|appli|submit|creat|send|start|end|date|attach|comment|balance|day`,
  },
  {
    id: 'leave-days', sentences: [0, 1, 2],
    match: q => leave.test(q) && /счит|рассчит|календар|выходн|праздник|суббот|воскресен|есеп|демалыс.*күндері|мереке|сенбі|жексенбі|count|calculat|weekend|holiday|saturday|sunday|inclusive/u.test(q),
    terms: `${leaveTerms}|счит|рассчит|календар|выходн|праздник|суббот|воскресен|включ|дн|день|дней|учитыв|начал|конц|есеп|есеб|күн|мереке|қоса|сенбі|жексенбі|кіре|count|calculat|calendar|weekend|saturday|sunday|inclusive|day|includ|start|end`,
  },
  {
    id: 'leave-days', sentences: [3],
    match: q => /пересеч|пересек|наклад|қабаттас|overlap/u.test(q) && (leave.test(q) || /заяв|өтін|request/u.test(q)),
    terms: `${leaveTerms}|${requestTerms}|пересеч|пересек|наклад|дат|актив|одобр|подат|қабаттас|күн|бер|overlap|date|active|approv|submit`,
  },
  {
    id: 'leave-balance', sentences: [0, 1, 2, 3],
    match: q => /остат|резерв|баланс|спис|қалд|шегер|balance|reserv|deduct|доступ.*дн|дн.*доступ|available.*days|days.*(?:left|available)|қанша.*күн/u.test(q),
    terms: `${leaveTerms}|${requestTerms}|остат|резерв|баланс|спис|доступ|освобожд|отмен|отказ|подтверж|счит|рассчит|посмотр|узна|провери|отобр|дн|день|дней|сколько|қалд|резерв|шегер|босат|қолжет|жой|күн|қанша|есеп|көр|balance|reserv|deduct|availab|releas|cancel|reject|calculat|count|view|check|find|day|left|many`,
  },
  {
    id: 'leave-decisions', sentences: [0, 1, 5],
    match: q => (leave.test(q) || /заяв|өтін|request/u.test(q)) && /соглас|одобр|подтвер|этап|маршрут|статус|решени|истори|коммент|мақұл|келіс|раста|мәртеб|шешім|түсініктеме|тарих|approv|review|status|stage|decision|comment|history/u.test(q),
    terms: `${leaveTerms}|${requestTerms}|соглас|одобр|подтвер|этап|маршрут|статус|руковод|начальник|уйдет|окончател|истори|журнал|решен|коммент|смотр|посмотр|провери|мақұл|келіс|раста|мәртеб|басшы|тарих|шешім|түсініктеме|бойынша|көрем|бара|approv|review|status|stage|manager|supervisor|final|history|track|check|view|decision|comment|application|find`,
  },
  {
    id: 'leave-decisions', sentences: [2, 5],
    match: q => /причин.*отказ|отказ.*причин|бас тарт|reject|declin/u.test(q),
    terms: `${leaveTerms}|${requestTerms}|причин|отказ|указ|найти|узна|посмотр|истори|решен|бас|тарт|себеп|тарих|көр|reject|declin|reason|history|find|view|explain|decision`,
  },
  {
    id: 'leave-decisions', sentences: [3, 4],
    match: q => /отмен|жою|жоя|болдырма|cancel/u.test(q) && (leave.test(q) || /заяв|өтін|request/u.test(q)),
    terms: `${leaveTerms}|${requestTerms}|отмен|одобр|соглас|подтверж|руковод|самостоят|окончател|жою|жоя|болдырма|мақұл|келіс|раста|басшы|cancel|approv|manager|final|already`,
  },
  {
    id: 'academy-learning', sentences: [0, 1, 2, 3, 4, 5, 6],
    match: q => course.test(q),
    terms: 'курс|обуч|академ|тест|урок|прогрес|назнач|материал|пройти|прошел|прохож|проход|заверш|сохран|результат|повтор|пересдат|балл|недостат|уведом|начат|откры|сабақ|оқу|оқыт|тест|курс|тағай|материал|тапсыр|аяқта|сақта|нәтиже|қайт|балл|өту|өтем|хабарлама|бастау|аш|келе|learn|course|lesson|quiz|test|progress|assign|material|complet|finish|sav|result|retak|repeat|score|pass|fail|notific|start|open',
  },
  {
    id: 'onboarding', sentences: [0, 1, 2, 3],
    match: q => /перв.*вход|(?:неверн|неправильн|ошиб).*(?:профил|данн|должност)|(?:профил|данн|должност).*ошиб|перв.*день|нович|онборд|алғаш|қате|onboard|first.*(?:login|day)|(?:wrong|incorrect).*(?:profile|job|title|position)/u.test(q),
    terms: 'перв|вход|день|нович|онборд|неверн|неправильн|ошиб|профил|данн|кабинет|исправ|обрат|указан|должност|подраздел|руковод|алғаш|кіру|қате|профил|дерек|мәлімет|түзет|басшы|лауазым|жазыл|хабарлас|onboard|first|login|sign|day|wrong|incorrect|profile|detail|correct|fix|contact|position|department|manager|job|title|show',
  },
  {
    id: 'privacy', sentences: [0, 1, 2, 3, 4],
    match: q => /доступ|рол|безопас|защит|құқық|рөл|қолжет|access|role|privacy|secur/u.test(q),
    terms: 'доступ|рол|безопас|защит|профил|данн|сотрудник|руковод|команд|видит|видеть|провер|сервер|персонал|құқық|рөл|қолжет|қызметкер|басшы|команда|көр|дерек|сервер|тексер|access|role|privacy|secur|profile|data|employee|manager|team|see|view|server|check|enforc',
  },
  {
    id: 'manager-review', sentences: [0, 1, 2, 3, 4],
    match: q => /руководител.*(?:собствен|свою|провер|рассмотр)|басшы.*(?:өз|қара|тексер)|manager.*(?:own|review|check)/u.test(q),
    terms: 'руковод|соглас|одобр|собствен|провер|рассмотр|заяв|команд|дат|отпуск|отказ|причин|басшы|өз|қара|тексер|өтін|команда|күн|демалыс|мақұл|себеп|manager|own|review|check|request|team|date|leave|vacation|approv|reject|reason',
  },
  {
    id: 'hr-guide', sentences: [0, 1, 2, 3],
    match: q => /редакт|редактор|назнач(?:ить|ать|а[ею])|созда.*сотрудник|измен.*(?:курс|балл)|өңде|тағайында(?:у|й)|қызметкер.*құр|(?:курс|бал).*өзгерт|edit|change.*(?:course|score)|assign(?!ed)|creat.*employee/u.test(q),
    terms: 'редакт|редактор|назнач|созда|измен|сотрудник|обуч|курс|урок|тест|вопрос|балл|проход|публик|рол|руковод|өңде|өзгерт|тағай|қызметкер|құр|курс|сабақ|тест|сұрақ|бал|өту|жария|рөл|басшы|edit|change|assign|creat|employee|course|lesson|quiz|question|pass|score|publish|role|manager',
  },
  {
    id: 'demo-scope', sentences: [0, 1, 2, 3],
    match: q => /демо|настоящ|реальн|вымышл|ресми|нақты|демонстрац|fiction|demo|real.*polic|official/u.test(q),
    terms: 'демо|настоящ|реальн|вымышл|демонстрац|правил|баз|знани|сотрудник|данн|политик|компан|ресми|нақты|демонстрац|ереже|қызметкер|дерек|компания|fiction|demo|real|polic|official|rule|knowledge|base|employee|data|company',
  },
  {
    id: 'assistant-limits', sentences: [0, 1, 3, 4],
    match: q => /ассистент|источник|дереккөз|көмекші|assistant|source/u.test(q),
    terms: 'ассистент|источник|отвеч|ответ|баз|знани|документ|правил|опира|данн|провер|құқық|дереккөз|көмекші|жауап|білім|база|құжат|ереже|дерек|assistant|source|answer|knowledge|base|document|rule|data|check|use|support',
  },
];

// These aspects are absent from the KB even when their question shares all
// other words with a supported workflow (e.g. a submission lead time).
const missingAspect = /за\s+сколько|за\s+\d|за.*до\s+начала|срок|дедлайн|в\s+год|следующ.*год|стаж|дополнительн|перенос|перенест|разделить|делить|разбить|част[ьи]|телефон|размер|мегабайт|сертификат|попыт|длител|сколько.*(?:балл|урок|курс)|қанша.*(?:балл|сабақ|курс|рет)|мерзім|қанша.*бұрын|неше.*бұрын|келесі.*жыл|ауыстыр|бөліп|өтіл|қосымша|сертификат|телефон|көлем|deadline|lead\s*time|in\s+advance|next\s+year|carry|transfer|split|seniority|extra|additional|certificate|phone|file\s*size|attempt|how\s+(?:many|long).*(?:score|lesson|course|retake)|\d/iu;

export function supportedKnowledge(question, allowed) {
  const q = normalize(question);
  if (missingAspect.test(q)) return [];
  let matches = cards.filter(card => card.match(q));
  if (matches.some(card => card.id === 'leave-balance')) matches = matches.filter(card => card.id === 'leave-balance');
  if (matches.some(card => card.id === 'leave-days' && card.sentences.length === 1)) matches = matches.filter(card => card.id === 'leave-days');
  if (matches.some(card => card.id === 'manager-review') && allowed.some(document => document.id === 'manager-review')) matches = matches.filter(card => card.id === 'manager-review');
  if (matches.some(card => card.id === 'hr-guide')) matches = matches.filter(card => card.id === 'hr-guide');
  if (matches.some(card => !allowed.some(document => document.id === card.id))) return [];
  // A word outside the explicit fact vocabulary represents an unsupported
  // condition. Prefer a useful refusal over silently dropping that condition.
  const terms = matches.map(card => new RegExp(`^(?:${card.terms})`, 'u'));
  const words = q.match(/[\p{L}\p{N}]+/gu) || [];
  if (!matches.length || words.some(word => !common.test(word) && !courtesy.test(word) && !discourse.test(word) && !terms.some(pattern => pattern.test(word)))) return [];
  const result = new Map();
  for (const card of matches) {
    const document = allowed.find(item => item.id === card.id && item.kind !== 'demo_script');
    if (!document) continue;
    const entry = result.get(card.id) || { document, indexes: new Set() };
    for (const index of card.sentences) entry.indexes.add(index);
    result.set(card.id, entry);
  }
  return [...result.values()].slice(0, 2);
}

export function supportedExcerpt({ document, indexes }, lang) {
  const sentences = document.content[lang].match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [];
  return [...indexes].sort((a, b) => a - b).map(index => sentences[index]?.trim()).filter(Boolean).join(' ');
}
