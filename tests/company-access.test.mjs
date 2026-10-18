import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/app.mjs';
import { passwordRecord } from '../server/store.mjs';
import { createDisabledModelProvider } from '../server/ai/local-model-provider.mjs';
import { demoCourses } from '../server/seed.mjs';
import { companyKey, visibleEmployee } from '../server/access.mjs';

test('company boundary is shared, canonical and fails closed for missing records', () => {
  assert.equal(companyKey(' Jana Post · Demo '), companyKey('Jana Post · демо'));
  assert.equal(visibleEmployee({ id: 'hr', role: 'hr', company: 'One' }, { id: 'e', company: 'Two' }), false);
  assert.equal(visibleEmployee({ id: 'm', role: 'manager', company: 'One' }, { id: 'e', company: 'Two', managerId: 'm' }), false);
  assert.equal(visibleEmployee({ id: 'hr', role: 'hr', company: 'One' }, null), false);
});

test('foreign HR cannot read, mutate, approve or receive another company personnel data', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-company-test-'));
  const app = createApplication({ dataDir: dir, seed: false, modelProvider: createDisabledModelProvider() });
  const db = new DatabaseSync(join(dir, 'asar.sqlite'));
  const password = 'Company-fixture-only-572!';
  const { salt, hash } = passwordRecord(password);
  for (const [id, role, company] of [
    ['e', 'employee', 'Jana Post · демо'], ['m', 'manager', 'Jana Post · демо'],
    ['h', 'hr', 'Jana Post · Demo'], ['f', 'employee', 'Foreign Company'],
    ['fm', 'manager', 'Foreign Company'], ['fh', 'hr', 'Foreign Company'],
  ]) db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, `${id}@fixture.test`, `Name ${id}`, role, company, 'Demo', 'Demo', null, '2024-01-01', 24, salt, hash);
  db.prepare("UPDATE people SET managerId='m' WHERE id='e'").run();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => app.server.close(resolve));
    db.close(); app.close(); await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  async function call(path, cookie, body) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  }
  async function login(id) {
    const result = await call('/auth/login', null, { email: `${id}@fixture.test`, password });
    assert.equal(result.status, 200); return result.headers.get('set-cookie').split(';')[0];
  }
  const e = await login('e'), m = await login('m'), h = await login('h'), fh = await login('fh');
  assert.equal((await call('/people/e/profile', fh)).status, 404);
  assert.equal((await call('/people/e/profile', fh, { name: 'Forged' })).status, 404);
  assert.equal((await call('/people/h/profile', h, { company: 'Foreign Company' })).status, 400);
  assert.equal((await call('/people/e/profile', h, { managerId: 'fm' })).status, 400);
  const profile = await call('/people/e/profile', h, { company: 'Jana Post · Demo', employeeNumber: 'JM-SHARED' });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.company, 'Jana Post · демо', 'a spelling alias cannot change the server-managed company');
  assert.equal((await call('/people/h/profile', h, { employeeNumber: 'jm-shared' })).status, 409, 'employee number uniqueness spans equivalent company labels');
  const state = await call('/bootstrap', fh);
  assert.deepEqual(state.data.people.map(person => person.id).sort(), ['f', 'fh', 'fm']);
  assert.deepEqual(state.data.courses, []);
  const createdPerson = await call('/people', fh, { name: 'New fixture', email: 'new@fixture.test', password, role: 'employee', department: 'D', position: 'P', company: 'Jana Post · демо' });
  assert.equal(createdPerson.status, 201);
  assert.equal(createdPerson.data.company, 'Foreign Company');

  const course = await call('/courses', h, { ...demoCourses[0], id: undefined, company: 'Foreign Company' });
  assert.equal(course.status, 201);
  const courseId = course.data.id;
  assert.equal(course.data.company, 'Jana Post · Demo');
  assert.equal((await call('/courses', fh, course.data)).status, 404);
  assert.equal((await call(`/courses/${courseId}/assign`, fh, { userIds: ['f'] })).status, 404);
  assert.equal((await call(`/courses/${courseId}/assign`, h, { userIds: ['e', 'f'] })).status, 400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM enrollments').get().n, 0, 'mixed-company assignment is atomic');
  assert.equal((await call(`/courses/${courseId}/assign`, h, { userIds: ['e'] })).status, 200);
  for (const lesson of course.data.lessons) assert.equal((await call(`/courses/${courseId}/lessons/${lesson.id}/complete`, e, {})).status, 200);
  const quiz = await call(`/courses/${courseId}/quiz`, e, { answers: course.data.quiz.map(question => question.correctIndex) });
  assert.equal(quiz.data.passed, true);
  assert.ok(!(await call('/bootstrap', fh)).data.courses.some(c => c.id === courseId));

  const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const request = await call('/requests', e, { startDate: date(20), endDate: date(22) });
  assert.equal(request.status, 201);
  const id = request.data.id;
  const file = await fetch(`${base}/requests/${id}/attachments`, { method: 'POST', headers: { Cookie: e, 'X-File-Name': 'fixture.txt' }, body: 'fixture-only' });
  assert.equal(file.status, 201);
  const attachment = await file.json();
  assert.equal((await call(`/attachments/${attachment.id}`, fh)).status, 404);
  assert.equal((await call(`/requests/${id}`, fh)).status, 404);
  assert.equal((await call(`/requests/${id}/action`, m, { action: 'approve' })).status, 200);
  assert.equal((await call(`/requests/${id}/action`, fh, { action: 'approve' })).status, 404);
  assert.equal((await call(`/requests/${id}/action`, h, { action: 'approve' })).status, 200);
  const registered = await call('/integrations/documentolog/documents', h, { requestId: id });
  assert.equal(registered.status, 201);
  const docPath = `/integrations/documentolog/documents/${registered.data.document.id}`;
  assert.equal((await call(docPath, fh)).status, 404);
  assert.equal((await call(`${docPath}/mock-transition`, fh, { status: 'in_review' })).status, 404);
  assert.equal((await call(docPath, h)).data.document.status, 'registered');
  assert.equal((await call('/bootstrap', fh)).data.notifications.length, 0, 'foreign HR receives no leave or course notifications');
});
