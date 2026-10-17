// Entirely fictional demonstration data. These are not Jana Post personnel or policies.
const tr = (ru, kk, en) => ({ ru, kk, en });
const instant = new Date().toISOString();
const day = (offset) => {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

export const demoPeople = [
  { id: 'employee', name: 'Алия Сейтова', email: 'employee@asar.demo', role: 'employee', company: 'Jana Post · демо', department: 'Логистика', position: 'Координатор доставки', managerId: 'manager', hiredAt: '2024-03-11', leaveBalance: 24, leaveReserved: 0 },
  { id: 'manager', name: 'Данияр Омаров', email: 'manager@asar.demo', role: 'manager', company: 'Jana Post · демо', department: 'Логистика', position: 'Руководитель логистики', managerId: 'manager2', hiredAt: '2022-08-15', leaveBalance: 24, leaveReserved: 0 },
  { id: 'hr', name: 'Мадина Ахметова', email: 'hr@asar.demo', role: 'hr', company: 'Jana Post · демо', department: 'HR', position: 'HR-менеджер', managerId: 'manager2', hiredAt: '2023-02-06', leaveBalance: 24, leaveReserved: 0 },
  { id: 'outsider', name: 'Арман Ким', email: 'outsider@asar.demo', role: 'employee', company: 'Jana Post · демо', department: 'Клиентский сервис', position: 'Специалист поддержки', managerId: 'manager2', hiredAt: '2025-05-19', leaveBalance: 24, leaveReserved: 0 },
  { id: 'manager2', name: 'София Тлеубердина', email: 'secondmanager@asar.demo', role: 'manager', company: 'Jana Post · демо', department: 'Клиентский сервис', position: 'Руководитель клиентского сервиса', managerId: null, hiredAt: '2023-09-04', leaveBalance: 24, leaveReserved: 0 },
];

export const demoCourses = [
  {
    id: 'onboarding',
    title: tr('Первые шаги в Asar HR', 'Asar HR жүйесіндегі алғашқы қадамдар', 'Your first steps in Asar HR'),
    description: tr('Знакомство с кабинетом, заявками и ежедневной поддержкой. Учебный курс демонстрационной компании.', 'Жеке кабинет, өтініштер және күнделікті көмек. Демонстрациялық компанияның оқу курсы.', 'Learn your profile, requests and everyday support. A course for the fictional demo company.'),
    category: 'onboarding', durationMinutes: 12, published: true, passScore: 80, cover: 'blue', createdAt: instant, updatedAt: instant,
    lessons: [
      {
        id: 'onboarding-1',
        title: tr('Ваш рабочий кабинет', 'Сіздің жұмыс кабинетіңіз', 'Your workplace profile'),
        content: tr(
          'Asar HR объединяет профиль, заявки, обучение и уведомления. В кабинете проверьте имя, подразделение, должность и руководителя. Если заметили ошибку, обратитесь в HR: кадровые сведения изменяет HR. Работник видит свои данные, руководитель — разрешённые данные непосредственной команды, HR — сотрудников компании. Все данные в демонстрации вымышлены.',
          'Asar HR профильді, өтініштерді, оқуды және хабарламаларды біріктіреді. Кабинеттен атыңызды, бөлімді, лауазымды және басшыны тексеріңіз. Қате болса, HR бөліміне хабарласыңыз: кадрлық мәліметтерді HR өзгертеді. Қызметкер өз деректерін, басшы тікелей командасының рұқсат етілген деректерін, HR компания қызметкерлерін көреді. Демодағы барлық деректер ойдан шығарылған.',
          'Asar HR brings together your profile, requests, learning and notifications. Check your name, department, position and manager. Ask HR to correct any errors: HR manages personnel records. Employees access their own records, managers access permitted records of direct reports, and HR accesses company employees. All demonstration data is fictional.'),
      },
      {
        id: 'onboarding-2',
        title: tr('Оформляем отпуск', 'Демалысты рәсімдеу', 'Requesting time off'),
        content: tr(
          'Откройте «Заявки», выберите даты и укажите причину. Учебное правило: считаем календарные дни, включая первый и последний день, без отдельного учёта праздников. Сначала заявку рассматривает руководитель, затем HR. При подаче дни резервируются; после подтверждения HR они списываются с остатка. До окончательного подтверждения сотрудник может отменить заявку. Отказ или отмена освобождают резерв. Пересекающиеся активные заявки и заявка сверх доступного остатка не допускаются. Эти правила созданы для демо и не являются юридической консультацией.',
          '«Өтініштерді» ашып, күндерді таңдап, себебін жазыңыз. Оқу ережесі: бірінші және соңғы күнді қоса күнтізбелік күндер есептеледі, мерекелер бөлек есептелмейді. Өтінішті алдымен басшы, содан кейін HR қарайды. Жіберілген кезде күндер резервке алынады, HR растағаннан кейін қалдықтан шегеріледі. Соңғы растауға дейін қызметкер өтініштен бас тарта алады. Қабылдамау немесе күшін жою резервті босатады. Белсенді өтініштердің күндері қиылыспауы және қолжетімді қалдықтан аспауы керек. Бұл демо ережелер заңгерлік кеңес емес.',
          'Open Requests, choose dates and enter a reason. Demo policy counts calendar days including the first and last day, without a separate holiday calculation. Your manager reviews first and HR confirms next. Submitting reserves days; HR approval deducts them from your balance. You may cancel before final approval. Rejection or cancellation releases the reservation. Active requests cannot overlap or exceed your available balance. These fictional rules are not legal advice.'),
      },
      {
        id: 'onboarding-3',
        title: tr('Учимся и получаем помощь', 'Оқу және көмек алу', 'Learning and getting help'),
        content: tr(
          'Назначенные курсы находятся в Academy. Прочитайте каждый урок, отметьте его пройденным и завершите тест. Для зачёта нужно не менее 80% правильных ответов. Прогресс сохраняется в профиле, результат видит HR. В центре уведомлений появляются изменения статуса заявки и события обучения. AI Jana отвечает по учебной базе знаний со ссылкой на документ. Если ответа нет, обратитесь в HR: помощник не должен придумывать кадровые правила.',
          'Тағайындалған курстар Academy бөлімінде орналасқан. Әр сабақты оқып, аяқталғанын белгілеп, тест тапсырыңыз. Өту үшін кемінде 80% дұрыс жауап қажет. Прогресс профильде сақталады, нәтижені HR көреді. Хабарламалар орталығында өтініш мәртебесі мен оқу оқиғалары көрсетіледі. AI Jana оқу базасына сүйеніп, құжатқа сілтемемен жауап береді. Жауап табылмаса, HR бөліміне жүгініңіз: көмекші кадрлық ережелерді ойдан шығармауы тиіс.',
          'Assigned courses appear in Academy. Read and complete every lesson, then take the quiz. A score of at least 80% is required to pass. Your progress is saved and HR can see the result. The notification center reports request updates and learning events. AI Jana answers from the demo knowledge base and links to a document. If no supported answer exists, contact HR: the assistant must not invent policies.'),
      },
    ],
    quiz: [
      { id: 'onboarding-q1', prompt: tr('Кто рассматривает отпуск первым?', 'Демалысты алдымен кім қарайды?', 'Who reviews a leave request first?'), options: [tr('HR', 'HR', 'HR'), tr('Непосредственный руководитель', 'Тікелей басшы', 'Your direct manager'), tr('Любой коллега', 'Кез келген әріптес', 'Any colleague')], correctIndex: 1 },
      { id: 'onboarding-q2', prompt: tr('Что происходит с резервом при отмене заявки?', 'Өтініш жойылғанда резерв не болады?', 'What happens to reserved days when a request is cancelled?'), options: [tr('Освобождается', 'Босатылады', 'They are released'), tr('Удваивается', 'Екі еселенеді', 'They are doubled'), tr('Сгорает', 'Жойылады', 'They are lost')], correctIndex: 0 },
      { id: 'onboarding-q3', prompt: tr('Сколько нужно набрать для зачёта?', 'Курстан өту үшін қанша балл керек?', 'What score is needed to pass?'), options: [tr('50%', '50%', '50%'), tr('60%', '60%', '60%'), tr('Не менее 80%', 'Кемінде 80%', 'At least 80%')], correctIndex: 2 },
      { id: 'onboarding-q4', prompt: tr('Как поступит AI Jana, если в базе нет ответа?', 'Базада жауап болмаса AI Jana не істейді?', 'What should AI Jana do when no source answers a question?'), options: [tr('Придумает правило', 'Ережені ойдан шығарады', 'Invent a policy'), tr('Сообщит об отсутствии ответа и направит в HR', 'Жауап жоқ екенін айтып, HR-ға бағыттайды', 'State that no answer is available and refer to HR'), tr('Покажет чужую заявку', 'Басқа адамның өтінішін көрсетеді', 'Show someone else’s request')], correctIndex: 1 },
    ],
  },
  {
    id: 'data-safety',
    title: tr('Данные под защитой', 'Деректер қорғалған', 'Keeping data safe'),
    description: tr('Роли, безопасные файлы и уверенная работа с HR-ассистентом.', 'Рөлдер, қауіпсіз файлдар және HR көмекшісімен сенімді жұмыс.', 'Roles, safe attachments and responsible use of the HR assistant.'),
    category: 'security', durationMinutes: 10, published: true, passScore: 80, cover: 'violet', createdAt: instant, updatedAt: instant,
    lessons: [
      {
        id: 'safety-1', title: tr('Доступ зависит от роли', 'Қолжетімділік рөлге байланысты', 'Access follows your role'),
        content: tr(
          'Открытая страница не означает право на любые данные. Сервер проверяет личность и роль при каждом запросе. Сотрудник читает свои заявки; руководитель рассматривает заявки прямых подчинённых; HR завершает согласование. Нельзя менять собственную роль или согласовывать собственный отпуск. Даже руководитель не видит заявки другой команды. Если обнаружили лишние данные, сообщите HR и не пересылайте их.',
          'Ашық бет барлық дерекке құқық бермейді. Сервер әр сұрауда тұлғаны және рөлді тексереді. Қызметкер өз өтініштерін оқиды, басшы тікелей бағыныштылардың өтініштерін қарайды, HR келісуді аяқтайды. Өз рөліңізді өзгертуге немесе өз демалысыңызды растауға болмайды. Басшы басқа команданың өтініштерін көрмейді. Артық деректер байқасаңыз, HR-ға хабарлап, оларды таратпаңыз.',
          'Opening the application does not grant access to every record. The server checks identity and role for every request. Employees read their own requests, managers review direct reports, and HR completes approval. Nobody may assign themselves a higher role or approve their own leave. A manager cannot view another team’s requests. Report unexpected access to HR and do not forward the data.'),
      },
      {
        id: 'safety-2', title: tr('Пароли и вложения', 'Құпиясөздер және тіркемелер', 'Passwords and attachments'),
        content: tr(
          'Не передавайте пароль коллегам, в чат помощника или в репозиторий. У каждого участника своя учётная запись. Выйдите из аккаунта на общем компьютере. Вложения загружаются в общее серверное хранилище, а доступ к ним зависит от прав на заявку. Это позволяет руководителю открыть файл на другом устройстве. В демо используйте только вымышленные документы без персональных данных. Не открывайте подозрительные файлы.',
          'Құпиясөзді әріптестерге, көмекші чатына немесе репозиторийге жібермеңіз. Әр қатысушының жеке есептік жазбасы бар. Ортақ компьютерде аккаунттан шығыңыз. Тіркемелер ортақ сервер қоймасына жүктеледі, оларға қолжетімділік өтініш құқықтарымен анықталады. Сондықтан басшы файлды басқа құрылғыдан аша алады. Демода жеке деректері жоқ ойдан шығарылған құжаттарды ғана қолданыңыз. Күдікті файлдарды ашпаңыз.',
          'Never share a password with colleagues, the assistant or a repository. Each participant has a separate account. Sign out on shared computers. Attachments are stored on the shared application server and inherit request access permissions, so a manager can open a file on another device. Use only fictional documents without personal data in this demonstration. Do not open suspicious files.'),
      },
      {
        id: 'safety-3', title: tr('Проверяем ответ помощника', 'Көмекші жауабын тексеру', 'Checking assistant answers'),
        content: tr(
          'AI Jana использует локальную базу учебных правил и показывает источник. Откройте источник и проверьте, что он подтверждает ответ. Не отправляйте в чат секреты, медицинские сведения или пароли. Помощник не получает чужие кадровые записи и не выполняет согласование заявок вместо уполномоченного человека. Если вопрос выходит за пределы базы или касается реальных правил компании, обратитесь в HR. Демо-база не заменяет документы работодателя.',
          'AI Jana жергілікті оқу ережелерін қолданып, дереккөзді көрсетеді. Дереккөзді ашып, оның жауапты растайтынын тексеріңіз. Чатқа құпияларды, медициналық мәліметтерді немесе құпиясөздерді жібермеңіз. Көмекші бөтен кадрлық жазбаларды алмайды және уәкілетті адамның орнына өтініштерді келіспейді. Сұрақ базадан тыс болса немесе компанияның нақты ережелеріне қатысты болса, HR-ға жүгініңіз. Демо база жұмыс беруші құжаттарын алмастырмайды.',
          'AI Jana uses a local collection of fictional policies and shows a source. Open that source and verify that it supports the answer. Never send secrets, medical information or passwords to the chat. The assistant does not receive other employees’ personnel records and cannot approve requests instead of an authorized person. Ask HR about topics outside the source material or real company rules. The demo knowledge base does not replace employer documents.'),
      },
    ],
    quiz: [
      { id: 'safety-q1', prompt: tr('Можно ли передать пароль помощнику?', 'Құпиясөзді көмекшіге беруге бола ма?', 'May you send your password to the assistant?'), options: [tr('Да, если он локальный', 'Иә, егер ол жергілікті болса', 'Yes, if it runs locally'), tr('Нет', 'Жоқ', 'No'), tr('Только руководителю', 'Тек басшыға', 'Only to a manager')], correctIndex: 1 },
      { id: 'safety-q2', prompt: tr('Кто проверяет право скачать вложение?', 'Тіркемені жүктеу құқығын кім тексереді?', 'Who checks permission to download an attachment?'), options: [tr('Сервер приложения', 'Қолданба сервері', 'The application server'), tr('Название файла', 'Файл атауы', 'The filename'), tr('Сотрудник вручную', 'Қызметкер қолмен', 'The employee manually')], correctIndex: 0 },
      { id: 'safety-q3', prompt: tr('Как проверить ответ AI Jana?', 'AI Jana жауабын қалай тексереміз?', 'How should you verify an AI Jana answer?'), options: [tr('По длине ответа', 'Жауап ұзындығымен', 'By its length'), tr('По уверенной формулировке', 'Сенімді тұжырымымен', 'By its confident wording'), tr('Открыть указанный источник', 'Көрсетілген дереккөзді ашу', 'Open its cited source')], correctIndex: 2 },
      { id: 'safety-q4', prompt: tr('Может ли руководитель смотреть заявки другой команды?', 'Басшы басқа команда өтініштерін көре ала ма?', 'May a manager view another team’s requests?'), options: [tr('Да, любую заявку', 'Иә, кез келген өтінішті', 'Yes, every request'), tr('Нет, только разрешённые данные своей команды', 'Жоқ, тек өз командасының рұқсат етілген деректерін', 'No, only permitted records of direct reports'), tr('Если знает ссылку', 'Сілтемені білсе', 'If they know the link')], correctIndex: 1 },
    ],
  },
];

export const demoRequests = [
  {
    id: 'demo-rejected', employeeId: 'employee', employeeName: 'Алия Сейтова', department: 'Логистика', startDate: day(-45), endDate: day(-43), days: 3,
    reason: 'Учебный пример: переносим отпуск на удобные для команды даты.', status: 'rejected', createdAt: `${day(-60)}T08:00:00.000Z`, updatedAt: `${day(-59)}T10:00:00.000Z`, attachments: [],
    history: [
      { id: 'demo-h1', actorName: 'Алия Сейтова', action: 'submitted', comment: 'Демонстрационная заявка', at: `${day(-60)}T08:00:00.000Z` },
      { id: 'demo-h2', actorName: 'Данияр Омаров', action: 'rejected', comment: 'В эти даты требуется замещение. Выберите другой период.', at: `${day(-59)}T10:00:00.000Z` },
    ],
  },
  {
    id: 'demo-cancelled', employeeId: 'outsider', employeeName: 'Арман Ким', department: 'Клиентский сервис', startDate: day(-30), endDate: day(-28), days: 3,
    reason: 'Учебный пример: личные планы изменились.', status: 'cancelled', createdAt: `${day(-44)}T08:00:00.000Z`, updatedAt: `${day(-43)}T10:00:00.000Z`, attachments: [],
    history: [
      { id: 'demo-h3', actorName: 'Арман Ким', action: 'submitted', comment: 'Демонстрационная заявка', at: `${day(-44)}T08:00:00.000Z` },
      { id: 'demo-h4', actorName: 'Арман Ким', action: 'cancelled', comment: 'Планы изменились', at: `${day(-43)}T10:00:00.000Z` },
    ],
  },
];

export const demoEnrollments = [
  { id: 'enrollment-demo-employee', userId: 'employee', userName: 'Алия Сейтова', courseId: 'onboarding', completedLessonIds: [], score: null, passed: false, completedAt: null, assignedAt: instant },
  { id: 'enrollment-demo-outsider', userId: 'outsider', userName: 'Арман Ким', courseId: 'data-safety', completedLessonIds: [], score: null, passed: false, completedAt: null, assignedAt: instant },
];
