import { createHash } from 'node:crypto';

// Fictional hackathon policies. These are product demo data, not Jana Post policy
// or legal advice. Keep translations together so citations open in the UI language.
const t = (ru, kk, en) => ({ ru, kk, en });
const doc = (id, title, content, section, audience = 'all') => ({
  id, title, content, section, audience, version: 'DEMO · 17.10.2026 · v1.1',
  kind: ['leave-days', 'leave-balance', 'leave-decisions'].includes(id) ? 'fictional_policy' : 'application_help',
  origin: t('Материалы команды JanaMen для хакатона. Не официальные правила Jana Post.',
    'JanaMen командасының хакатон материалдары. Jana Post ресми ережелері емес.',
    'JanaMen team hackathon materials. Not official Jana Post policies.'),
  fictional: true, effectiveFrom: '2026-10-16',
});

export const knowledge = [
  { ...doc('demo-leave-walkthrough', t('Демонстрация: оформление отпуска', 'Демонстрация: демалысты рәсімдеу', 'Demo: requesting time off'), t(
    'Оформить отпуск в JanaMen можно прямо из личного кабинета:\n\n1. Откройте «Мои заявки» и нажмите «Оформить отпуск».\n2. Выберите даты начала и окончания, проверьте число дней и доступный остаток. При необходимости добавьте комментарий и вложение.\n3. Отправьте заявку: сначала её рассмотрит ваш руководитель, затем HR.\n4. Следите за статусом в «Моих заявках» и уведомлениях. Отпуск подтверждён после окончательного согласования HR.\n\nЭто демонстрационный порядок. Для начала нажмите «Оформить отпуск» под ответом.',
    'JanaMen жүйесінде демалысқа жеке кабинеттен өтініш беруге болады. «Менің өтінімдерім» бөлімін ашып, демалысты рәсімдеу батырмасын басыңыз. Басталу және аяқталу күндерін, күн санын және қолжетімді қалдықты тексеріңіз. Қажет болса, түсініктеме мен файл қосыңыз. Өтінішті алдымен басшы, содан кейін HR қарайды. Мәртебені өтінімдер мен хабарламалардан бақылаңыз. Демалыс HR соңғы мақұлдауынан кейін расталады. Бұл — демонстрациялық тәртіп.',
    'To request time off in JanaMen, open My requests and choose Request time off. Select your dates and check the day count and available balance. Add a comment or attachment if needed. Submit the request for your manager’s review, followed by HR. Follow its status in My requests and notifications. Leave is confirmed after final HR approval. This is a demonstration workflow.'
  ), 'leave'), kind: 'demo_script' },
  doc('demo-scope', t('О демонстрационных правилах', 'Демонстрациялық ережелер туралы', 'About the demo policies'), t(
    'Все правила этой базы придуманы для хакатонного прототипа JanaMen. Они не являются официальными правилами Jana Post или юридической консультацией. Все сотрудники, учётные записи и кадровые данные в демонстрации вымышлены. За подтверждением реального кадрового правила нужно обратиться в HR своей компании.',
    'Бұл базадағы барлық ереже JanaMen хакатондық прототипі үшін ойдан шығарылған. Олар Jana Post компаниясының ресми ережесі немесе заңгерлік кеңес емес. Демонстрациядағы қызметкерлер, тіркелгілер және кадрлық деректер ойдан шығарылған. Нақты кадрлық ережені компанияңыздың HR маманынан растаңыз.',
    'Every policy in this knowledge base is fictional and created for the JanaMen hackathon prototype. It is not an official Jana Post policy or legal advice. All employees, accounts and personnel records in this demonstration are fictional. Ask your company HR team to confirm a real employment policy.'
  ), 'general'),
  doc('leave-submit', t('Как подать заявку на отпуск', 'Демалысқа өтініш беру', 'How to request leave'), t(
    'Откройте «Мои заявки» и нажмите «Оформить отпуск». Выберите даты начала и окончания отпуска, при необходимости добавьте комментарий и вложение. Дата начала не может быть раньше сегодняшнего дня, дата окончания не может быть раньше начала. Перед отправкой проверьте число дней и доступный остаток. После отправки заявка поступит вашему непосредственному руководителю, затем в HR. Это демонстрационный порядок.',
    '«Менің өтінімдерім» бөліміне кіріп, «Демалысқа өтінім беру» батырмасын басыңыз. Демалыстың басталу және аяқталу күнін таңдап, қажет болса түсініктеме мен файл қосыңыз. Басталу күні бүгіннен ерте, аяқталу күні басталу күнінен ерте болмауы керек. Жібермес бұрын күн санын және қолжетімді қалдықты тексеріңіз. Өтініш алдымен тікелей басшыға, кейін HR маманына жіберіледі. Бұл демонстрациялық тәртіп.',
    'Open My requests and choose Request time off. Select the first and last day of leave and optionally add a comment and attachment. The start date cannot be in the past and the end date cannot precede the start. Check the number of days and your available balance before submitting. Your direct manager reviews the request first, followed by HR. This is a demonstration workflow.'
  ), 'leave'),
  doc('leave-days', t('Как считаются дни отпуска', 'Демалыс күндерін есептеу', 'How leave days are counted'), t(
    'В демонстрации отпуск считается в календарных днях включительно: учитываются и дата начала, и дата окончания. Выходные и праздники не исключаются. Например, отпуск с 10 по 12 число занимает 3 дня. Пересекающиеся активные или одобренные заявки на отпуск не допускаются. Эти учебные правила не заменяют трудовое законодательство и правила работодателя.',
    'Демонстрацияда демалыс күнтізбелік күндермен есептеледі: басталу және аяқталу күні де кіреді. Демалыс және мереке күндері шегерілмейді. Мысалы, айдың 10-ынан 12-сіне дейінгі демалыс 3 күн болады. Белсенді немесе мақұлданған өтініштердің күндері қабаттаспауы керек. Бұл оқу ережелері еңбек заңнамасын және жұмыс беруші ережесін алмастырмайды.',
    'This demonstration counts calendar days inclusively: both the start date and the end date count. Weekends and public holidays are not excluded. For example, leave from the 10th through the 12th uses 3 days. Active or approved leave requests cannot overlap. These training rules do not replace employment law or employer policy.'
  ), 'leave'),
  doc('leave-balance', t('Остаток и резерв отпуска', 'Демалыс қалдығы және резерві', 'Leave balance and reserved days'), t(
    'Доступный отпуск равен остатку за вычетом уже зарезервированных дней. При подаче заявки дни резервируются, а окончательно списываются только после подтверждения HR. Отказ руководителя, отказ HR или отмена до окончательного одобрения освобождают резерв. Свой остаток и резерв можно посмотреть на главной странице личного кабинета. В демонстрации автоматическое начисление отпускных дней не выполняется.',
    'Қолжетімді демалыс қалдықтан резервтелген күндерді шегеру арқылы есептеледі. Өтініш бергенде күндер резервтеліп, тек HR растағаннан кейін түпкілікті шегеріледі. Басшы немесе HR бас тартса не соңғы мақұлдауға дейін өтініш жойылса, резерв босатылады. Өз қалдығыңызды және резервті жеке кабинеттің басты бетінен көре аласыз. Демонстрацияда демалыс күндері автоматты түрде есептелмейді.',
    'Available leave equals your balance minus days already reserved. Submitting a request reserves the days; only final HR approval deducts them from the balance. A rejection by the manager or HR, or cancellation before final approval, releases the reservation. Your personal dashboard shows your balance and reserved days. The demonstration does not automatically accrue leave days.'
  ), 'leave'),
  doc('leave-decisions', t('Согласование, отказ и отмена', 'Мақұлдау, бас тарту және жою', 'Approval, rejection and cancellation'), t(
    'Маршрут заявки: «У руководителя» → «В HR» → «Одобрено». Руководитель проверяет заявку своего непосредственного сотрудника, после его согласования HR принимает окончательное решение. Отказ на любом этапе требует указать причину, которую увидит сотрудник. Сотрудник может отменить свою заявку до окончательного одобрения HR. Одобренную заявку сотрудник самостоятельно отменить не может: нужно обратиться в HR. Все решения и комментарии сохраняются в истории заявки.',
    'Өтініш бағыты: «Басшыда» → «HR бөлімінде» → «Мақұлданды». Басшы тікелей қызметкерінің өтінішін қарайды, содан кейін HR соңғы шешім қабылдайды. Кез келген кезеңдегі бас тарту үшін қызметкер көретін себеп көрсетілуі керек. Қызметкер HR соңғы мақұлдауына дейін өз өтінішін жоя алады. Мақұлданған өтінішті өзі жоя алмайды: HR маманына хабарласуы керек. Барлық шешім мен түсініктеме өтініш тарихында сақталады.',
    'The workflow is With manager → With HR → Approved. Your direct manager reviews the request before HR makes the final decision. Rejection at either stage requires a reason visible to the employee. Employees can cancel their own request before final HR approval. Employees cannot cancel an approved request themselves and should contact HR. Every decision and comment is retained in the request history.'
  ), 'leave'),
  doc('academy-learning', t('Обучение в Jana Academy', 'Jana Academy оқу үдерісі', 'Learning in Jana Academy'), t(
    'Назначенные курсы доступны в разделе Jana Academy. Откройте курс, изучите уроки и отмечайте их завершёнными. Прогресс сохраняется в вашем профиле между входами. После всех уроков пройдите короткий тест. Для успешного завершения нужен указанный в карточке курса проходной балл. Если результата недостаточно, изучите материалы и повторите тест. Назначение и завершение курса создают уведомления.',
    'Тағайындалған курстар Jana Academy бөлімінде қолжетімді. Курсты ашып, сабақтарды оқыңыз және аяқталған деп белгілеңіз. Прогресс тіркелгіңізде сақталады. Барлық сабақтан кейін қысқа тест тапсырыңыз. Курсты сәтті аяқтау үшін курс картасында көрсетілген өту балын жинау керек. Нәтиже жеткіліксіз болса, материалдарды қайталап, тестті қайта тапсырыңыз. Курс тағайындалғанда және аяқталғанда хабарлама пайда болады.',
    'Assigned courses appear in Jana Academy. Open a course, study its lessons and mark each lesson complete. Your profile retains progress between sessions. Take the short quiz after completing all lessons. Reach the passing score displayed on the course card to finish successfully. If you do not pass, review the material and retry the quiz. Course assignment and completion create notifications.'
  ), 'academy'),
  doc('onboarding', t('Первые шаги сотрудника', 'Қызметкердің алғашқы қадамдары', 'Employee first steps'), t(
    'После первого входа проверьте должность, подразделение и руководителя в личном кабинете. Если данные неверны, обратитесь в HR. Затем пройдите назначенные вводные курсы в Jana Academy. Статусы своих заявок смотрите в «Моих заявках», новые события — в центре уведомлений. Пароль от демонстрационного аккаунта не используйте в других сервисах.',
    'Алғаш кіргенде жеке кабинеттегі лауазым, бөлімше және басшыны тексеріңіз. Деректер қате болса, HR маманына хабарласыңыз. Содан кейін Jana Academy бөліміндегі кіріспе курстардан өтіңіз. Өтініш мәртебелерін «Менің өтінімдерім» бөлімінен, жаңа оқиғаларды хабарламалар орталығынан көріңіз. Демонстрациялық тіркелгі құпиясөзін басқа сервистерде қолданбаңыз.',
    'After your first sign-in, check your position, department and manager in the personal dashboard. Contact HR if a detail is incorrect. Then complete your assigned onboarding courses in Jana Academy. View request status in My requests and new events in the notification center. Do not reuse the demonstration account password in other services.'
  ), 'onboarding'),
  doc('privacy', t('Роли и защита данных', 'Рөлдер және деректерді қорғау', 'Roles and data protection'), t(
    'Сотрудник видит собственный профиль, заявки, обучение и уведомления. Руководитель дополнительно получает разрешённые данные непосредственной команды и заявки на первом этапе согласования. HR управляет демонстрационными сотрудниками и обучением компании и принимает окончательные решения по заявкам после руководителя. Права проверяются на сервере. Ассистент не раскрывает персональные данные коллег и не меняет роли или заявки по текстовой команде.',
    'Қызметкер тек өз профилін, өтініштерін, оқуын және хабарламаларын көреді. Басшы тікелей командасының рұқсат етілген деректерін және бірінші кезеңдегі өтініштерін қосымша көреді. HR демонстрациялық қызметкерлер мен компания оқуын басқарып, басшыдан кейін соңғы шешім қабылдайды. Құқықтар серверде тексеріледі. Ассистент әріптестердің жеке деректерін ашпайды және мәтіндік пәрмен арқылы рөлдер мен өтініштерді өзгертпейді.',
    'Employees see their own profile, requests, learning and notifications. Managers additionally see permitted direct-team data and requests at the first approval stage. HR manages demonstration employees and company learning and makes final request decisions after the manager. The server enforces access rights. The assistant does not disclose colleagues’ personal data or change roles or requests through text commands.'
  ), 'security'),
  doc('manager-review', t('Памятка руководителю', 'Басшыға арналған жадынама', 'Manager review guide'), t(
    'В разделе команды руководитель видит только своих непосредственных сотрудников. Проверьте даты отпуска и организационные возможности перед согласованием. Согласование руководителем переводит заявку в HR, но ещё не означает окончательного одобрения отпуска. При отказе укажите понятную причину. Руководитель не может согласовать собственную заявку и не может заменить окончательное решение HR.',
    'Команда бөлімінде басшы тек тікелей қызметкерлерін көреді. Мақұлдар алдында демалыс күндерін және ұйымдастыру мүмкіндігін тексеріңіз. Басшы мақұлдаған соң өтініш HR бөліміне өтеді, бұл демалыстың соңғы мақұлдауы емес. Бас тартқанда түсінікті себеп жазыңыз. Басшы өз өтінішін мақұлдай алмайды және HR соңғы шешімін алмастыра алмайды.',
    'The team area shows a manager’s direct reports only. Check the requested dates and team coverage before approving. Manager approval forwards a request to HR and is not final leave approval. Give a clear reason when rejecting. A manager cannot approve their own request or replace the final HR decision.'
  ), 'manager', 'manager'),
  doc('hr-guide', t('Памятка HR: сотрудники и курсы', 'HR жадынамасы: қызметкерлер мен курстар', 'HR guide: employees and courses'), t(
    'HR создаёт демонстрационных сотрудников в разделе «Сотрудники», задаёт роль и непосредственного руководителя. HR редактирует курсы, уроки, вопросы теста и проходной балл в Jana Academy. Публикуйте курс после проверки содержания и назначайте его сотрудникам. На окончательное рассмотрение HR поступают заявки после согласования руководителем. Первичные учётные данные выдавайте участникам демонстрации лично; они не являются данными настоящих сотрудников.',
    'HR «Қызметкерлер» бөлімінде демонстрациялық қызметкерді құрып, рөлін және тікелей басшысын белгілейді. HR Jana Academy бөлімінде курс, сабақ, тест сұрақтары және өту балын өңдейді. Мазмұнын тексергеннен кейін курсты жариялап, қызметкерлерге тағайындаңыз. HR соңғы қарауына басшы мақұлдаған өтініштер түседі. Алғашқы кіру деректерін демонстрация қатысушыларына жеке беріңіз; бұлар нақты қызметкерлердің деректері емес.',
    'HR creates demonstration employees in People and sets their role and direct manager. HR edits courses, lessons, quiz questions and passing scores in Jana Academy. Check the content before publishing and assigning a course. HR receives requests for final review only after manager approval. Share initial sign-in credentials personally with demonstration participants; they do not belong to real employees.'
  ), 'hr', 'hr'),
  doc('assistant-limits', t('Если JanaMen AI не знает ответа', 'JanaMen AI жауапты білмесе', 'When JanaMen AI cannot answer'), t(
    'JanaMen AI отвечает только по доступной вашему уровню доступа демонстрационной базе знаний и указывает источники. Если подтверждённого ответа нет, ассистент должен сообщить об этом и предложить обратиться в HR. В базе нет правил о зарплате, компенсациях, больничных и реальной политике компании. Ассистент не выполняет кадровые действия вместо пользователя. Текст вопроса не может расширить права доступа.',
    'JanaMen AI тек рөліңізге қолжетімді демонстрациялық білім базасы бойынша жауап беріп, дереккөздерін көрсетеді. Расталған жауап болмаса, оны хабарлап, HR маманына жүгінуді ұсынуы керек. Базада жалақы, өтемақы, ауру демалысы және компанияның нақты саясаты туралы ереже жоқ. Ассистент пайдаланушы орнына кадрлық әрекет жасамайды. Сұрақ мәтіні қолжетімділік құқықтарын кеңейте алмайды.',
    'JanaMen AI answers only from the demonstration knowledge base available to your role and identifies its sources. If no supported answer exists, it must say so and suggest contacting HR. The knowledge base has no policies about salary, compensation, sick leave or real company policy. The assistant does not perform personnel actions for the user. A question cannot expand access permissions.'
  ), 'assistant'),
];

export function knowledgeForRole(role) {
  if (!['employee', 'manager', 'hr'].includes(role)) return [];
  return knowledge.filter((item) => item.audience === 'all'
    || (item.audience === 'manager' && ['manager', 'hr'].includes(role))
    || (item.audience === 'hr' && role === 'hr'));
}

export function knowledgeSource(document, language = 'ru') {
  const lang = ['ru', 'kk', 'en'].includes(language) ? language : 'ru';
  return {
    id: document.id, title: document.title[lang], excerpt: document.content[lang],
    version: document.version, origin: document.origin[lang], kind: document.kind,
    fictional: document.fictional, url: `/api/knowledge/${encodeURIComponent(document.id)}?lang=${lang}`,
    sha256: createHash('sha256').update(document.content[lang]).digest('hex'),
  };
}
