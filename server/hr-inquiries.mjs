import { createHash } from 'node:crypto';
import { iso, uid, notify, audit } from './store.mjs';
import { fail } from './errors.mjs';

const localized = (ru, kk, en) => ({ ru, kk, en });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fields = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
    fail(400, 'invalid_input', 'Запрос содержит неподдерживаемые поля.');
};
const text = (value, max, label) => {
  if (typeof value !== 'string') fail(400, 'invalid_input', `${label}: требуется текст.`);
  const clean = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '').trim();
  if (!clean || clean.length > max)
    fail(400, 'invalid_input', `${label}: укажите текст до ${max} символов.`);
  return clean;
};

// The seed and the employee-creation form historically used these two labels.
// Other companies retain distinct keys; departments do not grant HR access.
export const inquiryCompanyKey = value => {
  const key = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return ['jana post · демо', 'jana post · demo'].includes(key) ? 'jana-post-demo' : key;
};
const select = `SELECT i.*,p.name AS authorName
  FROM hr_inquiries i JOIN people p ON p.id=i.authorId`;

export function createHRInquiryService({ db, transaction }) {
  const authorIds = user => {
    if (user.role !== 'hr') return [user.id];
    const people = db.prepare('SELECT id,company FROM people').all();
    return people.filter(person => person.id === user.id || inquiryCompanyKey(person.company) === inquiryCompanyKey(user.company)).map(person => person.id);
  };
  const list = user => {
    const ids = authorIds(user);
    if (!ids.length) return [];
    return db.prepare(`${select} WHERE i.authorId IN (${ids.map(() => '?').join(',')}) ORDER BY CASE i.status WHEN 'open' THEN 0 ELSE 1 END,i.updatedAt DESC,i.id DESC`).all(...ids).map(row => ({ ...row }));
  };
  const get = (user, id) => {
    const value = db.prepare(`${select} WHERE i.id=?`).get(id);
    if (!value || !authorIds(user).includes(value.authorId))
      fail(404, 'not_found', 'Обращение не найдено или недоступно.');
    return { ...value };
  };
  function submit(user, body) {
    fields(body, ['question', 'language', 'clientRequestId']);
    const question = text(body.question, 1200, 'Вопрос');
    if (!['ru', 'kk', 'en'].includes(body.language))
      fail(400, 'invalid_input', 'Выберите язык обращения.');
    if (typeof body.clientRequestId !== 'string' || !uuid.test(body.clientRequestId))
      fail(400, 'invalid_input', 'Некорректный идентификатор отправки.');
    const submissionKey = body.clientRequestId.toLowerCase();
    const fingerprint = createHash('sha256').update(JSON.stringify([question, body.language])).digest('hex');
    return transaction(() => {
      const previous = db.prepare('SELECT fingerprint,inquiryId FROM hr_inquiry_submissions WHERE authorId=? AND submissionKey=?').get(user.id, submissionKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail(409, 'inquiry_submission_changed', 'Этот вопрос уже отправлен с другими данными. Откройте сохранённое обращение.');
        return { inquiry: get(user, previous.inquiryId), replayed: true };
      }
      const id = uid('inquiry'), at = iso();
      db.prepare("INSERT INTO hr_inquiries (id,authorId,question,language,status,createdAt,updatedAt) VALUES (?,?,?,?,'open',?,?)").run(id, user.id, question, body.language, at, at);
      db.prepare('INSERT INTO hr_inquiry_submissions VALUES (?,?,?,?)').run(user.id, submissionKey, fingerprint, id);
      audit(db, user.id, 'hr_inquiry_created', id);
      notify(db, user.id, 'hr_inquiry_created', localized('Вопрос передан HR', 'Сұрақ HR бөліміне жіберілді', 'Question sent to HR'), localized('Обращение сохранено. Вы получите уведомление, когда HR ответит.', 'Өтініш сақталды. HR жауап бергенде хабарлама аласыз.', 'Your inquiry is saved. You will receive a notification when HR replies.'), 'hrInquiries', id);
      for (const person of db.prepare("SELECT id,company FROM people WHERE role='hr' AND id<>?").all(user.id)) {
        if (inquiryCompanyKey(person.company) !== inquiryCompanyKey(user.company)) continue;
        notify(db, person.id, 'hr_inquiry_created', localized('Новое обращение в HR', 'HR бөліміне жаңа өтініш', 'New HR inquiry'), localized('Сотрудник ожидает ответа. Откройте обращение, чтобы ознакомиться с вопросом.', 'Қызметкер жауап күтуде. Сұрақты оқу үшін өтінішті ашыңыз.', 'An employee is waiting for a reply. Open the inquiry to read the question.'), 'hrInquiries', id);
      }
      return { inquiry: get(user, id), replayed: false };
    });
  }
  function answer(user, id, body) {
    fields(body, ['answer']);
    const answer = text(body.answer, 4000, 'Ответ');
    return transaction(() => {
      const current = get(user, id);
      if (user.role !== 'hr' || user.id === current.authorId)
        fail(403, 'inquiry_answer_forbidden', 'Ответить на обращение может другой HR-специалист компании.');
      if (current.status === 'answered') {
        if (current.answer !== answer || current.answeredBy !== user.id)
          fail(409, 'inquiry_already_answered', 'Ответ на обращение уже сохранён. Обновите страницу, чтобы прочитать его.');
        return current;
      }
      const at = iso();
      db.prepare("UPDATE hr_inquiries SET answer=?,answeredBy=?,answeredByName=?,answeredAt=?,updatedAt=?,status='answered' WHERE id=? AND status='open'").run(answer, user.id, user.name, at, at, id);
      audit(db, user.id, 'hr_inquiry_answered', id);
      notify(db, current.authorId, 'hr_inquiry_answered', localized('HR ответил на ваш вопрос', 'HR сұрағыңызға жауап берді', 'HR replied to your question'), localized('Откройте обращение, чтобы прочитать ответ специалиста.', 'Маманның жауабын оқу үшін өтінішті ашыңыз.', 'Open your inquiry to read the specialist’s reply.'), 'hrInquiries', id);
      return get(user, id);
    });
  }
  return { list, get, submit, answer };
}
