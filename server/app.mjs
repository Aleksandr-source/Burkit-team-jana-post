import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, iso, uid, passwordRecord, checkPassword, publicPerson, personById, visibleEmployee, requestById, courseById, publicCourse, enrollmentData, notify, audit, normalizeDemoEmail } from './store.mjs';
import { knowledge, knowledgeSource } from './knowledge.mjs';
import { errorMessage } from './messages.mjs';
import { answerQuestion, getAIStatus } from './assistant.mjs';
import { resolveStaticPath } from './paths.mjs';
import { captureLeaveDocument, renderLeaveDocument, documentCSP } from './leave-document.mjs';
import { createMockIntegrations, integrationMode } from './integrations/mock-providers.mjs';
import { renderKnowledgeSource, knowledgeCSP } from './knowledge-page.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const activeStatuses = ['pending_manager','pending_hr'];
const hashToken = value => createHash('sha256').update(value).digest('hex');
class HttpError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } }
const fail = (status, code, message) => { throw new HttpError(status,code,message); };
const required = (value,max=500,label='Поле') => { if(typeof value!=='string'||!value.trim()||value.trim().length>max) fail(400,'invalid_input',`${label}: заполните корректное значение (до ${max} символов).`); return value.trim(); };
const dateValue = value => { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400,'invalid_date','Укажите корректную дату.'); const date = new Date(`${value}T00:00:00.000Z`); if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) fail(400,'invalid_date','Такой календарной даты не существует.'); return date; };
function today() { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-'); }
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
 const mode=integrationMode(options.integrationsMode??process.env.JANAMEN_INTEGRATIONS_MODE??'mock');
 const dataDir=resolve(options.dataDir||process.env.ASAR_DATA_DIR||join(root,'.data'));
 const {db,transaction,close}=openStore(dataDir,options);
 const integrations=createMockIntegrations({db,transaction,mode,fail});
 const loginAttempts=new Map();
 const getUser=req=>{ const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asar_session=')); if(!cookie) return null; const token=cookie.slice('asar_session='.length); if(!/^[a-f0-9]{64}$/.test(token)) return null; const session=db.prepare('SELECT userId FROM sessions WHERE tokenHash=? AND expiresAt>?').get(hashToken(token),iso()); return session?personById(db,session.userId):null; };
 const requireUser=req=>getUser(req)||fail(401,'unauthorized','Войдите в аккаунт.');
 const hr=user=>{ if(user.role!=='hr') fail(403,'forbidden','Это действие доступно только HR.'); };
 const getRequest=(user,id)=>{const value=requestById(db,id); if(!value||!visibleEmployee(user,personById(db,value.employeeId))) fail(404,'not_found','Заявка не найдена или недоступна.'); return value;};
 const history=(request,user,action,comment='')=>{ const at=iso();const entries=[...request.history,{id:uid('h'),actorName:user.name,action,comment,at}]; db.prepare('UPDATE requests SET history=?,updatedAt=? WHERE id=?').run(JSON.stringify(entries),at,request.id);audit(db,user.id,action,request.id); };
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('X-Frame-Options','DENY');
  try {
   let url; try { url = new URL(req.url || '/', 'http://localhost'); } catch { fail(400, 'invalid_path', 'Некорректный адрес запроса.'); }
   const path = url.pathname;
   if(path.startsWith('/api/')) {
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin) { let origin;try{origin=new URL(req.headers.origin);}catch{fail(403,'origin','Недопустимый источник запроса.');} const allowed=[`http://${req.headers.host}`,`https://${req.headers.host}`,...(process.env.ASAR_ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:3000').split(',')]; if(!allowed.includes(origin.origin)) fail(403,'origin','Недопустимый источник запроса.'); }
    if(path==='/api/health'&&req.method==='GET') return send(res,200,{ok:true,storage:'sqlite',ai:await getAIStatus()});
    if(path==='/api/auth/login'&&req.method==='POST') {
      const key=req.socket.remoteAddress||'local', now=Date.now(); let attempt=loginAttempts.get(key); if(!attempt||attempt.until<now){attempt={count:0,until:now+15*60*1000}; loginAttempts.set(key,attempt);} if(attempt.count>=30) fail(429,'rate_limited','Слишком много попыток. Попробуйте позже.');
      const body=await jsonBody(req); const email=normalizeDemoEmail(required(body.email,200,'Email').toLowerCase()); const password=required(body.password,256,'Пароль'); const user=db.prepare('SELECT * FROM people WHERE email=?').get(email);
      const valid=user?checkPassword(password,user.passwordSalt,user.passwordHash):checkPassword(password,'not-a-user', '00'.repeat(64));
      if(!user||!valid){attempt.count++;fail(401,'invalid_credentials','Неверный email или пароль.');}attempt.count=0;
      const token=randomBytes(32).toString('hex'); db.prepare('DELETE FROM sessions WHERE expiresAt<?').run(iso()); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),user.id,new Date(Date.now()+8*60*60*1000).toISOString());
      res.setHeader('Set-Cookie',`asar_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(res,200,{user:publicPerson(db,user)});
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
        const saved=db.prepare('SELECT data FROM request_documents WHERE requestId=?').get(request.id);
        const snapshot=saved?JSON.parse(saved.data):captureLeaveDocument(publicPerson(db,personById(db,request.employeeId)),request,iso(),false);
        const result=integrations.register(snapshot,user.id);return send(res,result.created?201:200,result);
      }
      const documentMatch=path.match(/^\/api\/integrations\/documentolog\/documents\/([\w-]+)(\/mock-transition)?$/);
      if(documentMatch&&req.method==='GET'&&!documentMatch[2])return send(res,200,integrations.document(documentMatch[1]));
      if(documentMatch&&req.method==='POST'&&documentMatch[2]) {
        const body=await jsonBody(req);exactFields(body,['status']);return send(res,200,integrations.transition(documentMatch[1],body.status,user.id));
      }
      fail(404,'not_found','Раздел интеграции не найден.');
    }
    if(path==='/api/auth/logout'&&req.method==='POST') { const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asar_session='))?.slice(13); if(token)db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hashToken(token));res.setHeader('Set-Cookie','asar_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true}); }
    if(path==='/api/bootstrap'&&req.method==='GET') {
      const people=db.prepare('SELECT * FROM people ORDER BY name').all().filter(p=>visibleEmployee(user,p));
      const requests=db.prepare('SELECT id,employeeId FROM requests ORDER BY createdAt DESC').all().filter(r=>visibleEmployee(user,personById(db,r.employeeId))).map(r=>requestById(db,r.id));
      const courses=db.prepare('SELECT data FROM courses').all().map(x=>JSON.parse(x.data)).filter(c=>c.published||user.role==='hr').map(c=>publicCourse(c,user));
      const enrollments=db.prepare('SELECT * FROM enrollments ORDER BY assignedAt DESC').all().filter(e=>visibleEmployee(user,personById(db,e.userId))).map(e=>enrollmentData(e,db));
      const notifications=db.prepare('SELECT data FROM notifications WHERE userId=?').all(user.id).map(x=>JSON.parse(x.data)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      const documents=knowledge.filter(k=>k.audience==='all'||user.role==='hr'||(user.role==='manager'&&k.audience==='manager'));
      return send(res,200,{user:publicPerson(db,user),people:people.map(p=>publicPerson(db,p)),requests,courses,enrollments,notifications,knowledge:documents,ai:await getAIStatus()});
    }
    let profileMatch=path.match(/^\/api\/people\/([\w-]+)\/profile$/);
    if(profileMatch&&req.method==='GET') {
      const person=personById(db,profileMatch[1]);if(!person||!visibleEmployee(user,person))fail(404,'not_found','Профиль не найден или недоступен.');
      return send(res,200,publicPerson(db,person));
    }
    if(profileMatch&&req.method==='POST') {
      hr(user);const person=personById(db,profileMatch[1]);if(!person)fail(404,'not_found','Сотрудник не найден.');const body=await jsonBody(req);
      const allowed=['name','company','department','position','managerId','hiredAt','phone','employeeNumber'];if(Object.keys(body).some(key=>!allowed.includes(key)))fail(400,'invalid_input','Через профиль нельзя менять роль, пароль, email или остаток отпуска.');
      const name=required(body.name??person.name,120,'ФИО'),company=required(body.company??person.company,160,'Компания'),department=required(body.department??person.department,120,'Подразделение'),position=required(body.position??person.position,120,'Должность'),hiredAt=body.hiredAt??person.hiredAt;dateValue(hiredAt);
      const managerId=Object.hasOwn(body,'managerId')?body.managerId:person.managerId;
      if(managerId!==null&&(typeof managerId!=='string'||!managerId))fail(400,'invalid_manager','Выберите руководителя или оставьте поле пустым.');
      if(managerId){let current=personById(db,managerId);if(!current||!['manager','hr'].includes(current.role))fail(400,'invalid_manager','Выберите руководителя с соответствующей ролью.');const seen=new Set([person.id]);while(current){if(seen.has(current.id))fail(400,'invalid_manager','В цепочке руководителей не должно быть циклов.');seen.add(current.id);current=current.managerId?personById(db,current.managerId):null;}}
      const savedProfile=db.prepare('SELECT phone,employeeNumber FROM person_profiles WHERE personId=?').get(person.id)||{};
      const optional=(key,max)=>{const value=body[key]??savedProfile[key]??'';if(typeof value!=='string'||value.length>max)fail(400,'invalid_input','Проверьте контактный телефон и табельный номер.');return value.trim();};const phone=optional('phone',40),employeeNumber=optional('employeeNumber',40);
      transaction(()=>{
        if(managerId!==person.managerId&&db.prepare("SELECT id FROM requests WHERE employeeId=? AND status IN ('pending_manager','pending_hr')").get(person.id))fail(409,'profile_pending_requests','Сначала завершите или отмените действующие заявки сотрудника, затем измените руководителя.');
        if(employeeNumber&&db.prepare('SELECT p.id FROM people p JOIN person_profiles pp ON pp.personId=p.id WHERE lower(pp.employeeNumber)=lower(?) AND p.company=? AND p.id<>?').get(employeeNumber,company,person.id))fail(409,'employee_number_exists','Этот табельный номер уже занят в компании.');
        db.prepare('UPDATE people SET name=?,company=?,department=?,position=?,managerId=?,hiredAt=? WHERE id=?').run(name,company,department,position,managerId,hiredAt,person.id);
        db.prepare('INSERT INTO person_profiles (personId,phone,employeeNumber) VALUES (?,?,?) ON CONFLICT(personId) DO UPDATE SET phone=excluded.phone,employeeNumber=excluded.employeeNumber').run(person.id,phone,employeeNumber);audit(db,user.id,'profile_updated',person.id);
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
    if(path==='/api/requests'&&req.method==='POST') {
      const body=await jsonBody(req);const start=dateValue(body.startDate),end=dateValue(body.endDate);if(body.startDate<today())fail(400,'past_date','Начало отпуска не может быть в прошлом.');const days=Math.round((end-start)/86400000)+1;if(days<1||days>366)fail(400,'invalid_range','Проверьте даты начала и окончания отпуска.');const reason=body.reason == null ? '' : typeof body.reason==='string' && body.reason.length<=2000 ? body.reason.trim() : fail(400,'invalid_input','Комментарий должен быть текстом до 2000 символов.'); if(!user.managerId)fail(409,'missing_manager','Для подачи заявки HR должен назначить руководителя.');
      const value=transaction(()=>{
        const person=publicPerson(db,personById(db,user.id));if(days>person.leaveBalance-person.leaveReserved)fail(409,'insufficient_balance','Недостаточно доступных дней отпуска.');
        const overlap=db.prepare("SELECT id FROM requests WHERE employeeId=? AND status IN ('pending_manager','pending_hr','approved') AND startDate<=? AND endDate>=?").get(user.id,body.endDate,body.startDate);if(overlap)fail(409,'overlap','На эти даты уже есть активная заявка.');
        const id=uid('leave'),at=iso(); const entries=[{id:uid('h'),actorName:user.name,action:'submitted',comment:reason,at}];
        db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,user.id,body.startDate,body.endDate,days,reason,'pending_manager',at,at,JSON.stringify(entries));audit(db,user.id,'submitted',id);
        notify(db,user.managerId,'request_submitted',L('Новая заявка на отпуск','Жаңа демалыс өтінімі','New leave request'),L(`${user.name} ожидает согласования.`,`${user.name} келісуді күтуде.`,`${user.name} is awaiting approval.`),'requests',id);
        notify(db,user.id,'request_submitted',L('Заявка отправлена','Өтінім жіберілді','Request submitted'),L('Руководитель получил заявку. Дни зарезервированы.','Басшы өтінімді алды. Күндер резервке қойылды.','Your manager received the request. Days are reserved.'),'requests',id);
        return requestById(db,id);
      });return send(res,201,value);
    }
    let match=path.match(/^\/api\/requests\/([\w-]+)$/);
    if(match&&req.method==='GET') return send(res,200,getRequest(user,match[1]));
    match=path.match(/^\/api\/requests\/([\w-]+)\/document$/);
    if(match&&req.method==='GET') {
      const request=getRequest(user,match[1]);if(request.status!=='approved')fail(409,'document_not_ready','Заявление доступно после согласования руководителем и HR.');
      let row=db.prepare('SELECT data FROM request_documents WHERE requestId=?').get(request.id);
      if(!row){const document=captureLeaveDocument(publicPerson(db,personById(db,request.employeeId)),request,iso(),false);db.prepare('INSERT OR IGNORE INTO request_documents VALUES (?,?)').run(request.id,JSON.stringify(document));row=db.prepare('SELECT data FROM request_documents WHERE requestId=?').get(request.id);}
      const html=renderLeaveDocument(JSON.parse(row.data),url.searchParams.get('lang')||String(req.headers['accept-language']||'ru').slice(0,2));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`inline; filename="janamen-leave-${request.id}.html"`,'Content-Security-Policy':documentCSP});return res.end(html);
    }
    match=path.match(/^\/api\/requests\/([\w-]+)\/action$/);
    if(match&&req.method==='POST') {
      const body=await jsonBody(req);const action=body.action;if(!['approve','reject','cancel'].includes(action))fail(400,'invalid_action','Неизвестное действие.');
      const result=transaction(()=>{
        const request=getRequest(user,match[1]), employee=personById(db,request.employeeId);if(!activeStatuses.includes(request.status))fail(409,'final_status','Решение по заявке уже принято.');
        if(action==='cancel') {if(user.id!==employee.id)fail(403,'forbidden','Отменить заявку может только её автор.');db.prepare("UPDATE requests SET status='cancelled' WHERE id=?").run(request.id);history(request,user,'cancelled');notify(db,employee.id,'request_cancelled',L('Заявка отменена','Өтінім жойылды','Request cancelled'),L('Резерв дней освобождён.','Күндер резерві босатылды.','Reserved days have been released.'),'requests',request.id);notify(db,employee.managerId,'request_cancelled',L('Сотрудник отменил заявку','Қызметкер өтінімді жойды','Employee cancelled a request'),L(employee.name,employee.name,employee.name),'requests',request.id);if(request.status==='pending_hr')for(const h of db.prepare("SELECT id FROM people WHERE role='hr'").all())if(h.id!==employee.id)notify(db,h.id,'request_cancelled',L('Заявка отменена автором','Өтінімді автор жойды','Request cancelled by author'),L(employee.name,employee.name,employee.name),'requests',request.id);
        } else {
          if(user.id===employee.id)fail(403,'self_approval','Нельзя согласовать собственную заявку.');
          const managerStage=request.status==='pending_manager'&&employee.managerId===user.id&&['manager','hr'].includes(user.role);
          const hrStage=request.status==='pending_hr'&&user.role==='hr';if(!managerStage&&!hrStage)fail(403,'forbidden','Заявка ожидает решения другого согласующего.');
          if(action==='reject') {const comment=required(body.comment,2000,'Причина отказа');db.prepare("UPDATE requests SET status='rejected' WHERE id=?").run(request.id);history(request,user,'rejected',comment);notify(db,employee.id,'request_rejected',L('Заявка отклонена','Өтінім қабылданбады','Request declined'),L(comment,comment,comment),'requests',request.id);}
          else if(managerStage) {db.prepare("UPDATE requests SET status='pending_hr' WHERE id=?").run(request.id);history(request,user,'manager_approved',typeof body.comment==='string'?body.comment.slice(0,2000):'');notify(db,employee.id,'request_approved',L('Руководитель согласовал отпуск','Басшы демалысты мақұлдады','Manager approved your leave'),L('Осталось подтверждение HR.','HR растауы қалды.','HR confirmation is next.'),'requests',request.id);for(const h of db.prepare("SELECT id FROM people WHERE role='hr'").all())if(h.id!==employee.id)notify(db,h.id,'request_pending_hr',L('Отпуск ожидает HR','Демалыс HR растауын күтуде','Leave awaiting HR'),L(employee.name,employee.name,employee.name),'requests',request.id);}
          else {if(employee.leaveBalance<request.days)fail(409,'insufficient_balance','Остаток отпуска изменился. Обратитесь в HR.');db.prepare("UPDATE requests SET status='approved' WHERE id=?").run(request.id);db.prepare('UPDATE people SET leaveBalance=leaveBalance-? WHERE id=?').run(request.days,employee.id);history(request,user,'hr_approved',typeof body.comment==='string'?body.comment.slice(0,2000):'');notify(db,employee.id,'request_approved',L('Отпуск подтверждён','Демалыс расталды','Your leave is approved'),L('Оба этапа согласования завершены. Хорошего отдыха!','Келісудің екі кезеңі аяқталды. Жақсы демалыс!','Both approval steps are complete. Enjoy your time off!'),'requests',request.id);notify(db,employee.managerId,'request_approved',L('HR подтвердил отпуск','HR демалысты растады','HR confirmed leave'),L(employee.name,employee.name,employee.name),'requests',request.id);}
        }
        const updated=requestById(db,request.id);
        if(updated.status==='approved')db.prepare('INSERT OR IGNORE INTO request_documents VALUES (?,?)').run(updated.id,JSON.stringify(captureLeaveDocument(publicPerson(db,personById(db,updated.employeeId)),updated)));
        return updated;
      });return send(res,200,result);
    }
    match=path.match(/^\/api\/requests\/([\w-]+)\/attachments$/);
    if(match&&req.method==='POST') {
      const request=getRequest(user,match[1]);if(user.id!==request.employeeId&&user.role!=='hr')fail(403,'forbidden','Добавлять файлы может автор заявки или HR.');if(!activeStatuses.includes(request.status))fail(409,'final_status','В завершённую заявку нельзя добавить файл.');
      let name;try{name=decodeURIComponent(String(req.headers['x-file-name']||''));}catch{fail(400,'invalid_file','Некорректное имя файла.');}name=required(name.replace(/[\x00-\x1f/\\]/g,'_'),200,'Имя файла');const bytes=await readBody(req,20*1024*1024);if(!bytes.length)fail(400,'empty_file','Файл пуст.');const id=uid('file'),file=join(dataDir,'uploads',id);writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
      try {transaction(()=>{const current=getRequest(user,request.id);if(!activeStatuses.includes(current.status))fail(409,'final_status','Статус заявки изменился.');db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?,?,?)').run(id,request.id,name,bytes.length,'application/octet-stream',`uploads/${id}`,user.id);history(current,user,'attachment_added',name);});}catch(error){unlinkSync(file);throw error;}
      return send(res,201,{id,name,size:bytes.length,mimeType:'application/octet-stream'});
    }
    match=path.match(/^\/api\/attachments\/([\w-]+)$/);
    if(match&&req.method==='GET') {const file=db.prepare('SELECT * FROM attachments WHERE id=?').get(match[1]);if(!file)fail(404,'not_found','Файл не найден.');getRequest(user,file.requestId);const storedFile=join(dataDir,'uploads',file.id);if(!existsSync(storedFile))fail(404,'not_found','Файл отсутствует в хранилище.');res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.size,'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store'});createReadStream(storedFile).on('error',()=>res.destroy()).pipe(res);return;}
    if(path==='/api/notifications/read'&&req.method==='POST') {const body=await jsonBody(req);transaction(()=>{for(const row of db.prepare('SELECT id,data FROM notifications WHERE userId=?').all(user.id)){if(body.id&&row.id!==body.id)continue;const item=JSON.parse(row.data);if(!item.readAt){item.readAt=iso();db.prepare('UPDATE notifications SET data=? WHERE id=?').run(JSON.stringify(item),row.id);}}});return send(res,200,{ok:true});}
    if(path==='/api/courses'&&req.method==='POST') {hr(user);const body=await jsonBody(req);const old=body.id?courseById(db,body.id):null;if(body.id&&!old)fail(404,'not_found','Курс не найден.');const course=validateCourse(body,old);transaction(()=>{db.prepare('INSERT INTO courses VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(course.id,JSON.stringify(course));if(old&&(JSON.stringify(old.lessons)!==JSON.stringify(course.lessons)||JSON.stringify(old.quiz)!==JSON.stringify(course.quiz)||old.passScore!==course.passScore)){db.prepare("UPDATE enrollments SET completedLessonIds='[]',score=NULL,passed=0,completedAt=NULL WHERE courseId=?").run(course.id);for(const e of db.prepare('SELECT userId FROM enrollments WHERE courseId=?').all(course.id))notify(db,e.userId,'course_updated',L('Курс обновлён','Курс жаңартылды','Course updated'),L('Материалы изменились. Пройдите курс заново.','Материалдар өзгерді. Курсты қайта өтіңіз.','Materials changed. Please complete the updated course.'),'academy',course.id);}audit(db,user.id,'course_saved',course.id);});return send(res,old?200:201,course);}
    match=path.match(/^\/api\/courses\/([\w-]+)\/assign$/);
    if(match&&req.method==='POST') {hr(user);const body=await jsonBody(req);const course=courseById(db,match[1]);if(!course||!course.published)fail(404,'not_found','Опубликованный курс не найден.');if(!Array.isArray(body.userIds)||!body.userIds.length||body.userIds.length>100)fail(400,'invalid_input','Выберите сотрудников.');const ids=[...new Set(body.userIds)];for(const id of ids)if(!personById(db,id))fail(400,'invalid_user','Сотрудник не найден.');transaction(()=>{for(const id of ids){const exists=db.prepare('SELECT id FROM enrollments WHERE userId=? AND courseId=?').get(id,course.id);if(exists)continue;db.prepare('INSERT INTO enrollments VALUES (?,?,?,?,?,?,?,?)').run(uid('enroll'),id,course.id,'[]',null,0,null,iso());notify(db,id,'course_assigned',L('Вам назначен курс','Сізге курс тағайындалды','New course assigned'),course.title,'academy',course.id);}audit(db,user.id,'course_assigned',course.id);});return send(res,200,{ok:true});}
    match=path.match(/^\/api\/courses\/([\w-]+)\/lessons\/([\w-]+)\/complete$/);
    if(match&&req.method==='POST') {await jsonBody(req);const course=courseById(db,match[1]);const enrollment=db.prepare('SELECT * FROM enrollments WHERE userId=? AND courseId=?').get(user.id,match[1]);if(!course||!course.published||!enrollment)fail(404,'not_found','Курс не назначен вашему аккаунту.');if(!course.lessons.some(l=>l.id===match[2]))fail(404,'not_found','Урок не найден.');const ids=[...new Set([...JSON.parse(enrollment.completedLessonIds),match[2]])];db.prepare('UPDATE enrollments SET completedLessonIds=? WHERE id=?').run(JSON.stringify(ids),enrollment.id);return send(res,200,{ok:true});}
    match=path.match(/^\/api\/courses\/([\w-]+)\/quiz$/);
    if(match&&req.method==='POST') {const body=await jsonBody(req);const course=courseById(db,match[1]);const enrollment=db.prepare('SELECT * FROM enrollments WHERE userId=? AND courseId=?').get(user.id,match[1]);if(!course||!course.published||!enrollment)fail(404,'not_found','Курс не назначен вашему аккаунту.');if(!course.lessons.every(l=>JSON.parse(enrollment.completedLessonIds).includes(l.id)))fail(409,'lessons_required','Сначала завершите все уроки.');if(!Array.isArray(body.answers)||body.answers.length!==course.quiz.length||body.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=course.quiz[i].options.length))fail(400,'invalid_answers','Ответьте на все вопросы теста.');const score=Math.round(course.quiz.filter((q,i)=>q.correctIndex===body.answers[i]).length/course.quiz.length*100);const bestScore=Math.max(enrollment.score||0,score);const passed=bestScore>=course.passScore;transaction(()=>{db.prepare('UPDATE enrollments SET score=?,passed=?,completedAt=? WHERE id=?').run(bestScore,passed?1:0,passed?(enrollment.completedAt||iso()):null,enrollment.id);if(passed&&!enrollment.passed){notify(db,user.id,'course_completed',L('Курс пройден!','Курс аяқталды!','Course completed!'),course.title,'academy',course.id);if(user.managerId)notify(db,user.managerId,'course_completed',L('Сотрудник завершил курс','Қызметкер курсты аяқтады','Employee completed a course'),L(`${user.name}: ${course.title.ru}`,`${user.name}: ${course.title.kk}`,`${user.name}: ${course.title.en}`),'academy',course.id);for(const h of db.prepare("SELECT id FROM people WHERE role='hr'").all())if(h.id!==user.id&&h.id!==user.managerId)notify(db,h.id,'course_completed',L('Обучение завершено','Оқу аяқталды','Learning completed'),L(`${user.name}: ${course.title.ru}`,`${user.name}: ${course.title.kk}`,`${user.name}: ${course.title.en}`),'academy',course.id);audit(db,user.id,'course_completed',course.id);}});return send(res,200,{score,passed:score>=course.passScore,bestScore});}
    if(path==='/api/people'&&req.method==='POST') {hr(user);const body=await jsonBody(req);const name=required(body.name,120,'ФИО'),email=normalizeDemoEmail(required(body.email,200,'Email').toLowerCase()),password=required(body.password,256,'Пароль');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'invalid_email','Укажите корректный email.');if(password.length<10)fail(400,'weak_password','Используйте пароль не короче 10 символов.');if(!['employee','manager','hr'].includes(body.role))fail(400,'invalid_role','Выберите допустимую роль.');const manager=body.managerId?personById(db,body.managerId):null;if(body.managerId&&(!manager||!['manager','hr'].includes(manager.role)))fail(400,'invalid_manager','Назначьте руководителя с соответствующей ролью.');const hiredAt=body.hiredAt||today();dateValue(hiredAt);const balance=Number(body.leaveBalance??24);if(!Number.isInteger(balance)||balance<0||balance>365)fail(400,'invalid_balance','Остаток должен быть целым числом от 0 до 365.');if(db.prepare('SELECT id FROM people WHERE email=?').get(email))fail(409,'email_exists','Этот email уже зарегистрирован.');const id=uid('person'),{salt,hash}=passwordRecord(password);transaction(()=>{db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,email,name,body.role,'Jana Post · Demo',required(body.department,120,'Подразделение'),required(body.position,120,'Должность'),manager?.id||null,hiredAt,balance,salt,hash);db.prepare('INSERT INTO person_profiles (personId,employeeNumber) VALUES (?,?)').run(id,`JM-${id.slice(-8).toUpperCase()}`);audit(db,user.id,'person_created',id);});return send(res,201,publicPerson(db,personById(db,id)));}
    if(path==='/api/assistant'&&req.method==='POST') {const body=await jsonBody(req);const question=required(body.question,2000,'Вопрос');const lang=['ru','kk','en'].includes(body.lang)?body.lang:'ru';return send(res,200,await answerQuestion({question,lang,user:publicPerson(db,personById(db,user.id))}));}
    fail(404,'not_found','Раздел API не найден.');
   }
   if(!['GET','HEAD'].includes(req.method))fail(405,'method_not_allowed','Метод не поддерживается.');
   const dist=join(root,'dist');let requested;try{requested=decodeURIComponent(path);}catch{fail(400,'invalid_path','Неверный путь.');}let file=resolveStaticPath(dist,requested);if(!file)fail(404,'not_found','Файл не найден.');if(!existsSync(file)||!statSync(file).isFile()){if(extname(requested))fail(404,'not_found','Файл не найден.');file=join(dist,'index.html');}if(!existsSync(file))fail(503,'build_required','Сначала выполните npm run build или запустите npm run dev.');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch(error) { if(res.headersSent){res.destroy();return;}if(!(error instanceof HttpError))console.error('Application error:',error);send(res,error.status||500,{error:errorMessage(error.code||'internal_error',error.status?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.',req.headers['accept-language']),code:error.code||'internal_error'}); }
 });
 return {server,dataDir,close};
}
