import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, iso, uid, passwordRecord, checkPassword, publicPerson, personById, visibleEmployee, requestById, courseById, publicCourse, enrollmentData, notify, audit, normalizeDemoEmail } from './store.mjs';
import { knowledge, knowledgeSource } from './knowledge.mjs';
import { errorMessage } from './messages.mjs';
import { createAssistant } from './assistant.mjs';
import { resolveStaticPath } from './paths.mjs';
import { renderLeaveDocument, documentCSP } from './leave-document.mjs';
import { HttpError, fail } from './errors.mjs';
import { required, dateValue, today } from './validation.mjs';
import { createLeaveService } from './leave-service.mjs';
import { createHRInquiryService } from './hr-inquiries.mjs';
import { createMockIntegrations, integrationMode } from './integrations/mock-providers.mjs';
import { renderKnowledgeSource, knowledgeCSP } from './knowledge-page.mjs';
import { sameCompany, visibleCourse } from './access.mjs';
import { createDemoAccess } from './demo-access.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hashToken = value => createHash('sha256').update(value).digest('hex');
const L=(ru,kk,en)=>({ru,kk,en});
async function readBody(req,max=1_000_000) { let length=0; const chunks=[]; for await(const chunk of req) { length+=chunk.length; if(length>max) fail(413,'too_large','Файл или запрос превышает допустимый размер.'); chunks.push(chunk); } return Buffer.concat(chunks); }
async function jsonBody(req) { if(!String(req.headers['content-type']||'').startsWith('application/json')) fail(415,'content_type','Ожидается JSON-запрос.'); try { const data=JSON.parse((await readBody(req)).toString('utf8')); if(!data||typeof data!=='object'||Array.isArray(data)) throw Error(); return data; } catch(error) { if(error instanceof HttpError) throw error; fail(400,'invalid_json','Некорректный JSON.'); } }
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function localized(value,max,label) { if(typeof value==='string') { const text=required(value,max,label); return L(text,text,text); } if(!value||typeof value!=='object') fail(400,'invalid_input',`${label}: требуется текст.`); const ru=required(value.ru,max,label); return {ru,kk:typeof value.kk==='string'&&value.kk.trim()?required(value.kk,max,label):ru,en:typeof value.en==='string'&&value.en.trim()?required(value.en,max,label):ru}; }
function validateCourse(body,old) {
 const lessons=body.lessons;
 if(!Array.isArray(lessons)||lessons.length<1||lessons.length>20) fail(400,'invalid_course','Курс должен содержать от 1 до 20 уроков.');
 const quiz=body.quiz;
 if(!Array.isArray(quiz)||quiz.length<1||quiz.length>20) fail(400,'invalid_course','Добавьте от 1 до 20 вопросов теста.');
 const value={id:old?.id||uid('course'), title:localized(body.title,160,'Название'),description:localized(body.description,2000,'Описание'),category:required(body.category||'learning',80,'Категория'),durationMinutes:Number(body.durationMinutes)||15,published:body.published!==false,passScore:Number(body.passScore)||80,cover:['blue','violet','green','orange'].includes(body.cover)?body.cover:'blue',createdAt:old?.createdAt||iso(),updatedAt:iso(),
 lessons:lessons.map(x=>{if(!x||typeof x!=='object')fail(400,'invalid_course','Проверьте данные урока.');const lesson={id:typeof x.id==='string'&&/^[\w-]{1,80}$/.test(x.id)?x.id:uid('lesson'),title:localized(x.title,200,'Урок'),content:localized(x.content,15000,'Материал')}; if(x.resourceUrl) {try {const url=new URL(x.resourceUrl); if(!['http:','https:'].includes(url.protocol)) throw Error(); lesson.resourceUrl=url.href;} catch {fail(400,'invalid_url','Ссылка должна начинаться с https:// или http://.');}} return lesson;}),
 quiz:quiz.map(x=>{if(!x||typeof x!=='object')fail(400,'invalid_course','Проверьте данные вопроса.');if(!Array.isArray(x.options)||x.options.length<2||x.options.length>6||!Number.isInteger(x.correctIndex)||x.correctIndex<0||x.correctIndex>=x.options.length) fail(400,'invalid_course','Укажите варианты и один правильный ответ для каждого вопроса.'); return {id:typeof x.id==='string'?x.id:uid('q'),prompt:localized(x.prompt,1000,'Вопрос'),options:x.options.map(y=>localized(y,500,'Ответ')),correctIndex:x.correctIndex};})};
 if(!Number.isFinite(value.durationMinutes)||value.durationMinutes<1||value.durationMinutes>600||value.passScore<1||value.passScore>100) fail(400,'invalid_course','Проверьте длительность и проходной балл.');
 if(new Set(value.lessons.map(x=>x.id)).size!==value.lessons.length||new Set(value.quiz.map(x=>x.id)).size!==value.quiz.length) fail(400,'duplicate_id','Идентификаторы уроков и вопросов должны различаться.');
 return value;
}
export function createApplication(options={}) {
 const { answerQuestion, getAIStatus } = createAssistant({ modelProvider: options.modelProvider });
 const mode=integrationMode(options.integrationsMode??process.env.JANAMEN_INTEGRATIONS_MODE??'mock');
 const dataDir=resolve(options.dataDir||process.env.ASAR_DATA_DIR||join(root,'.data'));
 const {db,transaction,close}=openStore(dataDir,options);
 const demoAccess=createDemoAccess({db,dataDir,enabled:options.demoLogin??process.env.JANAMEN_DEMO_LOGIN==='1'});
 const integrations=createMockIntegrations({db,transaction,mode,fail});
 const loginAttempts=new Map();
 const getUser=req=>{ const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asar_session=')); if(!cookie) return null; const token=cookie.slice('asar_session='.length); if(!/^[a-f0-9]{64}$/.test(token)) return null; const session=db.prepare('SELECT userId FROM sessions WHERE tokenHash=? AND expiresAt>?').get(hashToken(token),iso()); return session?personById(db,session.userId):null; };
 const requireUser=req=>getUser(req)||fail(401,'unauthorized','Войдите в аккаунт.');
 const issueSession=(req,res,user)=>{
   const token=randomBytes(32).toString('hex');
   const previous=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asar_session='))?.slice(13);
   transaction(()=>{
     if(previous)db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hashToken(previous));
     db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(iso());
     db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),user.id,new Date(Date.now()+8*60*60*1000).toISOString());
   });
   res.setHeader('Set-Cookie',`asar_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);
   return send(res,200,{user:publicPerson(db,user)});
 };
 const hr=user=>{ if(user.role!=='hr') fail(403,'forbidden','Это действие доступно только HR.'); };
 const leave = createLeaveService({ db, transaction });
 const hrInquiries = createHRInquiryService({ db, transaction });
 const getRequest = leave.get;
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('X-Frame-Options','DENY');
  try {
   let url; try { url = new URL(req.url || '/', 'http://localhost'); } catch { fail(400, 'invalid_path', 'Некорректный адрес запроса.'); }
   const path = url.pathname;
   if(path.startsWith('/api/')) {
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin) { let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'origin','Недопустимый источник запроса.');} const allowed=[`http://${req.headers.host}`,`https://${req.headers.host}`,...(process.env.ASAR_ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:3000').split(',')]; if(!allowed.includes(origin.origin)) fail(403,'origin','Недопустимый источник запроса.'); }
    if(path==='/api/health'&&req.method==='GET') return send(res,200,{ok:true,storage:'sqlite',ai:await getAIStatus()});
    if(path==='/api/auth/demo'&&req.method==='GET') return send(res,200,demoAccess.catalog(req));
    if(path==='/api/auth/demo-login'&&req.method==='POST') {
      const accounts=demoAccess.accounts(req);if(!accounts.length)fail(404,'not_found','Демонстрационный вход недоступен.');
      const body=await jsonBody(req);if(Object.keys(body).length!==1||typeof body.role!=='string')fail(400,'invalid_input','Выберите демонстрационную роль.');
      const person=accounts.find(item=>item.role===body.role);if(!person)fail(400,'invalid_input','Выберите демонстрационную роль.');
      audit(db,person.id,'demo_login',person.id);return issueSession(req,res,person);
    }
    if(path==='/api/auth/login'&&req.method==='POST') {
      const key=req.socket.remoteAddress||'local', now=Date.now(); let attempt=loginAttempts.get(key); if(!attempt||attempt.until<now){attempt={count:0,until:now+15*60*1000}; loginAttempts.set(key,attempt);} if(attempt.count>=30) fail(429,'rate_limited','Слишком много попыток. Попробуйте позже.');
      const body=await jsonBody(req); const email=normalizeDemoEmail(required(body.email,200,'Email').toLowerCase()); const password=required(body.password,256,'Пароль'); const user=db.prepare('SELECT * FROM people WHERE email=?').get(email);
      const valid=user?checkPassword(password,user.passwordSalt,user.passwordHash):checkPassword(password,'not-a-user', '00'.repeat(64));
      if(!user||!valid){attempt.count++;fail(401,'invalid_credentials','Неверный email или пароль.');}attempt.count=0;
      return issueSession(req,res,user);
    }
    const user=requireUser(req);
    if(path==='/api/integrations'||path.startsWith('/api/integrations/')) {
      hr(user);
      if(path==='/api/integrations'&&req.method==='GET')return send(res,200,integrations.catalog());
      integrations.requireEnabled();
      const exactFields=(body,keys)=>{if(Object.keys(body).some(key=>!keys.includes(key)))fail(400,'invalid_input','Запрос содержит неподдерживаемые поля.');};
      if(path==='/api/integrations/1c-zup/employees'&&req.method==='GET')return send(res,200,integrations.personnel.employees());
      if(path==='/api/integrations/1c-zup/leave-balances'&&req.method==='GET')return send(res,200,integrations.personnel.leaveBalances());
      if(path==='/api/integrations/1c-zup/sync-preview'&&req.method==='POST') {
        const body=await jsonBody(req);exactFields(body,[]);return send(res,200,integrations.personnel.preview());
      }
      if(path==='/api/integrations/documentolog/documents'&&req.method==='POST') {
        const body=await jsonBody(req);exactFields(body,['requestId']);const request=getRequest(user,required(body.requestId,100,'requestId'));
        if(request.status!=='approved')fail(409,'document_not_ready','Сначала требуется окончательное согласование HR.');
        const snapshot=leave.document(user,request.id);
        const result=integrations.register(snapshot,user.id);return send(res,result.created?201:200,result);
      }
      const documentMatch=path.match(/^\/api\/integrations\/documentolog\/documents\/([\w-]+)(\/mock-transition)?$/);
      if(documentMatch&&req.method==='GET'&&!documentMatch[2]) { const result=integrations.document(documentMatch[1]); getRequest(user,result.document.requestId); return send(res,200,result); }
      if(documentMatch&&req.method==='POST'&&documentMatch[2]) {
        const body=await jsonBody(req);exactFields(body,['status']);getRequest(user,integrations.document(documentMatch[1]).document.requestId);return send(res,200,integrations.transition(documentMatch[1],body.status,user.id));
      }
      fail(404,'not_found','Раздел интеграции не найден.');
    }
    if(path==='/api/auth/logout'&&req.method==='POST') { const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asar_session='))?.slice(13); if(token)db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hashToken(token));res.setHeader('Set-Cookie','asar_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true}); }
    if(path==='/api/bootstrap'&&req.method==='GET') {
      const people=db.prepare('SELECT * FROM people ORDER BY name').all().filter(p=>visibleEmployee(user,p));
      const requests=db.prepare('SELECT id,employeeId FROM requests ORDER BY createdAt DESC').all().filter(r=>visibleEmployee(user,personById(db,r.employeeId))).map(r=>requestById(db,r.id));
      const courses=db.prepare('SELECT data FROM courses').all().map(x=>JSON.parse(x.data)).filter(c=>visibleCourse(user,c)).map(c=>publicCourse(c,user));
      const enrollments=db.prepare('SELECT * FROM enrollments ORDER BY assignedAt DESC').all().filter(e=>visibleEmployee(user,personById(db,e.userId))).map(e=>enrollmentData(e,db));
      const notifications=db.prepare('SELECT data FROM notifications WHERE userId=?').all(user.id).map(x=>JSON.parse(x.data)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      const documents=knowledge.filter(k=>k.audience==='all'||user.role==='hr'||(user.role==='manager'&&k.audience==='manager'));
      return send(res,200,{user:publicPerson(db,user),people:people.map(p=>publicPerson(db,p)),requests,courses,enrollments,notifications,hrInquiries:hrInquiries.list(user),knowledge:documents,ai:await getAIStatus()});
    }
    if(path==='/api/hr-inquiries'&&req.method==='GET') return send(res,200,hrInquiries.list(user));
    if(path==='/api/hr-inquiries'&&req.method==='POST') {
      const result=hrInquiries.submit(user,await jsonBody(req));
      return send(res,result.replayed?200:201,result.inquiry);
    }
    const inquiryMatch=path.match(/^\/api\/hr-inquiries\/([\w-]+)(\/answer)?$/);
    if(inquiryMatch&&req.method==='GET'&&!inquiryMatch[2]) return send(res,200,hrInquiries.get(user,inquiryMatch[1]));
    if(inquiryMatch&&req.method==='POST'&&inquiryMatch[2]) return send(res,200,hrInquiries.answer(user,inquiryMatch[1],await jsonBody(req)));
    let profileMatch=path.match(/^\/api\/people\/([\w-]+)\/profile$/);
    if(profileMatch&&req.method==='GET') {
      const person=personById(db,profileMatch[1]);if(!person||!visibleEmployee(user,person))fail(404,'not_found','Профиль не найден или недоступен.');
      return send(res,200,publicPerson(db,person));
    }
    if(profileMatch&&req.method==='POST') {
      hr(user);const person=personById(db,profileMatch[1]);if(!person||!sameCompany(user,person))fail(404,'not_found','Сотрудник не найден.');const body=await jsonBody(req);
      const allowed=['name','company','department','position','managerId','hiredAt','phone','employeeNumber'];if(Object.keys(body).some(key=>!allowed.includes(key)))fail(400,'invalid_input','Через профиль нельзя менять роль, пароль, email или остаток отпуска.');
      const name=required(body.name??person.name,120,'ФИО'),company=required(person.company,160,'Компания'),department=required(body.department??person.department,120,'Подразделение'),position=required(body.position??person.position,120,'Должность'),hiredAt=body.hiredAt??person.hiredAt;dateValue(hiredAt);
      if(!sameCompany(user,{company:required(body.company??person.company,160,'Компания')}))fail(400,'invalid_company','Компания определяется учётной записью HR. Перевод между компаниями недоступен.');
      const managerId=Object.hasOwn(body,'managerId')?body.managerId:person.managerId;
      if(managerId!==null&&(typeof managerId!=='string'||!managerId))fail(400,'invalid_manager','Выберите руководителя или оставьте поле пустым.');
      if(managerId){let current=personById(db,managerId);if(!current||!sameCompany(user,current)||!['manager','hr'].includes(current.role))fail(400,'invalid_manager','Выберите руководителя с соответствующей ролью.');const seen=new Set([person.id]);while(current){if(seen.has(current.id))fail(400,'invalid_manager','В цепочке руководителей не должно быть циклов.');seen.add(current.id);current=current.managerId?personById(db,current.managerId):null;}}
      const savedProfile=db.prepare('SELECT phone,employeeNumber FROM person_profiles WHERE personId=?').get(person.id)||{};
      const optional=(key,max)=>{const value=body[key]??savedProfile[key]??'';if(typeof value!=='string'||value.length>max)fail(400,'invalid_input','Проверьте контактный телефон и табельный номер.');return value.trim();};const phone=optional('phone',40),employeeNumber=optional('employeeNumber',40);
      const changed = Object.entries({name,company,department,position,managerId,hiredAt}).some(([key,value])=>value!==person[key]) || phone!==(savedProfile.phone||'') || employeeNumber!==(savedProfile.employeeNumber||'');
      transaction(()=>{
        if(managerId!==person.managerId&&db.prepare("SELECT id FROM requests WHERE employeeId=? AND status IN ('pending_manager','pending_hr')").get(person.id))fail(409,'profile_pending_requests','Сначала завершите или отмените действующие заявки сотрудника, затем измените руководителя.');
        if(employeeNumber&&db.prepare('SELECT p.id,p.company FROM people p JOIN person_profiles pp ON pp.personId=p.id WHERE lower(pp.employeeNumber)=lower(?) AND p.id<>?').all(employeeNumber,person.id).some(p=>sameCompany(user,p)))fail(409,'employee_number_exists','Этот табельный номер уже занят в компании.');
        db.prepare('UPDATE people SET name=?,company=?,department=?,position=?,managerId=?,hiredAt=? WHERE id=?').run(name,company,department,position,managerId,hiredAt,person.id);
        db.prepare('INSERT INTO person_profiles (personId,phone,employeeNumber) VALUES (?,?,?) ON CONFLICT(personId) DO UPDATE SET phone=excluded.phone,employeeNumber=excluded.employeeNumber').run(person.id,phone,employeeNumber);
        if(changed){audit(db,user.id,'profile_updated',person.id);notify(db,person.id,'profile_updated',L('Кадровые данные обновлены','Кадрлық деректер жаңартылды','Personnel details updated'),L('HR обновил ваш профиль. Проверьте сведения перед оформлением заявления.','HR профиліңізді жаңартты. Өтініш бермес бұрын мәліметтерді тексеріңіз.','HR updated your profile. Review the details before submitting a request.'),'profile',person.id);}
      });return send(res,200,publicPerson(db,personById(db,person.id)));
    }
    const sourceMatch=path.match(/^\/api\/knowledge\/([\w-]+)$/);
    if(sourceMatch&&req.method==='GET') {
      const document=knowledge.find(item=>item.id===sourceMatch[1]);if(!document||!(document.audience==='all'||user.role==='hr'||(document.audience==='manager'&&user.role==='manager')))fail(404,'not_found','Источник не найден или недоступен.');
      const language=['ru','kk','en'].includes(url.searchParams.get('lang'))?url.searchParams.get('lang'):String(req.headers['accept-language']||'ru').slice(0,2);const lang=['ru','kk','en'].includes(language)?language:'ru';
      const source=knowledgeSource(document,lang);res.setHeader('Vary','Accept');
      if(String(req.headers.accept||'').includes('text/html')) {
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':knowledgeCSP,'X-Content-Type-Options':'nosniff'});
        return res.end(renderKnowledgeSource(source,lang));
      }
      return send(res,200,source);
    }
    if (path === '/api/requests' && req.method === 'POST') {
      const result = leave.submit(user, await jsonBody(req));
      return send(res, result.replayed ? 200 : 201, result.request);
    }
    let match=path.match(/^\/api\/requests\/([\w-]+)$/);
    if(match&&req.method==='GET') return send(res,200,getRequest(user,match[1]));
    match=path.match(/^\/api\/requests\/([\w-]+)\/document-processing$/);
    if(match&&req.method==='GET') {
      getRequest(user,match[1]);
      return send(res,200,integrations.processing(match[1]));
    }
    match=path.match(/^\/api\/requests\/([\w-]+)\/document$/);
    if(match&&req.method==='GET') {
      const document = leave.document(user, match[1]);
      const html=renderLeaveDocument(document,url.searchParams.get('lang')||String(req.headers['accept-language']||'ru').slice(0,2));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`inline; filename="janamen-leave-${match[1]}.html"`,'Content-Security-Policy':documentCSP});return res.end(html);
    }
    match=path.match(/^\/api\/requests\/([\w-]+)\/action$/);
    if (match && req.method === 'POST') {
      return send(res, 200, leave.decide(user, match[1], await jsonBody(req)));
    }
    match=path.match(/^\/api\/requests\/([\w-]+)\/attachments$/);
    if(match&&req.method==='POST') {
      const request = leave.checkAttachment(user, match[1]);
      let name;try{name=decodeURIComponent(String(req.headers['x-file-name']||''));}catch{fail(400,'invalid_file','Некорректное имя файла.');}name=required(name.replace(/[\x00-\x1f/\\]/g,'_'),200,'Имя файла');const bytes=await readBody(req,10*1024*1024);if(!bytes.length)fail(400,'empty_file','Файл пуст.');const id=uid('file'),file=join(dataDir,'uploads',id);writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
      try { leave.recordAttachment(user, request.id, { id, name, size: bytes.length }); } catch (error) { unlinkSync(file); throw error; }
      return send(res,201,{id,name,size:bytes.length,mimeType:'application/octet-stream'});
    }
    match=path.match(/^\/api\/attachments\/([\w-]+)$/);
    if(match&&req.method==='GET') {const file=db.prepare('SELECT * FROM attachments WHERE id=?').get(match[1]);if(!file)fail(404,'not_found','Файл не найден.');getRequest(user,file.requestId);const storedFile=join(dataDir,'uploads',file.id);if(!existsSync(storedFile))fail(404,'not_found','Файл отсутствует в хранилище.');res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.size,'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store'});createReadStream(storedFile).on('error',()=>res.destroy()).pipe(res);return;}
    if(path==='/api/notifications/read'&&req.method==='POST') {
      const body=await jsonBody(req);
      const hasId=Object.hasOwn(body,'id'),hasIds=Object.hasOwn(body,'ids');
      const validId=id=>typeof id==='string'&&id.trim().length>0&&id.length<=100;
      if(Object.keys(body).some(key=>!['id','ids'].includes(key))||(hasId&&hasIds)||(hasId&&!validId(body.id))
        ||(hasIds&&(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||!body.ids.every(validId))))fail(400,'invalid_input','Выберите уведомления для прочтения.');
      const targets=hasIds?new Set(body.ids):hasId?new Set([body.id]):null;
      const readAt=iso();
      transaction(()=>{for(const row of db.prepare('SELECT id,data FROM notifications WHERE userId=?').all(user.id)){
        if(targets&&!targets.has(row.id))continue;
        const item=JSON.parse(row.data);if(!item.readAt){item.readAt=readAt;db.prepare('UPDATE notifications SET data=? WHERE id=?').run(JSON.stringify(item),row.id);}
      }});
      return send(res,200,{ok:true});
    }
    if(path==='/api/courses'&&req.method==='POST') {hr(user);const body=await jsonBody(req);const old=body.id?courseById(db,body.id):null;if(body.id&&!visibleCourse(user,old))fail(404,'not_found','Курс не найден.');const course={...validateCourse(body,old),company:old?.company??user.company};transaction(()=>{db.prepare('INSERT INTO courses VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(course.id,JSON.stringify(course));if(old&&(JSON.stringify(old.lessons)!==JSON.stringify(course.lessons)||JSON.stringify(old.quiz)!==JSON.stringify(course.quiz)||old.passScore!==course.passScore)){db.prepare("UPDATE enrollments SET completedLessonIds='[]',score=NULL,passed=0,completedAt=NULL WHERE courseId=?").run(course.id);for(const e of db.prepare('SELECT userId FROM enrollments WHERE courseId=?').all(course.id))notify(db,e.userId,'course_updated',L('Курс обновлён','Курс жаңартылды','Course updated'),L('Материалы изменились. Пройдите курс заново.','Материалдар өзгерді. Курсты қайта өтіңіз.','Materials changed. Please complete the updated course.'),'academy',course.id);}audit(db,user.id,'course_saved',course.id);});return send(res,old?200:201,course);}
    match=path.match(/^\/api\/courses\/([\w-]+)\/assign$/);
    if(match&&req.method==='POST') {hr(user);const body=await jsonBody(req);const course=courseById(db,match[1]);if(!visibleCourse(user,course)||!course.published)fail(404,'not_found','Опубликованный курс не найден.');if(!Array.isArray(body.userIds)||!body.userIds.length||body.userIds.length>100)fail(400,'invalid_input','Выберите сотрудников.');const ids=[...new Set(body.userIds)];for(const id of ids)if(typeof id!=='string'||!sameCompany(user,personById(db,id)))fail(400,'invalid_user','Сотрудник не найден.');transaction(()=>{for(const id of ids){const exists=db.prepare('SELECT id FROM enrollments WHERE userId=? AND courseId=?').get(id,course.id);if(exists)continue;db.prepare('INSERT INTO enrollments VALUES (?,?,?,?,?,?,?,?)').run(uid('enroll'),id,course.id,'[]',null,0,null,iso());notify(db,id,'course_assigned',L('Вам назначен курс','Сізге курс тағайындалды','New course assigned'),course.title,'academy',course.id);}audit(db,user.id,'course_assigned',course.id);});return send(res,200,{ok:true});}
    match=path.match(/^\/api\/courses\/([\w-]+)\/lessons\/([\w-]+)\/complete$/);
    if(match&&req.method==='POST') {
      await jsonBody(req);
      const course=courseById(db,match[1]);
      const enrollment=db.prepare('SELECT * FROM enrollments WHERE userId=? AND courseId=?').get(user.id,match[1]);
      if(!visibleCourse(user,course)||!course.published||!enrollment)fail(404,'not_found','Курс не назначен вашему аккаунту.');
      const lesson=course.lessons.find(item=>item.id===match[2]);
      if(!lesson)fail(404,'not_found','Урок не найден.');
      const ids=JSON.parse(enrollment.completedLessonIds);
      if(!ids.includes(lesson.id)) transaction(()=>{
        ids.push(lesson.id);
        db.prepare('UPDATE enrollments SET completedLessonIds=? WHERE id=?').run(JSON.stringify(ids),enrollment.id);
        notify(db,user.id,'lesson_completed',L('Урок завершён','Сабақ аяқталды','Lesson completed'),L(`${lesson.title.ru} · ${ids.length}/${course.lessons.length}`,`${lesson.title.kk} · ${ids.length}/${course.lessons.length}`,`${lesson.title.en} · ${ids.length}/${course.lessons.length}`),'academy',course.id);
      });
      return send(res,200,{ok:true});
    }
    match=path.match(/^\/api\/courses\/([\w-]+)\/quiz$/);
    if(match&&req.method==='POST') {const body=await jsonBody(req);const course=courseById(db,match[1]);const enrollment=db.prepare('SELECT * FROM enrollments WHERE userId=? AND courseId=?').get(user.id,match[1]);if(!visibleCourse(user,course)||!course.published||!enrollment)fail(404,'not_found','Курс не назначен вашему аккаунту.');if(!course.lessons.every(l=>JSON.parse(enrollment.completedLessonIds).includes(l.id)))fail(409,'lessons_required','Сначала завершите все уроки.');if(!Array.isArray(body.answers)||body.answers.length!==course.quiz.length||body.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=course.quiz[i].options.length))fail(400,'invalid_answers','Ответьте на все вопросы теста.');const score=Math.round(course.quiz.filter((q,i)=>q.correctIndex===body.answers[i]).length/course.quiz.length*100);const bestScore=Math.max(enrollment.score||0,score);const passed=bestScore>=course.passScore;transaction(()=>{db.prepare('UPDATE enrollments SET score=?,passed=?,completedAt=? WHERE id=?').run(bestScore,passed?1:0,passed?(enrollment.completedAt||iso()):null,enrollment.id);if(passed&&!enrollment.passed){notify(db,user.id,'course_completed',L('Курс пройден!','Курс аяқталды!','Course completed!'),course.title,'academy',course.id);if(user.managerId)notify(db,user.managerId,'course_completed',L('Сотрудник завершил курс','Қызметкер курсты аяқтады','Employee completed a course'),L(`${user.name}: ${course.title.ru}`,`${user.name}: ${course.title.kk}`,`${user.name}: ${course.title.en}`),'academy',course.id);for(const h of db.prepare("SELECT id,company FROM people WHERE role='hr'").all())if(sameCompany(user,h)&&h.id!==user.id&&h.id!==user.managerId)notify(db,h.id,'course_completed',L('Обучение завершено','Оқу аяқталды','Learning completed'),L(`${user.name}: ${course.title.ru}`,`${user.name}: ${course.title.kk}`,`${user.name}: ${course.title.en}`),'academy',course.id);audit(db,user.id,'course_completed',course.id);}});return send(res,200,{score,passed:score>=course.passScore,bestScore,feedback:course.quiz.map((q,i)=>({id:q.id,correct:q.correctIndex===body.answers[i]}))});}
    if(path==='/api/people'&&req.method==='POST') {hr(user);const body=await jsonBody(req);const name=required(body.name,120,'ФИО'),email=normalizeDemoEmail(required(body.email,200,'Email').toLowerCase()),password=required(body.password,256,'Пароль');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'invalid_email','Укажите корректный email.');if(password.length<10)fail(400,'weak_password','Используйте пароль не короче 10 символов.');if(!['employee','manager','hr'].includes(body.role))fail(400,'invalid_role','Выберите допустимую роль.');const manager=body.managerId?personById(db,body.managerId):null;if(body.managerId&&(!manager||!sameCompany(user,manager)||!['manager','hr'].includes(manager.role)))fail(400,'invalid_manager','Назначьте руководителя с соответствующей ролью.');const hiredAt=body.hiredAt||today();dateValue(hiredAt);const balance=Number(body.leaveBalance??24);if(!Number.isInteger(balance)||balance<0||balance>365)fail(400,'invalid_balance','Остаток должен быть целым числом от 0 до 365.');if(db.prepare('SELECT id FROM people WHERE email=?').get(email))fail(409,'email_exists','Этот email уже зарегистрирован.');const id=uid('person'),{salt,hash}=passwordRecord(password);transaction(()=>{db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,email,name,body.role,user.company,required(body.department,120,'Подразделение'),required(body.position,120,'Должность'),manager?.id||null,hiredAt,balance,salt,hash);db.prepare('INSERT INTO person_profiles (personId,employeeNumber) VALUES (?,?)').run(id,`JM-${id.slice(-8).toUpperCase()}`);audit(db,user.id,'person_created',id);});return send(res,201,publicPerson(db,personById(db,id)));}
    if(path==='/api/assistant'&&req.method==='POST') {const body=await jsonBody(req);const question=required(body.question,2000,'Вопрос');const lang=['ru','kk','en'].includes(body.lang)?body.lang:'ru';return send(res,200,await answerQuestion({question,lang,user:publicPerson(db,personById(db,user.id))}));}
    fail(404,'not_found','Раздел API не найден.');
   }
   if(!['GET','HEAD'].includes(req.method))fail(405,'method_not_allowed','Метод не поддерживается.');
   const dist=join(root,'dist');let requested;try{requested=decodeURIComponent(path);}catch{fail(400,'invalid_path','Неверный путь.');}let file=resolveStaticPath(dist,requested);if(!file)fail(404,'not_found','Файл не найден.');if(!existsSync(file)||!statSync(file).isFile()){if(extname(requested))fail(404,'not_found','Файл не найден.');file=join(dist,'index.html');}if(!existsSync(file))fail(503,'build_required','Сначала выполните npm run build или запустите npm run dev.');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch(error) { if(res.headersSent){res.destroy();return;}if(!(error instanceof HttpError))console.error('Application error:',error);send(res,error.status||500,{error:errorMessage(error.code||'internal_error',error.status?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.',req.headers['accept-language']),code:error.code||'internal_error'}); }
 });
 return {server,dataDir,close};
}
