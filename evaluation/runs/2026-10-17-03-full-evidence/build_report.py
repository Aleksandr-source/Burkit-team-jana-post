from pathlib import Path
import json,statistics,collections,hashlib,math
root=Path('/home/suprimee/Documents/GitHub/Burkit-team-jana-post');p=root/'evaluation/runs/2026-10-17-03-full-evidence';v=p/'validated'
def load(path):return json.loads(path.read_text())
def rows(path):return [json.loads(x) for x in path.read_text().splitlines()]
a=rows(p/'results.jsonl');b=rows(v/'results.jsonl');cases=load(v/'cases.json');byid={x['id']:x for x in cases}
dev=[x for x in a+b if x['phase']=='dev'];held=[x for x in b if x['phase']=='holdout'];selection=load(v/'selection.json')
def metric(rr):
 ts=sorted(x['elapsed_ms'] for x in rr);neg=[x for x in rr if x['expected']==0];pos=[x for x in rr if x['expected']!=0]
 return {'n':len(rr),'correct':sum(x['correct'] for x in rr),'score_0_100':100*sum(x['correct'] for x in rr)/len(rr),'first_result_baseline_score':100*sum(x['expected']==1 for x in rr)/len(rr),'always_abstain_baseline_score':100*sum(x['expected']==0 for x in rr)/len(rr),'absent_recall':sum(x['actual']==0 for x in neg)/len(neg),'positive_accuracy':sum(x['correct'] for x in pos)/len(pos),'false_abstentions':sum(x['actual']==0 for x in pos),'unsupported_selections':sum(x['actual'] in [1,2] for x in neg),'invalid':sum(x['actual'] not in [0,1,2] for x in rr),'selection_histogram':dict(collections.Counter(str(x['actual']) for x in rr)),'p50_ms':statistics.median(ts),'p95_ms':ts[math.ceil(len(ts)*.95)-1],'max_ms':max(ts),'over_10s':sum(x>10000 for x in ts),'http_non_200':sum(x.get('http_status')!=200 for x in rr)}
s={'selected':selection['selected'],'development':{},'holdout':{'all':metric(held),'ru':metric([x for x in held if x['lang']=='ru']),'kk':metric([x for x in held if x['lang']=='kk'])},'total_calls_including_superseded':len(a+b),'superseded_holdout_calls':len([x for x in a if x['phase']=='holdout']),'dataset_version':'validated/cases.json; full document evidence; approval distractor changed before final holdout','baseline':'always choose document1; same cases/roles/position distribution; zero inference not performance-equivalent service','scoring':'per trial exact correct choice=100; wrong, invalid, HTTP failure=0; this is selector score, not answer-quality rubric','acceptance':{}}
for conf in dict.fromkeys(x['config'] for x in dev):
 rr=[x for x in dev if x['config']==conf];s['development'][conf]={'all':metric(rr),'ru':metric([x for x in rr if x['lang']=='ru']),'kk':metric([x for x in rr if x['lang']=='kk'])}
for lang in ['ru','kk']:
 m=s['holdout'][lang];s['acceptance'][lang]=m['score_0_100']>=90 and m['absent_recall']==1 and m['invalid']==0 and m['over_10s']==0
s['acceptance']['overall']=all(s['acceptance'].values())
per=[]
for c in [x for x in cases if x['split']=='holdout']:
 rr=[r for r in held if r['id']==c['id']];per.append({'id':c['id'],'lang':c['lang'],'question':c['question'],'expected':c['expected'],'source':c['expected_source'],'actual':[x['actual'] for x in rr],'correct':[x['correct'] for x in rr],'elapsed_ms':[x['elapsed_ms'] for x in rr],'visible_sources':[d['id'] for d in c['evidence']]})
s['holdout_cases']=per
(p/'SUMMARY.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
before=load(p/'source-before.json');changed=[n for n,h in before.items() if not(root/n).is_file() or hashlib.sha256((root/n).read_bytes()).hexdigest()!=h];(p/'source-integrity.json').write_text(json.dumps({'unchanged':not changed,'files_checked':len(before),'changed':changed},indent=2));assert not changed
# Assert dataset balance, source identity, permissions, and token budget on successful requests.
knowledge=load(v/'knowledge-snapshot.json');kd={x['id']:x for x in knowledge}
for c in cases:
 assert c['expected'] in [0,1,2]
 for d in c['evidence']:
  k=kd[d['id']];assert d['text']==k['content'][c['lang']];assert k['audience']=='all' or c['role']=='hr' or (c['role']=='manager' and k['audience']=='manager')
for split in ['dev','holdout']:
 for lang in ['ru','kk']:assert collections.Counter(x['expected'] for x in cases if x['split']==split and x['lang']==lang)=={0:3,1:3,2:3}
validation={'full_text_matches_snapshot':True,'role_filter_valid_for_cases':True,'balanced_labels_each_language_and_split':True,'max_prompt_tokens':max(x.get('response',{}).get('usage',{}).get('prompt_tokens',0) for x in a+b),'context_tokens':2048,'source_unchanged':True}
(p/'validation.json').write_text(json.dumps(validation,indent=2))
lines=['# Полные источники и последовательное сравнение настроек Qwen','',
'Дата: 17 октября 2026. Модель: закреплённая Qwen3.5-0.8B Q4_0; llama-server b8936. Исходники не изменены.','',
'## Краткий вывод','',
f"По заранее заданному правилу на development выбрана **{s['selected']['id']}**. Проход приёмочных ворот на окончательном наборе: **{s['acceptance']['overall']}**. Это результат стендового выбора документа, не готовность всего HR-ассистента.",'',
'## Методика и устранение неоднозначности','',
'36 парных RU/KK случаев: на каждом языке 6 вопросов с ответом, каждый в двух порядках источников, и 6 без ответа. В каждой половине набора и на каждом языке метки 0/1/2 сбалансированы: по 3 случая. Кандидаты содержат полный оригинальный текст доступных документов, без обрезания превью или вопроса. В эталоне отмечены номер и ID подтверждающего документа.','',
'Development: подсчёт дней, отмена, создание заявки; неизвестные срок подачи, сумма аванса и погода. Holdout: списание резерва, окончательное решение HR и публикация курса; неизвестные срок выплаты отпускных, больничные и перенос дней. Набор составлен и проверен ассистентом, независимая экспертиза носителем KK не проводилась. Отложены темы, но не полностью все документы; это небольшой контролируемый эксперимент, не внешняя независимая оценка.','',
'При проверке эталона обнаружено, что отвлекающая инструкция подачи косвенно подсказывала HR в вопросе об окончательном решении. В validated/cases.json она заменена статьёй об обучении. Первоначальные 36 holdout-вызовов сохранены как superseded и не входят в окончательные метрики. Development не изменился. Настройка выбиралась исключительно по development, до окончательного holdout; финальные результаты не использовались для повторного подбора.','',
'Базовое правило «выбрать первый» получает 33,3/100 на обеих половинах и обоих языках. «Всегда отказать» тоже получает 33,3/100. Базовые решения посчитаны на тех же заданиях без вызова LLM; их время не сравнивается с временем сервиса.','',
'Баллы: 100 за точный выбор эталонного номера (включая 0), 0 за неправильный выбор/невалидный ответ/ошибку. Среднее — точность селектора в процентах. Это не ранее обсуждавшаяся многочастная рубрика качества конечного ответа.','',
'## Последовательные изменения','',
'Общие параметры: CPU, 2 потока, context 2048, parallel 1, thinking off, одна и та же Q4_0. Менялись только тестовые HTTP-запросы; версия весов, число потоков и квантование не подбирались.','',
'- A: полный контекст, исходная короткая инструкция, max_tokens=3, temperature=0.','- B: A с max_tokens=16.','- C: B с подробной английской инструкцией проверки достаточности.','- D: C с эквивалентной инструкцией на языке вопроса RU/KK.','- E: D с temperature=0.2 и seed=42. Один seed — не оценка устойчивости всех случайных запусков.','- F: D с альтернативным response_format=json_schema с вложенной schema.','- G: D без response_format, с требованием номера только в промпте.','',
'В A (исходный json_object, 3 токена) получены 3 невалидных результата; B с 16 токенами устранил их на development. F с альтернативным json_schema не улучшил точность относительно D. G без response_format дал 9 невалидных ответов, все на KK: его 0% на KK — результат строгой проверки формата, а не доказательство нулевого понимания языка. Причина поведения конкретного runtime здесь не установлена; обновление runtime не выполнялось.','',
'## Development: 18 вызовов на конфигурацию','',
'| Конфигурация | RU /100 | KK /100 | Всего /100 | Верный отказ, % | Невалидные | p95, с |','|---|---:|---:|---:|---:|---:|---:|']
for conf,x in s['development'].items():
 m=x['all'];lines.append(f"| {conf} | {x['ru']['score_0_100']:.1f} | {x['kk']['score_0_100']:.1f} | {m['score_0_100']:.1f} | {100*m['absent_recall']:.1f} | {m['invalid']} | {m['p95_ms']/1000:.3f} |")
lines+=['','Выбор: максимальная точность худшего языка; затем общая точность; затем меньший p95. Это правило ранжирования, а не автоматическое одобрение победителя. Порог приёмки: ≥90/100 на каждом языке, 100% верных отказов на отсутствии факта, 0 невалидных результатов и max≤10 с. При 9 отдельных случаях на язык оценки грубые; 8/9 = 88,9%.','',
'## Окончательный holdout: 18 случаев × 2 повтора','',
'| Язык | Правильных / вызовов | Балл /100 | Первый результат /100 | Верный отказ, % | Ошибочные ответы на неизвестное | Ложные отказы | max, с |','|---|---:|---:|---:|---:|---:|---:|---:|']
for lang in ['ru','kk']:
 m=s['holdout'][lang];lines.append(f"| {lang.upper()} | {m['correct']}/{m['n']} | {m['score_0_100']:.1f} | {m['first_result_baseline_score']:.1f} | {100*m['absent_recall']:.1f} | {m['unsupported_selections']} | {m['false_abstentions']} | {m['max_ms']/1000:.3f} |")
lines+=['','Повторы не увеличивают число независимых задач. Изменения между повторами видны ниже; оценивается точное решение, а не похожесть текста.','',
'| Случай | Эталон | Источник | Повтор 1 / 2 |','|---|---:|---|---|']
for r in per:lines.append(f"| {r['id']} | {r['expected']} | {r['source'] or 'нет'} | {' / '.join(str(x) for x in r['actual'])} |")
alltime=metric(dev+held)
lines+=['','## Скорость и границы вывода','',
f"В окончательно учитываемых {alltime['n']} вызовах p50={alltime['p50_ms']/1000:.3f} с, p95={alltime['p95_ms']/1000:.3f} с, max={alltime['max_ms']/1000:.3f} с; превышений 10 с: {alltime['over_10s']}. Максимальный вход: {validation['max_prompt_tokens']} токенов при контексте 2048.",'',
'Время измерено от запроса /v1/chat/completions до полного разбора ответа; это выбор номера, без поиска, браузера и генерации пользовательского текста. Последовательные запросы без нагрузки, сервер прогрет по ходу перебора. Разницу времени между конфигурациями нельзя целиком приписывать промпту: порядок не рандомизирован и кеш различается. Истинный холодный запуск и concurrent-нагрузка здесь не проверялись. Тайм-аут вызова оставлен 60 секунд, поэтому наблюдаемая скорость не является гарантией ограничения в 10 секунд.','',
'## Доступ к базе и источники','',
'Предложение подготовлено отдельно в KB_ACCESS_DESIGN.md: авторизация до поиска → полные смысловые фрагменты с версиями/ID → поиск перефразировок → оценка достаточности → серверная проверка цитат → локализованный ответ и точный переход к источнику. Для неизвестного — явное отсутствие данных; для составного вопроса — подтверждённая часть плюс обозначение пропуска.','',
'Тесты выше изолируют селектор: правильные кандидаты ему уже предоставлены. Они не доказывают качество будущего retrieval. Отдельно требуется измерить, попадает ли нужный источник в кандидаты. Источники в пользовательском UI не внедрялись, новый endpoint не создавался. Формулировки отказа и контракт — предложение, а не изменённое поведение приложения.','',
'## Воспроизводимость и файлы','',
'- SUMMARY.json — сводка, сравнение baseline и ошибки по случаям.','- configs.json / validated/configs.json — промпты и параметры; cases.json / validated/cases.json — точные эталоны и полный контекст.','- results.jsonl / validated/results.jsonl — исходные HTTP-запросы и ответы без ключа авторизации, usage, finish_reason, время.','- validated/selection.json — ранжирование только по development и выбранная конфигурация.','- knowledge-snapshot.json — зафиксированная база, validation.json — проверка полных текстов, прав и баланса меток.','- source-before.json / source-integrity.json — неизменность исходников.','- run.stdout.log / run.stderr.log и их аналоги в validated — журналы runtime.','',
'Запуск experiment.mjs требует Node 24 и cwd корня проекта; первый аргумент — новая существующая пустая папка результатов. Для первого этапа: node <путь к experiment.mjs> <новая папка>. Скрипт второго этапа читает ranking первого по зафиксированному пути: при переносе результатов поправить только этот путь в копии тестового скрипта. Не запускать в папку старого прогона: JSONL дописывается. Скрипты сами запускают и останавливают llama-server.','',
f"Всего реальных обращений с учётом сохранённого предварительного holdout: {len(a+b)}. Проверено {len(before)} исходных файлов: изменений нет. В .local-ai обновлялся только служебный runtime-файл при запуске, веса не менялись. После тестов процесс остановлен.",'']
(p/'REPORT.md').write_text('\n'.join(lines))
print(json.dumps({'selected':s['selected'],'holdout':s['holdout'],'accepted':s['acceptance'],'validation':validation},ensure_ascii=False,indent=2))
