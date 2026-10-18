import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { demoPeople, demoCourses, demoRequests, demoEnrollments } from './seed.mjs';
export { visibleEmployee } from './access.mjs';
export const iso = () => new Date().toISOString();
export const uid = (prefix = 'id') => `${prefix}_${randomBytes(12).toString('hex')}`;
const legacyEmails = Object.fromEntries(['employee', 'manager', 'hr', 'outsider', 'secondmanager'].map(name => [`${name}@asar.demo`, `${name}@janamen.demo`]));
export const normalizeDemoEmail = email => legacyEmails[email] || email;
export function passwordRecord(password) { const salt = randomBytes(16).toString('hex'); return { salt, hash: scryptSync(password, salt, 64).toString('hex') }; }
export function checkPassword(password, salt, hash) { const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export function openStore(dataDir, options = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(dataDir, 'uploads'), { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'asar.sqlite');
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('employee','manager','hr')),company TEXT NOT NULL,department TEXT NOT NULL,position TEXT NOT NULL,managerId TEXT REFERENCES people(id),hiredAt TEXT NOT NULL,leaveBalance INTEGER NOT NULL CHECK(leaveBalance>=0),passwordSalt TEXT NOT NULL,passwordHash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,expiresAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY,employeeId TEXT NOT NULL REFERENCES people(id),startDate TEXT NOT NULL,endDate TEXT NOT NULL,days INTEGER NOT NULL CHECK(days>0),reason TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending_manager','pending_hr','approved','rejected','cancelled')),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,history TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS requests_employee ON requests(employeeId,status);
    CREATE TABLE IF NOT EXISTS request_submissions (userId TEXT NOT NULL REFERENCES people(id),submissionKey TEXT NOT NULL,fingerprint TEXT NOT NULL,requestId TEXT NOT NULL REFERENCES requests(id),PRIMARY KEY(userId,submissionKey));
    CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES people(id),courseId TEXT NOT NULL REFERENCES courses(id),completedLessonIds TEXT NOT NULL,score INTEGER,passed INTEGER NOT NULL DEFAULT 0,completedAt TEXT,assignedAt TEXT NOT NULL,UNIQUE(userId,courseId));
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES people(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY,requestId TEXT NOT NULL REFERENCES requests(id),name TEXT NOT NULL,size INTEGER NOT NULL,mimeType TEXT NOT NULL,path TEXT NOT NULL,createdBy TEXT NOT NULL REFERENCES people(id));
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,actorId TEXT NOT NULL,action TEXT NOT NULL,entityId TEXT NOT NULL,at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS person_profiles (personId TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,phone TEXT NOT NULL DEFAULT '',employeeNumber TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS request_documents (requestId TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hr_inquiries (id TEXT PRIMARY KEY,authorId TEXT NOT NULL REFERENCES people(id),question TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN ('ru','kk','en')),status TEXT NOT NULL CHECK(status IN ('open','answered')),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,answer TEXT,answeredBy TEXT REFERENCES people(id),answeredByName TEXT,answeredAt TEXT,CHECK((status='open' AND answer IS NULL AND answeredBy IS NULL AND answeredByName IS NULL AND answeredAt IS NULL) OR (status='answered' AND answer IS NOT NULL AND answeredBy IS NOT NULL AND answeredByName IS NOT NULL AND answeredAt IS NOT NULL)));
    CREATE INDEX IF NOT EXISTS hr_inquiries_author ON hr_inquiries(authorId,updatedAt);
    CREATE TABLE IF NOT EXISTS hr_inquiry_submissions (authorId TEXT NOT NULL REFERENCES people(id),submissionKey TEXT NOT NULL,fingerprint TEXT NOT NULL,inquiryId TEXT NOT NULL REFERENCES hr_inquiries(id),PRIMARY KEY(authorId,submissionKey));
    CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY);
  `);
  const transaction = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  if (!db.prepare('SELECT id FROM schema_migrations WHERE id=?').get('janamen-brand-v1')) {
    transaction(() => {
      for (const [oldEmail, email] of Object.entries(legacyEmails)) {
        if (!db.prepare('SELECT id FROM people WHERE email=?').get(email)) db.prepare('UPDATE people SET email=? WHERE email=?').run(email, oldEmail);
      }
      const rebrand = value => {
        if (typeof value === 'string') return value.replace(/Asar HR|Asar|ASAR|Асар|асар/g, 'JanaMen').replace(/AI Jana/g, 'JanaMen AI');
        if (Array.isArray(value)) return value.map(rebrand);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['id', 'resourceUrl', 'entityId'].includes(key) ? item : rebrand(item)]));
        return value;
      };
      for (const row of db.prepare('SELECT id,data FROM courses').all()) db.prepare('UPDATE courses SET data=? WHERE id=?').run(JSON.stringify(rebrand(JSON.parse(row.data))), row.id);
      for (const row of db.prepare('SELECT id,data FROM notifications').all()) db.prepare('UPDATE notifications SET data=? WHERE id=?').run(JSON.stringify(rebrand(JSON.parse(row.data))), row.id);
      db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?)').run('janamen-brand-v1');
    });
  }
  const accountsFile = join(dataDir, 'demo-accounts.txt');
  if (existsSync(accountsFile)) {
    const oldText = readFileSync(accountsFile, 'utf8');
    let renamed = oldText.replace('ASAR HR', 'JANAMEN');
    for (const [oldEmail, email] of Object.entries(legacyEmails)) renamed = renamed.replaceAll(oldEmail, email);
    if (renamed !== oldText) writeFileSync(accountsFile, renamed, { mode: 0o600 });
  }
  if (options.seed !== false && db.prepare('SELECT count(*) AS count FROM people').get().count === 0) {
    const password = options.demoPassword || process.env.DEMO_PASSWORD || `JanaMen-${randomBytes(9).toString('base64url')}!`;
    transaction(() => {
      const insert = db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const person of demoPeople) { const { salt, hash } = passwordRecord(password); insert.run(person.id, person.email, person.name, person.role, person.company, person.department, person.position, null, person.hiredAt, person.leaveBalance, salt, hash); }
      for (const person of demoPeople) { if (person.managerId) db.prepare('UPDATE people SET managerId=? WHERE id=?').run(person.managerId, person.id); }
      for (const course of demoCourses) db.prepare('INSERT INTO courses VALUES (?,?)').run(course.id, JSON.stringify(course));
      for (const request of demoRequests || []) {
        db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?)').run(request.id,request.employeeId,request.startDate,request.endDate,request.days,request.reason,request.status,request.createdAt,request.updatedAt,JSON.stringify(request.history));
        if(request.status==='approved') db.prepare('UPDATE people SET leaveBalance=leaveBalance-? WHERE id=?').run(request.days,request.employeeId);
      }
      for (const enrollment of demoEnrollments || []) db.prepare('INSERT INTO enrollments VALUES (?,?,?,?,?,?,?,?)').run(enrollment.id,enrollment.userId,enrollment.courseId,JSON.stringify(enrollment.completedLessonIds||[]),enrollment.score??null,enrollment.passed?1:0,enrollment.completedAt??null,enrollment.assignedAt||iso());
      for(const person of demoPeople) {
        const notification={id:uid('n'),type:'welcome',title:{ru:'Добро пожаловать в JanaMen',kk:'JanaMen платформасына қош келдіңіз',en:'Welcome to JanaMen'},body:{ru:'Профиль, заявки и обучение — теперь в одном месте.',kk:'Профиль, өтінімдер және оқу — бір жерде.',en:'Your profile, requests and learning, all in one place.'},readAt:null,createdAt:iso(),view:'home'};
        db.prepare('INSERT INTO notifications VALUES (?,?,?)').run(notification.id,person.id,JSON.stringify(notification));
      }
      for (const enrollment of demoEnrollments) {
        const course = demoCourses.find(item => item.id === enrollment.courseId);
        notify(db, enrollment.userId, 'course_assigned', { ru: 'Вам назначен курс', kk: 'Сізге курс тағайындалды', en: 'New course assigned' }, course.title, 'academy', course.id);
      }
    });
    const credentials = demoPeople.map(p => `${p.role.padEnd(10)} ${p.email.padEnd(25)} ${password}`).join('\n');
    writeFileSync(join(dataDir,'demo-accounts.txt'),`JANAMEN — только вымышленные демонстрационные аккаунты\n${credentials}\n`,{mode:0o600});
    if(!options.demoPassword) console.log(`\nДемоаккаунты созданы. Данные для входа: ${join(dataDir,'demo-accounts.txt')}\nКоманда: npm run accounts\n`);
  }
  for (const [index, person] of demoPeople.entries()) if (personById(db, person.id)) db.prepare('INSERT OR IGNORE INTO person_profiles (personId,employeeNumber) VALUES (?,?)').run(person.id, `DEMO-${String(index + 1).padStart(3, '0')}`);
  return { db, transaction, close: () => db.close() };
}
export function publicPerson(db, person) {
  if (!person) return null;
  const { passwordSalt: _salt, passwordHash: _hash, ...safe } = person;
  Object.assign(safe, db.prepare('SELECT phone,employeeNumber FROM person_profiles WHERE personId=?').get(person.id) || { phone: '', employeeNumber: '' });
  safe.managerName = person.managerId ? db.prepare('SELECT name FROM people WHERE id=?').get(person.managerId)?.name || null : null;
  safe.leaveReserved = db.prepare("SELECT coalesce(sum(days),0) AS days FROM requests WHERE employeeId=? AND status IN ('pending_manager','pending_hr')").get(person.id).days;
  return safe;
}
export function personById(db, id) { return db.prepare('SELECT * FROM people WHERE id=?').get(id); }
export function requestById(db, id) {
  const row = db.prepare('SELECT r.*,p.name AS employeeName,p.department FROM requests r JOIN people p ON p.id=r.employeeId WHERE r.id=?').get(id);
  if (!row) return null;
  return { ...row, history:JSON.parse(row.history),attachments:db.prepare('SELECT id,name,size,mimeType FROM attachments WHERE requestId=?').all(id) };
}
export function courseById(db,id) { const row=db.prepare('SELECT data FROM courses WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
export function publicCourse(course,user) { return user.role==='hr' ? course : {...course, quiz:course.quiz.map(({correctIndex:_correct,...question})=>question)}; }
export function enrollmentData(row,db) { return {...row,passed:!!row.passed,completedLessonIds:JSON.parse(row.completedLessonIds),userName:personById(db,row.userId)?.name || ''}; }
export function notify(db,userId,type,title,body,view,entityId,documentProcessing) {
 const item={id:uid('n'),type,title,body,view,entityId,createdAt:iso(),readAt:null,...(documentProcessing?{documentProcessing}:{})}; db.prepare('INSERT INTO notifications VALUES (?,?,?)').run(item.id,userId,JSON.stringify(item)); return item;
}
export function audit(db,actorId,action,entityId) { db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').run(uid('audit'),actorId,action,entityId,iso()); }
