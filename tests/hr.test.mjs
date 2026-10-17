import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/app.mjs';
import { createBusinessStateReader } from '../server/eval-business-state.mjs';

const testPassword = 'Test-only-not-a-demo-password-72!';
const date = (offset) => {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

async function fixture(t) {
  let dataDir = await mkdtemp(join(tmpdir(), 'asar-hr-test-'));
  let app;
  t.after(async () => {
    if (app?.server.listening) await new Promise((resolve) => app.server.close(resolve));
    app?.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  app = createApplication({ dataDir, seed: true, demoPassword: testPassword });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  let origin = `http://127.0.0.1:${app.server.address().port}`;
  async function restart({ move = false } = {}) {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    if (move) {
      const moved = `${dataDir}-moved`;
      await rename(dataDir, moved);
      dataDir = moved;
    }
    app = createApplication({ dataDir, seed: true, demoPassword: testPassword });
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function request(path, { cookie, method = 'GET', body, headers = {}, binary = false } = {}) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined && !binary ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {}),
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, body: data, headers: response.headers };
  }
  async function login(email) {
    const response = await request('/auth/login', { method: 'POST', body: { email, password: testPassword } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie || '', /HttpOnly/i);
    assert.match(setCookie || '', /SameSite=Strict|SameSite=Lax/i);
    return setCookie.split(';')[0];
  }
  const createLeave = (cookie, offset = 10, days = 3) => request('/requests', {
    cookie, method: 'POST', body: { startDate: date(offset), endDate: date(offset + days - 1), reason: 'Проверка сквозного сценария' },
  });
  return { app, request, login, createLeave, restart };
}

test('authentication uses a protected session and logout invalidates it', async (t) => {
  const { request, login } = await fixture(t);
  assert.equal((await request('/bootstrap')).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'employee@asar.demo', password: 'incorrect' } })).status, 401);
  const cookie = await login('employee@asar.demo');
  const result = await request('/bootstrap', { cookie });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, 'employee');
  assert.ok(result.body.people.every((person) => person.id === 'employee'), 'employee cannot enumerate other personnel records');
  assert.ok(!JSON.stringify(result.body).includes(testPassword), 'password does not appear in application data');
  assert.equal((await request('/auth/logout', { cookie, method: 'POST', body: {} })).status, 200);
  assert.equal((await request('/bootstrap', { cookie })).status, 401);
});

test('JanaMen demo addresses work and legacy logins keep the same account', async (t) => {
  const { request, login } = await fixture(t);
  const current = await login('employee@janamen.demo');
  const previous = await login('employee@asar.demo');
  const a = (await request('/bootstrap', { cookie: current })).body.user;
  const b = (await request('/bootstrap', { cookie: previous })).body.user;
  assert.equal(a.id, b.id);
  assert.equal(a.email, 'employee@janamen.demo');
});

test('upgrading an existing demo preserves passwords, sessions and leave data while rebranding saved content', async (t) => {
  const { app, request, login, createLeave, restart } = await fixture(t);
  const employee = await login('employee@janamen.demo');
  const created = await createLeave(employee);
  assert.equal(created.status, 201);
  const db = new DatabaseSync(join(app.dataDir, 'asar.sqlite'));
  try {
    db.prepare('UPDATE people SET email=? WHERE id=?').run('employee@asar.demo', 'employee');
    const course = JSON.parse(db.prepare('SELECT data FROM courses WHERE id=?').get('onboarding').data);
    course.title.ru = 'Первые шаги в Asar HR';
    db.prepare('UPDATE courses SET data=? WHERE id=?').run(JSON.stringify(course), 'onboarding');
    db.prepare('DELETE FROM schema_migrations WHERE id=?').run('janamen-brand-v1');
  } finally { db.close(); }
  const credentialsFile = join(app.dataDir, 'demo-accounts.txt');
  await writeFile(credentialsFile, (await readFile(credentialsFile, 'utf8')).replace('JANAMEN', 'ASAR HR').replace('employee@janamen.demo', 'employee@asar.demo'));
  await restart();
  const state = (await request('/bootstrap', { cookie: employee })).body;
  assert.equal(state.user.email, 'employee@janamen.demo');
  assert.equal(state.user.leaveReserved, 3);
  assert.ok(state.requests.some(value => value.id === created.body.id));
  assert.equal(state.courses.find(value => value.id === 'onboarding').title.ru, 'Первые шаги в JanaMen');
  assert.ok((await readFile(credentialsFile, 'utf8')).includes('employee@janamen.demo'));
  assert.ok(await login('employee@asar.demo'));
  assert.ok(await login('employee@janamen.demo'));
});

test('profiles are scoped to own records, the direct team and HR; only HR can edit personnel fields', async (t) => {
  const { request, login, restart } = await fixture(t);
  const employee = await login('employee@janamen.demo');
  const manager = await login('manager@janamen.demo');
  const outsider = await login('outsider@janamen.demo');
  const hr = await login('hr@janamen.demo');
  assert.equal((await request('/people/employee/profile', { cookie: employee })).status, 200);
  assert.equal((await request('/people/employee/profile', { cookie: manager })).status, 200);
  assert.equal((await request('/people/employee/profile', { cookie: outsider })).status, 404);
  assert.equal((await request('/people/employee/profile')).status, 401);
  const body = { name: 'Демо Алиса', company: 'Учебная компания', department: 'Доставка', position: 'Координатор', managerId: 'manager', hiredAt: '2024-03-11', employeeNumber: 'JM-017', phone: '+7 000 000 00 00' };
  assert.equal((await request('/people/employee/profile', { cookie: employee, method: 'POST', body })).status, 403);
  assert.equal((await request('/people/employee/profile', { cookie: manager, method: 'POST', body })).status, 403);
  const edited = await request('/people/employee/profile', { cookie: hr, method: 'POST', body });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, body.name);
  assert.equal(edited.body.employeeNumber, body.employeeNumber);
  assert.equal(edited.body.email, 'employee@janamen.demo');
  for (const forged of [{ role: 'hr' }, { leaveBalance: 300 }, { password: 'x' }, { email: 'other@example.test' }]) {
    assert.equal((await request('/people/employee/profile', { cookie: hr, method: 'POST', body: forged })).status, 400);
  }
  assert.equal((await request('/people/manager/profile', { cookie: hr, method: 'POST', body: { managerId: 'manager' } })).status, 400);
  assert.equal((await request('/people/manager2/profile', { cookie: hr, method: 'POST', body: { managerId: 'manager' } })).status, 400);
  await restart();
  const saved = await request('/people/employee/profile', { cookie: employee });
  assert.equal(saved.body.phone, body.phone);
  assert.equal(saved.body.position, body.position);
});

test('approved statements use the profile at final HR approval, escape content and enforce request access', async (t) => {
  const { request, login, createLeave, restart } = await fixture(t);
  const employee = await login('employee@janamen.demo');
  const manager = await login('manager@janamen.demo');
  const hr = await login('hr@janamen.demo');
  const outsider = await login('outsider@janamen.demo');
  const name = 'Демо <script>alert(1)</script>';
  assert.equal((await request('/people/employee/profile', { cookie: hr, method: 'POST', body: { name, employeeNumber: 'JM-APPROVED' } })).status, 200);
  const created = await createLeave(employee);
  const endpoint = `/requests/${created.body.id}/document`;
  assert.equal((await request(endpoint, { cookie: employee })).status, 409);
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: manager, method: 'POST', body: { action: 'approve' } })).status, 200);
  assert.equal((await request(endpoint, { cookie: employee })).status, 409);
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } })).status, 200);
  assert.equal((await request('/people/employee/profile', { cookie: hr, method: 'POST', body: { name: 'Новое имя после согласования' } })).status, 200);
  await restart();
  const document = await request(endpoint, { cookie: employee });
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-type'), /text\/html/);
  assert.match(document.headers.get('cache-control'), /no-store/);
  assert.match(document.headers.get('content-security-policy'), /script-src 'sha256-/);
  assert.ok(document.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!document.body.includes('<script>alert(1)</script>'));
  assert.ok(!document.body.includes('Новое имя после согласования'));
  assert.ok(document.body.includes('JM-APPROVED'));
  assert.ok(document.body.includes('Данияр Омаров'));
  assert.ok(document.body.includes('Мадина Ахметова'));
  assert.equal((await request(endpoint, { cookie: manager })).status, 200);
  assert.equal((await request(endpoint, { cookie: hr })).status, 200);
  assert.equal((await request(endpoint, { cookie: outsider })).status, 404);
  assert.equal((await request(endpoint)).status, 401);
  assert.match((await request(`${endpoint}?lang=kk`, { cookie: employee })).body, /Демалысқа өтініш/);
  assert.match((await request(`${endpoint}?lang=en`, { cookie: employee })).body, /Leave application/);
});

test('the evaluation business-state reader hashes real leave changes and does not fabricate advance support', async (t) => {
  const { app, login, createLeave } = await fixture(t);
  const read = createBusinessStateReader(app.dataDir);
  const actor = { key: 'employee_a', role: 'employee' };
  const first = await read({ actor, kind: 'leave' });
  assert.match(first.state_sha256, /^[a-f0-9]{64}$/);
  const employee = await login('employee@janamen.demo');
  assert.deepEqual(await read({ actor, kind: 'leave' }), first, 'sessions are not business-state changes');
  assert.equal((await createLeave(employee)).status, 201);
  assert.notEqual((await read({ actor, kind: 'leave' })).state_sha256, first.state_sha256);
  assert.equal(await read({ actor, kind: 'advance' }), null);
});

test('knowledge sources return versioned demo provenance and hide private documents', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@janamen.demo');
  const hr = await login('hr@janamen.demo');
  const state = (await request('/bootstrap', { cookie: hr })).body;
  const restricted = state.knowledge.find(source => source.audience === 'hr');
  assert.ok(restricted);
  const visible = await request('/knowledge/leave-submit?lang=ru', { cookie: employee });
  assert.equal(visible.status, 200);
  assert.equal(visible.body.fictional, true);
  assert.ok(visible.body.version);
  assert.ok(visible.body.origin);
  assert.match(visible.body.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await request(`/knowledge/${restricted.id}`, { cookie: employee })).status, 404);
  assert.equal((await request('/knowledge/not-existing', { cookie: employee })).status, 404);
  assert.equal((await request('/knowledge/leave-submit')).status, 401);
});

test('cross-origin mutations are rejected without changing an authenticated session', async (t) => {
  const { request, login } = await fixture(t);
  const cookie = await login('employee@asar.demo');
  const headers = { Origin: 'https://untrusted.example' };
  const attempted = await request('/requests', { cookie, method: 'POST', headers, body: { startDate: date(10), endDate: date(12), reason: 'Cross-origin attempt' } });
  assert.equal(attempted.status, 403);
  assert.equal((await request('/auth/logout', { cookie, method: 'POST', headers, body: {} })).status, 403);
  const state = await request('/bootstrap', { cookie });
  assert.equal(state.status, 200);
  assert.equal(state.body.user.leaveReserved, 0);
  assert.ok(!state.body.requests.some((item) => item.reason === 'Cross-origin attempt'));
});

test('employee, direct manager and HR see permitted requests; another team cannot read them', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const hr = await login('hr@asar.demo');
  const outsider = await login('outsider@asar.demo');
  const manager2 = await login('secondmanager@asar.demo');
  const created = await createLeave(employee);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.ok(id);
  for (const cookie of [employee, manager, hr]) assert.equal((await request(`/requests/${id}`, { cookie })).status, 200);
  for (const cookie of [outsider, manager2]) {
    assert.equal((await request(`/requests/${id}`, { cookie })).status, 404);
    const visible = await request('/bootstrap', { cookie });
    assert.ok(!visible.body.requests.some((item) => item.id === id));
  }
  const team = await request('/bootstrap', { cookie: manager });
  assert.ok(team.body.people.some((person) => person.id === 'employee'));
  assert.ok(!team.body.people.some((person) => person.id === 'outsider'));
});

test('leave is reserved once, approved sequentially and deducted only after HR', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const hr = await login('hr@asar.demo');
  const created = await createLeave(employee);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const balance = async () => (await request('/bootstrap', { cookie: employee })).body.user;
  assert.equal((await balance()).leaveReserved, 3);
  assert.equal((await balance()).leaveBalance, 24);
  assert.equal((await request(`/requests/${id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } })).status, 403);
  const first = await request(`/requests/${id}/action`, { cookie: manager, method: 'POST', body: { action: 'approve' } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.status, 'pending_hr');
  assert.equal((await balance()).leaveBalance, 24);
  const final = await request(`/requests/${id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(final.body.status, 'approved');
  assert.equal(final.body.history.length, 3);
  assert.equal((await balance()).leaveBalance, 21);
  assert.equal((await balance()).leaveReserved, 0);
  assert.equal((await request(`/requests/${id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } })).status, 409);
  assert.equal((await balance()).leaveBalance, 21);
  const notifications = (await request('/bootstrap', { cookie: employee })).body.notifications;
  assert.ok(notifications.length >= 2, 'employee receives status notifications');
});

test('rejection requires a reason and cancellation releases the reservation', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const created = await createLeave(employee);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await request(`/requests/${id}/action`, { cookie: manager, method: 'POST', body: { action: 'reject', comment: ' ' } })).status, 400);
  const rejected = await request(`/requests/${id}/action`, { cookie: manager, method: 'POST', body: { action: 'reject', comment: 'Нужно согласовать замещение.' } });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'rejected');
  assert.equal(rejected.body.history.at(-1).comment, 'Нужно согласовать замещение.');
  assert.equal((await request('/bootstrap', { cookie: employee })).body.user.leaveReserved, 0);
  const next = await createLeave(employee, 20);
  assert.equal(next.status, 201);
  assert.equal((await request(`/requests/${next.body.id}/action`, { cookie: employee, method: 'POST', body: { action: 'cancel' } })).status, 200);
  const person = (await request('/bootstrap', { cookie: employee })).body.user;
  assert.equal(person.leaveReserved, 0);
  assert.equal(person.leaveBalance, 24);
});

test('dates, overlap and available balance are enforced by the server', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const cookie = await login('employee@asar.demo');
  for (const [startDate, endDate] of [['2027-02-30', '2027-03-02'], [date(-2), date(-1)], [date(12), date(10)]]) {
    assert.equal((await request('/requests', { cookie, method: 'POST', body: { startDate, endDate, reason: 'Невалидный период' } })).status, 400);
  }
  assert.equal((await createLeave(cookie)).status, 201);
  assert.equal((await createLeave(cookie, 11)).status, 409);
  assert.equal((await createLeave(cookie, 30, 25)).status, 409);
  const forged = await request('/requests', { cookie, method: 'POST', body: { startDate: date(20), endDate: date(20), reason: 'Подмена полей', employeeId: 'outsider', status: 'approved', days: 0 } });
  assert.equal(forged.status, 201);
  assert.equal(forged.body.employeeId, 'employee');
  assert.equal(forged.body.status, 'pending_manager');
  assert.equal(forged.body.days, 1);
});

test('leave submission accepts an empty or omitted optional comment', async (t) => {
  const { request, login } = await fixture(t);
  const cookie = await login('employee@asar.demo');
  for (const [offset, optional] of [[10, { reason: '' }], [20, {}]]) {
    const response = await request('/requests', { cookie, method: 'POST', body: { startDate: date(offset), endDate: date(offset), ...optional } });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.reason, '');
    assert.equal(response.body.days, 1);
    assert.equal(response.body.status, 'pending_manager');
  }
});

test('HR cannot give final approval to their own leave', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const hr = await login('hr@asar.demo');
  const manager2 = await login('secondmanager@asar.demo');
  const created = await createLeave(hr);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: manager2, method: 'POST', body: { action: 'approve' } })).status, 200);
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } })).status, 403);
});

test('a manager cannot approve their own request instead of their assigned manager', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const manager = await login('manager@asar.demo');
  const reviewer = await login('secondmanager@asar.demo');
  const created = await createLeave(manager);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.status, 'pending_manager');
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: manager, method: 'POST', body: { action: 'approve' } })).status, 403);
  assert.equal((await request(`/requests/${created.body.id}`, { cookie: manager })).body.status, 'pending_manager');
  assert.equal((await request(`/requests/${created.body.id}/action`, { cookie: reviewer, method: 'POST', body: { action: 'approve' } })).status, 200);
});

test('attachments work for another authorized account and are denied to another team', async (t) => {
  const { request, login, createLeave } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const outsider = await login('outsider@asar.demo');
  const created = await createLeave(employee);
  const contents = 'Fictional HR attachment. No personal data.';
  const uploaded = await request(`/requests/${created.body.id}/attachments`, {
    cookie: employee, method: 'POST', body: contents, binary: true,
    headers: { 'Content-Type': 'text/plain', 'X-File-Name': encodeURIComponent('Демо.txt') },
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.name, 'Демо.txt');
  const downloaded = await request(`/attachments/${uploaded.body.id}`, { cookie: manager });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.body, contents);
  assert.equal((await request(`/attachments/${uploaded.body.id}`, { cookie: outsider })).status, 404);
  assert.equal((await request(`/attachments/${uploaded.body.id}`)).status, 401);
});

test('sessions, requests, balances, attachment bytes and learning progress survive a restart', async (t) => {
  const { request, login, createLeave, restart } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const created = await createLeave(employee);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const contents = 'Persistent fictional attachment';
  const file = await request(`/requests/${id}/attachments`, { cookie: employee, method: 'POST', binary: true, body: contents, headers: { 'Content-Type': 'text/plain', 'X-File-Name': 'persistent.txt' } });
  assert.equal(file.status, 201);
  assert.equal((await request(`/requests/${id}/action`, { cookie: manager, method: 'POST', body: { action: 'approve' } })).status, 200);
  assert.equal((await request('/courses/onboarding/lessons/onboarding-1/complete', { cookie: employee, method: 'POST', body: {} })).status, 200);
  await restart();
  const state = await request('/bootstrap', { cookie: employee });
  assert.equal(state.status, 200, 'stored session remains valid after the server restarts');
  assert.equal(state.body.user.leaveBalance, 24);
  assert.equal(state.body.user.leaveReserved, 3);
  assert.deepEqual(state.body.enrollments.find((item) => item.courseId === 'onboarding').completedLessonIds, ['onboarding-1']);
  const saved = await request(`/requests/${id}`, { cookie: employee });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status, 'pending_hr');
  assert.equal(saved.body.history.length, 3);
  assert.equal(saved.body.attachments[0].id, file.body.id);
  assert.equal((await request(`/attachments/${file.body.id}`, { cookie: manager })).body, contents);
  const hr = await login('hr@asar.demo');
  assert.equal((await request(`/requests/${id}/action`, { cookie: hr, method: 'POST', body: { action: 'approve' } })).status, 200);
  await restart();
  const final = await request('/bootstrap', { cookie: employee });
  assert.equal(final.status, 200);
  assert.equal(final.body.user.leaveBalance, 21);
  assert.equal(final.body.user.leaveReserved, 0);
  assert.equal(final.body.requests.find((item) => item.id === id).status, 'approved');
});

test('attachments remain readable after moving the data folder, including legacy absolute paths', async (t) => {
  const { app, request, login, createLeave, restart } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const manager = await login('manager@asar.demo');
  const created = await createLeave(employee);
  const contents = 'Portable fictional attachment';
  const uploaded = await request(`/requests/${created.body.id}/attachments`, {
    cookie: employee, method: 'POST', binary: true, body: contents,
    headers: { 'Content-Type': 'text/plain', 'X-File-Name': 'portable.txt' },
  });
  assert.equal(uploaded.status, 201);
  const db = new DatabaseSync(join(app.dataDir, 'asar.sqlite'));
  try {
    assert.equal(db.prepare('SELECT path FROM attachments WHERE id=?').get(uploaded.body.id).path, `uploads/${uploaded.body.id}`);
    db.prepare('UPDATE attachments SET path=? WHERE id=?').run(join(app.dataDir, 'uploads', uploaded.body.id), uploaded.body.id);
  } finally { db.close(); }
  await restart({ move: true });
  const downloaded = await request(`/attachments/${uploaded.body.id}`, { cookie: manager });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.body, contents);
});

test('only HR creates personnel; employees cannot assign themselves a role', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const hr = await login('hr@asar.demo');
  const input = { name: 'Демо Сотрудник', email: 'new-person@asar.demo', password: 'Temporary-employee-password-7!', role: 'employee', department: 'Логистика', position: 'Стажёр', managerId: 'manager', hiredAt: date(0), leaveBalance: 24 };
  assert.equal((await request('/people', { cookie: employee, method: 'POST', body: input })).status, 403);
  const created = await request('/people', { cookie: hr, method: 'POST', body: input });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.role, 'employee');
  assert.ok(!('password' in created.body));
  const own = await request('/bootstrap', { cookie: employee });
  assert.equal(own.body.user.role, 'employee');
});

test('marking a notification read cannot mutate a different employee notification', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const outsider = await login('outsider@asar.demo');
  const ownState = (await request('/bootstrap', { cookie: employee })).body;
  const outsiderState = (await request('/bootstrap', { cookie: outsider })).body;
  const foreignNotification = outsiderState.notifications.find((item) => item.readAt === null);
  assert.ok(foreignNotification);
  const response = await request('/notifications/read', { cookie: employee, method: 'POST', body: { id: foreignNotification.id } });
  assert.equal(response.status, 200);
  const foreignAfter = (await request('/bootstrap', { cookie: outsider })).body.notifications.find((item) => item.id === foreignNotification.id);
  assert.equal(foreignAfter.readAt, null);
  const ownAfter = (await request('/bootstrap', { cookie: employee })).body.notifications;
  assert.deepEqual(ownAfter, ownState.notifications, 'unknown foreign ID must not mark all of the caller’s notifications read');
});

test('a course visible in the catalog does not allow an unassigned employee to complete it', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const outsider = await login('outsider@asar.demo');
  const employeeState = (await request('/bootstrap', { cookie: employee })).body;
  assert.ok(employeeState.courses.some((course) => course.id === 'data-safety'));
  assert.ok(!employeeState.enrollments.some((item) => item.courseId === 'data-safety'));
  const outsiderState = (await request('/bootstrap', { cookie: outsider })).body;
  assert.ok(outsiderState.enrollments.some((item) => item.courseId === 'data-safety'));
  assert.equal((await request('/courses/data-safety/lessons/safety-1/complete', { cookie: employee, method: 'POST', body: {} })).status, 404);
  assert.equal((await request('/courses/data-safety/quiz', { cookie: employee, method: 'POST', body: { answers: [1, 0, 2, 1] } })).status, 404);
  const after = (await request('/bootstrap', { cookie: employee })).body;
  assert.ok(!after.enrollments.some((item) => item.courseId === 'data-safety'));
});

test('Academy keeps answers on the server, requires lessons and records a real quiz result', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const hr = await login('hr@asar.demo');
  const state = (await request('/bootstrap', { cookie: employee })).body;
  const course = state.courses.find((item) => item.id === 'onboarding');
  assert.ok(course);
  assert.ok(course.quiz.every((item) => !('correctIndex' in item)), 'answers must not be leaked to learners');
  assert.equal((await request('/courses/onboarding/quiz', { cookie: employee, method: 'POST', body: { answers: [1, 0, 2, 1] } })).status, 409);
  for (const lesson of course.lessons) assert.equal((await request(`/courses/onboarding/lessons/${lesson.id}/complete`, { cookie: employee, method: 'POST', body: {} })).status, 200);
  const failed = await request('/courses/onboarding/quiz', { cookie: employee, method: 'POST', body: { answers: [0, 1, 0, 0] } });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.passed, false);
  const passed = await request('/courses/onboarding/quiz', { cookie: employee, method: 'POST', body: { answers: [1, 0, 2, 1] } });
  assert.equal(passed.status, 200);
  assert.equal(passed.body.score, 100);
  assert.equal(passed.body.passed, true);
  const result = (await request('/bootstrap', { cookie: employee })).body.enrollments.find((item) => item.courseId === course.id);
  assert.equal(result.completedLessonIds.length, 3);
  assert.equal(result.passed, true);
  assert.ok(result.completedAt);
  assert.equal((await request('/courses/onboarding/assign', { cookie: employee, method: 'POST', body: { userIds: ['outsider'] } })).status, 403);
  assert.equal((await request('/courses/data-safety/assign', { cookie: hr, method: 'POST', body: { userIds: ['employee'] } })).status, 200);
});

test('HR course editor publishes, assigns and invalidates stale progress after material changes', async (t) => {
  const { request, login } = await fixture(t);
  const employee = await login('employee@asar.demo');
  const hr = await login('hr@asar.demo');
  const title = { ru: 'Новый учебный курс', kk: 'Жаңа оқу курсы', en: 'New training course' };
  const draft = { title, description: title, category: 'onboarding', durationMinutes: 5, published: false, passScore: 80, cover: 'blue', lessons: [{ id: 'new-1', title, content: title }], quiz: [{ id: 'new-q1', prompt: title, options: [title, title], correctIndex: 0 }] };
  assert.equal((await request('/courses', { cookie: employee, method: 'POST', body: draft })).status, 403);
  const created = await request('/courses', { cookie: hr, method: 'POST', body: draft });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const state = (await request('/bootstrap', { cookie: employee })).body;
  assert.ok(!state.courses.some((course) => course.id === created.body.id), 'draft remains hidden from learners');
  const courseId = created.body.id;
  const published = await request('/courses', { cookie: hr, method: 'POST', body: { ...draft, id: courseId, published: true } });
  assert.equal(published.status, 200);
  assert.equal((await request(`/courses/${courseId}/assign`, { cookie: hr, method: 'POST', body: { userIds: ['employee'] } })).status, 200);
  assert.equal((await request(`/courses/${courseId}/lessons/new-1/complete`, { cookie: employee, method: 'POST', body: {} })).status, 200);
  const passed = await request(`/courses/${courseId}/quiz`, { cookie: employee, method: 'POST', body: { answers: [0] } });
  assert.equal(passed.status, 200);
  assert.equal(passed.body.passed, true);
  const changedMaterial = { ru: 'Утверждён новый учебный материал.', kk: 'Жаңа оқу материалы бекітілді.', en: 'The course material has changed.' };
  const updated = await request('/courses', { cookie: hr, method: 'POST', body: { ...draft, id: courseId, published: true, lessons: [{ ...draft.lessons[0], content: changedMaterial }] } });
  assert.equal(updated.status, 200);
  const refreshed = (await request('/bootstrap', { cookie: employee })).body;
  const enrollment = refreshed.enrollments.find((item) => item.courseId === courseId);
  assert.deepEqual(enrollment.completedLessonIds, []);
  assert.equal(enrollment.score, null);
  assert.equal(enrollment.passed, false);
  assert.equal(enrollment.completedAt, null);
  assert.ok(refreshed.notifications.some((item) => item.type === 'course_updated'));
});
