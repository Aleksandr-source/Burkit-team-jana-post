import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/app.mjs';
import { openStore, personById, passwordRecord } from '../server/store.mjs';
import { createHRInquiryService } from '../server/hr-inquiries.mjs';
import { createDisabledModelProvider } from '../server/ai/local-model-provider.mjs';

const password = 'Inquiry-test-fixture-only-8124!';
const record = passwordRecord(password);
const people = [
  ['employee', 'employee', 'Jana Post · демо', 'manager'],
  ['manager', 'manager', 'Jana Post · демо', null],
  ['hr', 'hr', 'Jana Post · демо', null],
  ['hr2', 'hr', 'Jana Post · Demo', null],
  ['other', 'employee', 'Jana Post · Demo', null],
  ['foreign', 'employee', 'Other Company', null],
  ['foreignhr', 'hr', 'Other Company', null],
];
function insertPeople(db) {
  const insert = db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const [id, role, company] of people)
    insert.run(id, `${id}@fixture.test`, `Name ${id}`, role, company, 'Department', 'Position', null, '2024-01-15', 24, record.salt, record.hash);
  for (const [id, , , managerId] of people)
    if (managerId) db.prepare('UPDATE people SET managerId=? WHERE id=?').run(managerId, id);
}
const tables = ['hr_inquiries', 'hr_inquiry_submissions', 'notifications', 'audit'];
const snapshot = db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))]));

async function httpFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'janamen-inquiry-http-'));
  let app = createApplication({ dataDir, seed: false, modelProvider: createDisabledModelProvider() });
  const db = new DatabaseSync(join(dataDir, 'asar.sqlite'));
  insertPeople(db);
  let origin;
  async function listen() {
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  await listen();
  t.after(async () => {
    if (app.server.listening) await new Promise(resolve => app.server.close(resolve));
    db.close();
    app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  async function request(path, { cookie, method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  async function login(id) {
    const result = await request('/auth/login', { method: 'POST', body: { email: `${id}@fixture.test`, password } });
    assert.equal(result.status, 200);
    return result.headers.get('set-cookie').split(';')[0];
  }
  const submit = (cookie, changes = {}) => request('/hr-inquiries', { cookie, method: 'POST', body: { question: 'Можно ли взять день для участия в конференции?', language: 'ru', clientRequestId: randomUUID(), ...changes } });
  async function restart() {
    await new Promise(resolve => app.server.close(resolve));
    app.close();
    app = createApplication({ dataDir, seed: false, modelProvider: createDisabledModelProvider() });
    await listen();
  }
  return { db, request, login, submit, restart };
}

test('HR inquiries require a session and stay private to their author and same-company HR', async t => {
  const { db, request, login, submit } = await httpFixture(t);
  const employee = await login('employee'), manager = await login('manager'), hr = await login('hr'), other = await login('other'), foreignhr = await login('foreignhr');
  assert.equal((await request('/hr-inquiries')).status, 401);
  assert.equal((await submit(undefined)).status, 401);
  const created = await submit(employee);
  assert.equal(created.status, 201);
  const inquiry = created.body, endpoint = `/hr-inquiries/${inquiry.id}`;
  assert.equal(inquiry.authorId, 'employee');
  assert.equal(inquiry.authorName, 'Name employee');
  assert.equal(inquiry.status, 'open');
  for (const key of ['answer', 'answeredBy', 'answeredByName', 'answeredAt']) assert.equal(inquiry[key], null);
  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await request(endpoint, { cookie: employee })).status, 200);
  assert.equal((await request(endpoint, { cookie: hr })).status, 200);
  for (const cookie of [manager, other, foreignhr]) {
    assert.equal((await request(endpoint, { cookie })).status, 404);
    assert.deepEqual((await request('/hr-inquiries', { cookie })).body, []);
    assert.deepEqual((await request('/bootstrap', { cookie })).body.hrInquiries, []);
    assert.equal((await request(`${endpoint}/answer`, { cookie, method: 'POST', body: { answer: 'Forged response' } })).status, 404);
  }
  assert.equal((await request('/bootstrap', { cookie: hr })).body.hrInquiries[0].id, inquiry.id);
  const notices = db.prepare('SELECT userId,data FROM notifications').all();
  assert.deepEqual(notices.map(row => row.userId).sort(), ['employee', 'hr', 'hr2']);
  for (const notice of notices) {
    const data = JSON.parse(notice.data);
    assert.equal(data.view, 'hrInquiries');
    assert.equal(data.entityId, inquiry.id);
    assert.ok(!notice.data.includes(inquiry.question));
  }
  const saved = snapshot(db);
  await request(endpoint, { cookie: employee });
  await request('/hr-inquiries', { cookie: hr });
  await request('/bootstrap', { cookie: employee });
  assert.deepEqual(snapshot(db), saved, 'reading inquiries does not mutate status, notifications or audit');
});

test('HR inquiry submission rejects spoofing, validates input and deduplicates only exact retries', async t => {
  const { db, request, login, submit } = await httpFixture(t);
  const employee = await login('employee');
  for (const field of ['authorId', 'role', 'company', 'status', 'answeredBy'])
    assert.equal((await submit(employee, { [field]: 'hr' })).status, 400);
  for (const changes of [{ question: '' }, { question: 'x'.repeat(1201) }, { question: 7 }, { language: 'de' }, { language: null }, { clientRequestId: 'not-a-uuid' }, { clientRequestId: null }])
    assert.equal((await submit(employee, changes)).status, 400);
  const before = snapshot(db);
  assert.equal((await request('/hr-inquiries', { cookie: employee, method: 'POST', headers: { Origin: 'https://foreign.example' }, body: { question: 'Blocked question', language: 'ru', clientRequestId: randomUUID() } })).status, 403);
  assert.deepEqual(snapshot(db), before);
  const clientRequestId = randomUUID();
  const created = await submit(employee, { question: '  <script>example</script>\u0000\r\nSecond line  ', clientRequestId });
  assert.equal(created.status, 201);
  assert.equal(created.body.question, '<script>example</script>\nSecond line');
  const afterFirst = snapshot(db);
  const replay = await submit(employee, { question: '<script>example</script>\nSecond line', clientRequestId: clientRequestId.toUpperCase() });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, created.body);
  assert.deepEqual(snapshot(db), afterFirst);
  assert.equal((await submit(employee, { clientRequestId })).status, 409);
  assert.equal((await submit(employee, { question: created.body.question, language: 'kk', clientRequestId })).status, 409);
  assert.deepEqual(snapshot(db), afterFirst);
  const other = await login('other');
  const independent = await submit(other, { clientRequestId });
  assert.equal(independent.status, 201, 'a different author may use the same submission key');
  assert.notEqual(independent.body.id, created.body.id);
  assert.equal((await request(`/hr-inquiries/${independent.body.id}`, { cookie: await login('hr') })).status, 200, 'known demo-company aliases share the HR scope');
});

test('HR replies are immutable, author-notified once and survive restart with their metadata', async t => {
  const { db, request, login, submit, restart } = await httpFixture(t);
  const employee = await login('employee'), hr = await login('hr'), hr2 = await login('hr2');
  const created = await submit(employee), endpoint = `/hr-inquiries/${created.body.id}/answer`;
  const answer = 'Уточним участие с вашим руководителем. <b>Ответ HR</b>';
  assert.equal((await request(endpoint, { cookie: employee, method: 'POST', body: { answer } })).status, 403);
  for (const body of [{ answer: '' }, { answer: 'x'.repeat(4001) }, { answer: 1 }, { answer, answeredBy: 'employee' }])
    assert.equal((await request(endpoint, { cookie: hr, method: 'POST', body })).status, 400);
  const blocked = snapshot(db);
  assert.equal((await request(endpoint, { cookie: hr, method: 'POST', headers: { Origin: 'https://foreign.example' }, body: { answer } })).status, 403);
  assert.deepEqual(snapshot(db), blocked);
  const responses = await Promise.all([1, 2].map(() => request(endpoint, { cookie: hr, method: 'POST', body: { answer } })));
  for (const response of responses) assert.equal(response.status, 200);
  assert.deepEqual(responses[0].body, responses[1].body);
  const replied = responses[0].body;
  assert.equal(replied.status, 'answered');
  assert.equal(replied.answer, answer);
  assert.equal(replied.answeredBy, 'hr');
  assert.equal(replied.answeredByName, 'Name hr');
  assert.equal(replied.answeredAt, replied.updatedAt);
  assert.ok(replied.answeredAt >= replied.createdAt);
  db.prepare('UPDATE people SET name=? WHERE id=?').run('Changed HR display name', 'hr');
  assert.equal((await request(`/hr-inquiries/${created.body.id}`, { cookie: employee })).body.answeredByName, 'Name hr', 'the responder name is preserved as part of the saved reply');
  const saved = snapshot(db);
  assert.equal((await request(endpoint, { cookie: hr, method: 'POST', body: { answer: 'Different response' } })).status, 409);
  assert.equal((await request(endpoint, { cookie: hr2, method: 'POST', body: { answer } })).status, 409);
  assert.deepEqual(snapshot(db), saved);
  const notices = db.prepare('SELECT userId,data FROM notifications').all().filter(row => JSON.parse(row.data).type === 'hr_inquiry_answered');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, 'employee');
  assert.ok(!notices[0].data.includes(answer));
  const audit = db.prepare('SELECT actorId,action,entityId FROM audit ORDER BY rowid').all().map(row => ({ ...row }));
  assert.deepEqual(audit, [{ actorId: 'employee', action: 'hr_inquiry_created', entityId: created.body.id }, { actorId: 'hr', action: 'hr_inquiry_answered', entityId: created.body.id }]);
  await restart();
  assert.deepEqual((await request(`/hr-inquiries/${created.body.id}`, { cookie: employee })).body, replied);
  assert.deepEqual((await request('/bootstrap', { cookie: employee })).body.hrInquiries, [replied]);
  assert.equal((await request(endpoint, { cookie: hr, method: 'POST', body: { answer } })).status, 200);
  assert.deepEqual(snapshot(db), saved, 'a response retry after restart creates no new events');
});

test('two HR specialists cannot overwrite each other and HR cannot answer their own inquiry', async t => {
  const { db, request, login, submit } = await httpFixture(t);
  const employee = await login('employee'), hr = await login('hr'), hr2 = await login('hr2');
  const own = await submit(hr);
  assert.equal((await request(`/hr-inquiries/${own.body.id}/answer`, { cookie: hr, method: 'POST', body: { answer: 'Self response' } })).status, 403);
  assert.equal((await request(`/hr-inquiries/${own.body.id}/answer`, { cookie: hr2, method: 'POST', body: { answer: 'Another specialist' } })).status, 200);
  const created = await submit(employee), endpoint = `/hr-inquiries/${created.body.id}/answer`;
  const responses = await Promise.all([
    request(endpoint, { cookie: hr, method: 'POST', body: { answer: 'First specialist' } }),
    request(endpoint, { cookie: hr2, method: 'POST', body: { answer: 'Second specialist' } }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.find(response => response.status === 200).body;
  assert.deepEqual((await request(`/hr-inquiries/${created.body.id}`, { cookie: employee })).body, winner);
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit WHERE entityId=? AND action='hr_inquiry_answered'").get(created.body.id).n, 1);
});

test('HR inquiry transactions roll back the ticket, key, audit and all notifications on storage failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-inquiry-transaction-'));
  const store = openStore(dir, { seed: false });
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  const { db } = store;
  insertPeople(db);
  const inquiries = createHRInquiryService(store), employee = personById(db, 'employee'), hr = personById(db, 'hr');
  const body = { question: 'Question outside the knowledge base', language: 'en', clientRequestId: randomUUID() };
  const before = snapshot(db);
  db.exec("CREATE TRIGGER reject_inquiry_notice BEFORE INSERT ON notifications WHEN NEW.userId='hr' BEGIN SELECT RAISE(ABORT, 'inquiry notification failure'); END");
  assert.throws(() => inquiries.submit(employee, body), /inquiry notification failure/);
  assert.deepEqual(snapshot(db), before, 'failure of a later HR notification rolls back the author acknowledgement too');
  db.exec('DROP TRIGGER reject_inquiry_notice');
  const created = inquiries.submit(employee, body).inquiry;
  const afterCreate = snapshot(db);
  db.exec("CREATE TRIGGER reject_answer_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'answer notification failure'); END");
  assert.throws(() => inquiries.answer(hr, created.id, { answer: 'Response from HR' }), /answer notification failure/);
  assert.deepEqual(snapshot(db), afterCreate);
});

test('opening an existing store adds inquiry tables without resetting personnel or leave data', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-inquiry-migration-'));
  let store = openStore(dir, { seed: false });
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  insertPeople(store.db);
  store.db.prepare('UPDATE people SET leaveBalance=19 WHERE id=?').run('employee');
  const savedPeople = store.db.prepare('SELECT * FROM people ORDER BY id').all().map(row => ({ ...row }));
  store.db.exec('DROP TABLE hr_inquiry_submissions; DROP TABLE hr_inquiries');
  store.close();
  store = openStore(dir, { seed: false });
  assert.deepEqual(store.db.prepare('SELECT * FROM people ORDER BY id').all().map(row => ({ ...row })), savedPeople);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM hr_inquiries').get().n, 0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM hr_inquiry_submissions').get().n, 0);
});
