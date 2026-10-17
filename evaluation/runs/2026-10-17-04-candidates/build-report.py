from pathlib import Path
import json,statistics,math,collections,hashlib
r=Path('/home/suprimee/Documents/GitHub/Burkit-team-jana-post');p=r/'evaluation/runs/2026-10-17-04-candidates'
def load(x):return json.loads(x.read_text())
def jsonl(x):return [json.loads(l) for l in x.read_text().splitlines()]
def metrics(rows):
 v=sorted(x['elapsed_ms'] for x in rows);neg=[x for x in rows if x['expected']==0];pos=[x for x in rows if x['expected']!=0]
 return {'n':len(rows),'correct':sum(x['correct'] for x in rows),'score':100*sum(x['correct'] for x in rows)/len(rows),'baseline_first_score':100*sum(x['expected']==1 for x in rows)/len(rows),'absent_correct':sum(x['actual']==0 for x in neg),'absent_n':len(neg),'absent_recall':sum(x['actual']==0 for x in neg)/len(neg),'positive_correct':sum(x['correct'] for x in pos),'positive_n':len(pos),'invalid':sum(x['actual'] not in [0,1,2] for x in rows),'unsupported_answers':sum(x['actual'] in [1,2] for x in neg),'false_abstentions':sum(x['actual']==0 for x in pos),'p50_ms':statistics.median(v),'p95_ms':v[math.ceil(.95*len(v))-1],'max_ms':max(v),'over_10s':sum(t>10000 for t in v),'http_errors':sum(x.get('http_status')!=200 for x in rows),'choices':dict(collections.Counter(str(x['actual']) for x in rows))}
pins=load(p/'model-pins.json');cases=load(p/'existing-cases.json')+load(p/'new-control-cases.json');ids={x['id']:x for x in cases};allrows=[];summary={'models':{},'winner':None,'method':'Exact source selection; question+full authorized evidence. Per-question 100 correct, 0 incorrect/invalid. Not general language quality.','gates':load(p/'protocol.json')['gates']}
for pin in pins:
 folder=p/pin['id'];assert load(folder/'complete.json')['complete'];rows=jsonl(folder/'results.jsonl');assert len(rows)==144;allrows+=rows;selection=load(folder/'selection.json');m={'pin':pin,'selected':selection['selected'],'development':{},'tests':{},'accepted':True,'failures':[]}
 for conf in ['deterministic','sampled']:
  rr=[x for x in rows if x['phase']=='development' and x['config']==conf];m['development'][conf]={lang:metrics([x for x in rr if x['lang']==lang]) for lang in ['ru','kk']}
 for phase in ['existing_holdout','new_control']:
  m['tests'][phase]={}
  for lang in ['ru','kk']:
   rr=[x for x in rows if x['phase']==phase and x['lang']==lang];stat=metrics(rr);stat['timing_by_repeat']={str(repeat):{k:metrics([x for x in rr if x['repeat']==repeat])[k] for k in ['p50_ms','p95_ms','max_ms']} for repeat in [1,2]};stat['accepted']=stat['score']>=90 and stat['absent_recall']==1 and stat['invalid']==0 and stat['over_10s']==0 and stat['http_errors']==0;m['accepted'] &= stat['accepted'];m['tests'][phase][lang]=stat
 for c in cases:
  rr=[x for x in rows if x['id']==c['id'] and x['phase']!='development']
  if rr and not all(x['correct'] for x in rr):m['failures'].append({'id':c['id'],'question':c['question'],'lang':c['lang'],'phase':rr[0]['phase'],'expected':c['expected'],'expected_source':c['expected_source'],'actual':[x['actual'] for x in rr],'predicted_sources':[x['rendered']['sources'][0]['id'] if x['rendered']['sources'] else None for x in rr]})
 m['repeat_inconsistencies']=[id for id in {x['id'] for x in rows if x['phase']!='development'} if len({x['actual'] for x in rows if x['id']==id and x['phase']!='development'})>1]
 m['all_timing']=metrics(rows);summary['models'][pin['id']]=m
eligible=[m for m in summary['models'].values() if m['accepted']]
if eligible:summary['winner']=min(eligible,key=lambda m:m['pin']['bytes'])['pin']['id']
summary['total_requests']=len(allrows);summary['all_timing']=metrics(allrows)
(p/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
before=load(p/'source-before.json');changed=[n for n,h in before.items() if not(r/n).is_file() or hashlib.sha256((r/n).read_bytes()).hexdigest()!=h];assert not changed;(p/'source-integrity.json').write_text(json.dumps({'unchanged':True,'checked':len(before),'changed':[]},indent=2))
kb={x['id']:x for x in load(p/'knowledge-snapshot.json')}
for c in cases:
 for d in c['evidence']:
  k=kb[d['id']];assert d['text']==k['content'][c['lang']];assert k['audience']=='all' or c['role']=='hr' or c['role']=='manager' and k['audience']=='manager'
for x in allrows:
 c=ids[x['id']]
 for source in x['rendered']['sources']:assert source['quote']==kb[source['id']]['content'][x['lang']];assert source['id'] in [d['id'] for d in c['evidence']]
valid={'requests':len(allrows),'source_unchanged':True,'quotes_match_originals':True,'sources_available_to_case_role':True,'max_prompt_tokens':max(x.get('response',{}).get('usage',{}).get('prompt_tokens',0) for x in allrows),'context':2048}
(p/'validation.json').write_text(json.dumps(valid,indent=2))
lines=['# Сравнение Qwen3-0.6B и Qwen3-1.7B на RU/KK','',
'Дата: 17 октября 2026. Исходники проекта не изменены. Использован установленный llama.cpp b8936, CPU Ryzen 5 5500, 2 потока, context 2048, parallel 1, thinking off. Модели запускались строго по очереди в изолированных процессах, без изменения конфигурации ассистента приложения.','',
'## Решение','',
f"Подходящий фаворит по зафиксированным порогам: **{summary['winner'] or 'не выбран — ни одна модель не прошла все условия'}**.",'',
'Выбор первого результата даёт 33,3/100 на каждом наборе и языке. Победа над этой базой сама по себе не означает готовность. Требовалось ≥90/100 отдельно на RU и KK на старом отложенном и новом контрольном наборах, 100% отказов при отсутствии факта, отсутствие невалидных/ошибочных HTTP-ответов и каждый измеренный ответ ≤10 секунд. Если обе проходят, предпочитается меньший файл весов.','',
'## Модели и происхождение файлов','',
'Обе — Q4_K_M. Файлы получены от разных конвертеров: bartowski и ggml-org, поэтому это сравнение конкретных пригодных к развёртыванию GGUF-сборок, а не строгое исследование только числа параметров. Каждая версия закреплена по revision и проверена SHA256 перед запуском. Лицензия исходных моделей Apache-2.0.','',
'| Модель | Размер, МБ | Repository | Revision | SHA256 |','|---|---:|---|---|---|']
for pin in pins:lines.append(f"| {pin['id']} | {pin['bytes']/1e6:.1f} | {pin['repo']} | {pin['revision']} | {pin['sha256']} |")
lines+=['','## Протокол','',
'До ответов моделей зафиксированы 36 прежних случаев и 36 новых (по 18 на язык; 6 правильных первых, 6 вторых и 6 отсутствующих ответов). Для каждого положительного вопроса порядок источников менялся. Полные тексты взяты из текущей демонстрационной базы; никаких реальных персональных данных.','',
'На каждую модель: 18 development-вопросов × 2 конфигурации = 36 вызовов; старый holdout 18 × 2 повтора = 36; новый контроль 36 × 2 повтора = 72. Всего 144 на модель, 288 суммарно. Повторы не являются новыми независимыми задачами.','',
'Одинаковые конфигурации: (1) temperature=0, max_tokens=16; (2) temperature=0.7, top_p=0.8, top_k=20, min_p=0, max_tokens=16, seed=42. В обоих случаях локализованный промпт проверки достаточности, enable_thinking=false и response_format с целым числом 0/1/2. Для каждой модели настройка выбиралась только по development: лучший худший язык, затем общая точность, затем p95. На финальных наборах настройки не изменялись. Один фиксированный seed не проверяет все возможные случайные ответы.','',
'Новые темы: причина отказа, отмена уже одобренного отпуска, пересечение дат, повтор теста курса, ошибка профиля, запрет руководителю согласовывать себя; неизвестные права на аванс, стаж до отпуска, срок сертификата, телефон HR, размер вложения и номер статьи закона. Полный эталон: new-control-cases.json. Носитель казахского языка независимо набор не проверял; это контролируемая инженерная выборка, не оценка всех возможных формулировок.','',
'## Development','',
'| Модель | Режим | RU /100 | KK /100 | Выбран |','|---|---|---:|---:|---|']
for name,m in summary['models'].items():
 for config,x in m['development'].items():lines.append(f"| {name} | {config} | {x['ru']['score']:.1f} | {x['kk']['score']:.1f} | {'да' if config==m['selected']['id'] else 'нет'} |")
lines+=['','## Окончательное сравнение','',
'Баллы: правильный номер источника или правильный 0 = 100, неверный/невалидный = 0; среднее равно точности. Это узкий балл селектора, не прежняя подробная рубрика для естественного ответа.','',
'| Модель | Набор | Язык | Верно / N | Балл /100 | Верные отказы | Невалидные | p95, с | max, с | Проход |','|---|---|---|---:|---:|---:|---:|---:|---:|---|']
for name,m in summary['models'].items():
 for phase,langs in m['tests'].items():
  for lang,x in langs.items():lines.append(f"| {name} | {phase} | {lang.upper()} | {x['correct']}/{x['n']} | {x['score']:.1f} | {x['absent_correct']}/{x['absent_n']} | {x['invalid']} | {x['p95_ms']/1000:.3f} | {x['max_ms']/1000:.3f} | {'да' if x['accepted'] else 'нет'} |")
lines+=['','## Влияние повторов на скорость','', 'Второй проход может использовать почти полностью закешированный prompt. Поэтому быстрый повтор нельзя считать скоростью нового вопроса.', '', '| Модель | Набор | Язык | Первый проход p50 / max, с | Повтор p50 / max, с |', '|---|---|---|---:|---:|']
for name,m in summary['models'].items():
 for phase,langs in m['tests'].items():
  for lang,x in langs.items():
   a=x['timing_by_repeat']['1'];b=x['timing_by_repeat']['2'];lines.append(f"| {name} | {phase} | {lang} | {a['p50_ms']/1000:.3f} / {a['max_ms']/1000:.3f} | {b['p50_ms']/1000:.3f} / {b['max_ms']/1000:.3f} |")
lines+=['','## Ошибки и устойчивость','']
for name,m in summary['models'].items():
 lines += [f"### {name}",'',f"Случаев с разными решениями между повторами: {len(m['repeat_inconsistencies'])}.",'','| Случай | Эталон / документ | Ответы двух повторов |','|---|---|---|']
 for f in m['failures']:lines.append(f"| {f['id']} | {f['expected']} / {f['expected_source'] or 'нет'} | {' / '.join(str(x) for x in f['actual'])} |")
 if not m['failures']:lines.append('| Ошибок нет | — | — |')
lines+=['','## Скорость, цитаты и ограничения','',
f"Максимум среди всех {len(allrows)} обращений: {summary['all_timing']['max_ms']/1000:.3f} с; превышений 10 секунд: {summary['all_timing']['over_10s']}. Максимальный prompt: {valid['max_prompt_tokens']} токенов при контексте 2048.",'',
'Измерено время полного ответа локального /v1/chat/completions до разбора JSON. Это не браузерный/API-прогон приложения и не измерение развёрнутой генерации текста. Источники уже поданы модели: качество retrieval этим сравнением не проверяется. Измерения последовательные, без конкурентной нагрузки; первый старт отдельно в startup.json. У Qwen3-0.6B тесты могли идти одновременно с загрузкой второй модели (это отражено в startup.json); скорость отражает состояние этой машины, а не изолированный лабораторный минимум.','',
'Тестовый renderer формирует стандартный ответ из выбранного полного оригинального документа и добавляет id/title/version/quote. При 0 — локализованное отсутствие сведений, при невалидном выводе — технический статус. Это сохранённый артефакт проверки, не интеграция в приложение. Подлинность цитат проверена автоматически; их релевантность оценивается по эталонному источнику. Дословная выдержка не означает естественного и краткого ответа на конкретный вопрос. Источники не превращались в придуманные рабочие URL.','',
'Положительное оформление аванса не проверено: правил в базе нет. Проверен правильный отказ на соответствующие вопросы.','',
'## Файлы и воспроизводимость','',
'- protocol.json, dataset-manifest.json — параметры, пороги и замороженные хеши наборов.','- model-pins.json и *-installed.json — происхождение, версии, размеры и проверенные хеши.','- existing-cases.json, new-control-cases.json, knowledge-snapshot.json — вопросы, ответы-эталоны и источники.','- Qwen3-*/results.jsonl — полные запросы, ответы, цитаты, usage, время; ключи доступа не записаны.','- Qwen3-*/selection.json, startup.json, runtime.log — выбранные настройки и запуск.','- SUMMARY.json — все метрики и ошибки по вопросам.','- validation.json, source-integrity.json — проверки происхождения цитат и неизменности исходников.','- cleanup.json — фактически удалённые файлы либо причина сохранения весов.','',
'compare.mjs запускается Node 24 из корня проекта с аргументом новой подготовленной папки результатов. Подготовить в ней protocol.json, model-pins.json, оба набора и маркеры проверенной установки; установить пути к весам. Не запускать поверх текущих каталогов: они защищены от повторного создания. prepare-dataset.mjs и install-models.py фиксируют пути данного прогона; перед переносом изменить только пути в копиях тестовых скриптов. Исходники проекта для воспроизведения не требуется менять.','',
f"Проверено {len(before)} исходных файлов: изменений нет. Приложение не переключено на другую модель. Тестовые процессы завершены; старый runtime общего назначения сохранён.",'']
(p/'REPORT.md').write_text('\n'.join(lines))
print(json.dumps({'winner':summary['winner'],'tests':{name:m['tests'] for name,m in summary['models'].items()}},ensure_ascii=False,indent=2))
