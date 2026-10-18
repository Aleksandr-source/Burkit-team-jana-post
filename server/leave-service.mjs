import { createHash } from 'node:crypto';
import { iso, uid, personById, publicPerson, visibleEmployee, requestById, notify, audit } from './store.mjs';
import { captureLeaveDocument } from './leave-document.mjs';
import { fail } from './errors.mjs';
import { required, dateValue, today } from './validation.mjs';
import { sameCompany } from './access.mjs';
const activeStatuses = ['pending_manager', 'pending_hr'];
const localized = (ru, kk, en) => ({ ru, kk, en });
// One service owns leave state, balance changes, history and notifications.
// All writes stay within the existing synchronous SQLite transactions.
export function createLeaveService({ db, transaction }) {
  const get = (user, id) => {
    const value = requestById(db, id);
    if (!value || !visibleEmployee(user, personById(db, value.employeeId)))
      fail(404, 'not_found', 'Заявка не найдена или недоступна.');
    return value;
  };
  const appendHistory = (request, user, action, comment = '') => {
    const at = iso();
    const entries = [...request.history, {
      id: uid('h'), actorName: user.name, action, comment, at
    }];
    db.prepare('UPDATE requests SET history=?,updatedAt=? WHERE id=?').run(JSON.stringify(entries), at, request.id);
    audit(db, user.id, action, request.id);
  };
  function submit(user, body) {
    const start = dateValue(body.startDate), end = dateValue(body.endDate);
    const days = Math.round((end - start) / 86400000) + 1;
    if (days < 1 || days > 366)
      fail(400, 'invalid_range', 'Проверьте даты начала и окончания отпуска.');
    const reason = body.reason == null ? '' : typeof body.reason === 'string' && body.reason.length <= 2000 ? body.reason.trim() : fail(400, 'invalid_input', 'Комментарий должен быть текстом до 2000 символов.');
    const submissionKey = body.clientRequestId;
    if (submissionKey !== undefined && (typeof submissionKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(submissionKey)))
      fail(400, 'invalid_input', 'Некорректный идентификатор отправки.');
    const fingerprint = createHash('sha256').update(JSON.stringify([body.startDate, body.endDate, reason])).digest('hex');
    let replay = false;
    const value = transaction(() => {
      if (submissionKey) {
        const previous = db.prepare('SELECT fingerprint,requestId FROM request_submissions WHERE userId=? AND submissionKey=?').get(user.id, submissionKey);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            fail(409, 'submission_changed', 'Эта отправка уже сохранена с другими данными. Откройте заявку перед повторной отправкой.');
          replay = true;
          return requestById(db, previous.requestId);
        }
      }
      if (body.startDate < today())
        fail(400, 'past_date', 'Начало отпуска не может быть в прошлом.');
      const person = publicPerson(db, personById(db, user.id));
      const manager = person.managerId ? personById(db, person.managerId) : null;
      if (!manager || !sameCompany(person, manager) || !['manager', 'hr'].includes(manager.role) || manager.id === person.id)
        fail(409, 'missing_manager', 'Для подачи заявки HR должен назначить руководителя.');
      if (days > person.leaveBalance - person.leaveReserved)
        fail(409, 'insufficient_balance', 'Недостаточно доступных дней отпуска.');
      const overlap = db.prepare("SELECT id FROM requests WHERE employeeId=? AND status IN ('pending_manager','pending_hr','approved') AND startDate<=? AND endDate>=?").get(user.id, body.endDate, body.startDate);
      if (overlap)
        fail(409, 'overlap', 'На эти даты уже есть активная заявка.');
      const id = uid('leave'), at = iso();
      const entries = [{
        id: uid('h'), actorName: user.name, action: 'submitted', comment: reason, at
      }];
      db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, user.id, body.startDate, body.endDate, days, reason, 'pending_manager', at, at, JSON.stringify(entries));
      audit(db, user.id, 'submitted', id);
      if (submissionKey)
        db.prepare('INSERT INTO request_submissions VALUES (?,?,?,?)').run(user.id, submissionKey, fingerprint, id);
      notify(db, person.managerId, 'request_submitted', localized('Новая заявка на отпуск', 'Жаңа демалыс өтінімі', 'New leave request'), localized(`${user.name} ожидает согласования.`, `${user.name} келісуді күтуде.`, `${user.name} is awaiting approval.`), 'requests', id);
      notify(db, user.id, 'request_submitted', localized('Заявка отправлена', 'Өтінім жіберілді', 'Request submitted'), localized('Руководитель получил заявку. Дни зарезервированы.', 'Басшы өтінімді алды. Күндер резервке қойылды.', 'Your manager received the request. Days are reserved.'), 'requests', id);
      return requestById(db, id);
    });
    return { request: value, replayed: replay };
  }
  function decide(user, id, body) {
    const action = body.action;
    if (!['approve', 'reject', 'cancel'].includes(action))
      fail(400, 'invalid_action', 'Неизвестное действие.');
    const result = transaction(() => {
      const request = get(user, id), employee = personById(db, request.employeeId);
      if (body.expectedStatus !== undefined && body.expectedStatus !== request.status)
        fail(409, 'stale_request', 'Статус заявки изменился. Проверьте обновлённое состояние перед следующим действием.');
      if (!activeStatuses.includes(request.status))
        fail(409, 'final_status', 'Решение по заявке уже принято.');
      if (action === 'cancel') {
        if (user.id !== employee.id)
          fail(403, 'forbidden', 'Отменить заявку может только её автор.');
        db.prepare("UPDATE requests SET status='cancelled' WHERE id=?").run(request.id);
        appendHistory(request, user, 'cancelled');
        notify(db, employee.id, 'request_cancelled', localized('Заявка отменена', 'Өтінім жойылды', 'Request cancelled'), localized('Резерв дней освобождён.', 'Күндер резерві босатылды.', 'Reserved days have been released.'), 'requests', request.id);
        notify(db, employee.managerId, 'request_cancelled', localized('Сотрудник отменил заявку', 'Қызметкер өтінімді жойды', 'Employee cancelled a request'), localized(employee.name, employee.name, employee.name), 'requests', request.id);
        if (request.status === 'pending_hr')
          for (const h of db.prepare("SELECT id,company FROM people WHERE role='hr'").all())
            if (h.id !== employee.id && sameCompany(h, employee))
              notify(db, h.id, 'request_cancelled', localized('Заявка отменена автором', 'Өтінімді автор жойды', 'Request cancelled by author'), localized(employee.name, employee.name, employee.name), 'requests', request.id);
      }
      else {
        if (user.id === employee.id)
          fail(403, 'self_approval', 'Нельзя согласовать собственную заявку.');
        const managerStage = request.status === 'pending_manager' && employee.managerId === user.id && ['manager', 'hr'].includes(user.role);
        const hrStage = request.status === 'pending_hr' && user.role === 'hr' && sameCompany(user, employee);
        if (!managerStage && !hrStage)
          fail(403, 'forbidden', 'Заявка ожидает решения другого согласующего.');
        if (action === 'reject') {
          const comment = required(body.comment, 2000, 'Причина отказа');
          db.prepare("UPDATE requests SET status='rejected' WHERE id=?").run(request.id);
          appendHistory(request, user, 'rejected', comment);
          notify(db, employee.id, 'request_rejected', localized('Заявка отклонена', 'Өтінім қабылданбады', 'Request declined'), localized(comment, comment, comment), 'requests', request.id);
          if (hrStage && employee.managerId !== user.id)
            notify(db, employee.managerId, 'request_rejected', localized('HR отклонил заявку', 'HR өтінімді қабылдамады', 'HR declined the request'), localized(`${employee.name}: ${comment}`, `${employee.name}: ${comment}`, `${employee.name}: ${comment}`), 'requests', request.id);
        }
        else if (managerStage) {
          db.prepare("UPDATE requests SET status='pending_hr' WHERE id=?").run(request.id);
          appendHistory(request, user, 'manager_approved', typeof body.comment === 'string' ? body.comment.slice(0, 2000) : '');
          notify(db, employee.id, 'request_approved', localized('Руководитель согласовал отпуск', 'Басшы демалысты мақұлдады', 'Manager approved your leave'), localized('Осталось подтверждение HR.', 'HR растауы қалды.', 'HR confirmation is next.'), 'requests', request.id);
          for (const h of db.prepare("SELECT id,company FROM people WHERE role='hr'").all())
            if (h.id !== employee.id && sameCompany(h, employee))
              notify(db, h.id, 'request_pending_hr', localized('Отпуск ожидает HR', 'Демалыс HR растауын күтуде', 'Leave awaiting HR'), localized(employee.name, employee.name, employee.name), 'requests', request.id);
        }
        else {
          if (employee.leaveBalance < request.days)
            fail(409, 'insufficient_balance', 'Остаток отпуска изменился. Обратитесь в HR.');
          db.prepare("UPDATE requests SET status='approved' WHERE id=?").run(request.id);
          db.prepare('UPDATE people SET leaveBalance=leaveBalance-? WHERE id=?').run(request.days, employee.id);
          appendHistory(request, user, 'hr_approved', typeof body.comment === 'string' ? body.comment.slice(0, 2000) : '');
          notify(db, employee.id, 'request_approved', localized('Отпуск подтверждён', 'Демалыс расталды', 'Your leave is approved'), localized('Оба этапа согласования завершены. Хорошего отдыха!', 'Келісудің екі кезеңі аяқталды. Жақсы демалыс!', 'Both approval steps are complete. Enjoy your time off!'), 'requests', request.id);
          notify(db, employee.managerId, 'request_approved', localized('HR подтвердил отпуск', 'HR демалысты растады', 'HR confirmed leave'), localized(employee.name, employee.name, employee.name), 'requests', request.id);
        }
      }
      const updated = requestById(db, request.id);
      if (updated.status === 'approved')
        db.prepare('INSERT OR IGNORE INTO request_documents VALUES (?,?)').run(updated.id, JSON.stringify(captureLeaveDocument(publicPerson(db, personById(db, updated.employeeId)), updated)));
      return updated;
    });
    return result;
  }
  function document(user, id) {
    const request = get(user, id);
    if (request.status !== 'approved')
      fail(409, 'document_not_ready', 'Заявление доступно после согласования руководителем и HR.');
    let row = db.prepare('SELECT data FROM request_documents WHERE requestId=?').get(request.id);
    if (!row) {
      const document = captureLeaveDocument(publicPerson(db, personById(db, request.employeeId)), request, iso(), false);
      db.prepare('INSERT OR IGNORE INTO request_documents VALUES (?,?)').run(request.id, JSON.stringify(document));
      row = db.prepare('SELECT data FROM request_documents WHERE requestId=?').get(request.id);
    }
    return JSON.parse(row.data);
  }
  function requireAttachmentAuthor(user, request) {
    if (user.id !== request.employeeId && user.role !== 'hr')
      fail(403, 'forbidden', 'Добавлять файлы может автор заявки или HR.');
  }
  function checkAttachment(user, id) {
    const request = get(user, id);
    requireAttachmentAuthor(user, request);
    if (!activeStatuses.includes(request.status))
      fail(409, 'final_status', 'В завершённую заявку нельзя добавить файл.');
    if (request.status !== 'pending_manager')
      fail(409, 'attachments_locked', 'После согласования руководителем вложения зафиксированы. Для изменения отмените заявку и подайте новую.');
    return request;
  }
  function recordAttachment(user, requestId, { id, name, size }) {
    return transaction(() => {
      const current = get(user, requestId);
      requireAttachmentAuthor(user, current);
      if (current.status !== 'pending_manager')
        fail(409, 'attachments_locked', 'Статус заявки изменился: добавление вложений закрыто.');
      db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?,?,?)').run(id, requestId, name, size, 'application/octet-stream', `uploads/${id}`, user.id);
      appendHistory(current, user, 'attachment_added', name);
    });
  }
  return {
    get, submit, decide, document, checkAttachment, recordAttachment
  };
}
