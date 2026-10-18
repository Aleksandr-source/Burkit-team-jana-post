// Run the built application from a fresh directory without node_modules,
// existing accounts, environment files, AI weights or the development server.
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'janamen-smoke-'));
let app;
try {
  for (const name of ['server', 'scripts', 'dist', 'package.json']) await cp(join(root, name), join(directory, name), { recursive: true });
  const { createApplication } = await import(pathToFileURL(join(directory, 'server/app.mjs')).href);
  const password = 'Smoke-fixture-only-724!';
  app = createApplication({ dataDir: join(directory, '.data'), demoPassword: password });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const html = await (await fetch(base)).text();
  assert.match(html, /<div id="root"><\/div>/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')) && assets.some(asset => asset.endsWith('.css')));
  for (const asset of assets) assert.equal((await fetch(base + asset)).status, 200);
  async function call(path, cookie, body) {
    const response = await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { response, data: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  }
  async function login(role) {
    const { response } = await call('/auth/login', null, { email: `${role}@janamen.demo`, password });
    assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
  }
  const employee = await login('employee'), manager = await login('manager'), hr = await login('hr');
  const state = await call('/bootstrap', employee);
  assert.equal(state.data.user.role, 'employee');
  assert.ok(state.data.courses.length > 0);
  const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const created = await call('/requests', employee, { startDate: date(30), endDate: date(32) });
  assert.equal(created.response.status, 201);
  const id = created.data.id;
  assert.equal((await call(`/requests/${id}/action`, manager, { action: 'approve', expectedStatus: 'pending_manager' })).data.status, 'pending_hr');
  assert.equal((await call(`/requests/${id}/action`, hr, { action: 'approve', expectedStatus: 'pending_hr' })).data.status, 'approved');
  assert.equal((await call(`/requests/${id}/document`, employee)).response.status, 200);
  const documentPath = '/integrations/documentolog/documents';
  const registered = await call(documentPath, hr, { requestId: id });
  assert.equal(registered.response.status, 201);
  const processingPath = `/requests/${id}/document-processing`;
  assert.equal((await call(processingPath, employee)).data.document.status, 'registered');
  const documentUpdate = `${documentPath}/${registered.data.document.id}/mock-transition`;
  assert.equal((await call(documentUpdate, employee, { status: 'rejected' })).response.status, 403);
  assert.equal((await call(documentUpdate, hr, { status: 'in_review' })).response.status, 200);
  assert.equal((await call(documentUpdate, hr, { status: 'rejected' })).response.status, 200);
  const processing = (await call(processingPath, employee)).data.document;
  assert.equal(processing.status, 'rejected');
  assert.deepEqual(processing.history.map(event => event.status), ['registered', 'in_review', 'rejected']);
  assert.equal(processing.payload, undefined);
  assert.equal((await call(`/requests/${id}`, employee)).data.status, 'approved');
  const unsupported = await call('/assistant', employee, { question: 'Можно ли перенести отпуск на следующий год?', lang: 'ru' });
  assert.equal(unsupported.data.mode, 'refusal');
  const inquiry = await call('/hr-inquiries', employee, { question: 'Можно ли перенести отпуск на следующий год?', language: 'ru', clientRequestId: randomUUID() });
  assert.equal(inquiry.response.status, 201);
  assert.equal((await call(`/hr-inquiries/${inquiry.data.id}`, manager)).response.status, 404);
  assert.equal((await call(`/hr-inquiries/${inquiry.data.id}/answer`, hr, { answer: 'Уточните этот вопрос у HR своей компании: в демонстрационной базе такого правила нет.' })).data.status, 'answered');
  assert.equal((await call(`/hr-inquiries/${inquiry.data.id}`, employee)).data.answeredBy, 'hr');
  const course = state.data.courses.find(item => item.id === 'onboarding');
  assert.ok(course.quiz.every(item => item.correctIndex === undefined));
  assert.equal((await call('/courses/onboarding/quiz', employee, { answers: [1, 0, 2, 1] })).response.status, 409);
  for (const lesson of course.lessons) assert.equal((await call(`/courses/onboarding/lessons/${lesson.id}/complete`, employee, {})).response.status, 200);
  const failed = await call('/courses/onboarding/quiz', employee, { answers: [0, 1, 0, 0] });
  assert.equal(failed.data.passed, false);
  assert.ok(failed.data.feedback.every(item => item.correct === false));
  const passed = await call('/courses/onboarding/quiz', employee, { answers: [1, 0, 2, 1] });
  assert.equal(passed.data.passed, true);
  const refreshed = (await call('/bootstrap', employee)).data;
  assert.ok(refreshed.enrollments.find(item => item.courseId === course.id).passed);
  for (const type of ['request_approved', 'course_completed', 'hr_inquiry_answered'])
    assert.ok(refreshed.notifications.some(item => item.type === type), type);
  assert.ok(refreshed.notifications.some(item => item.type === 'document_status' && item.documentProcessing?.status === 'rejected'));
  await call('/auth/logout', employee, {});
  const relogged = (await call('/bootstrap', await login('employee'))).data;
  assert.ok(relogged.enrollments.find(item => item.courseId === course.id).passed, 'learning survives a new session');
  console.log('Portable smoke passed: fresh storage/assets, three roles, leave/document, separate Documentolog status/history and read-only access, safe refusal, HR inquiry/answer, lesson gate, quiz feedback/retry, notifications and learning across sessions. No node_modules or model required.');
} finally {
  if (app) { if (app.server.listening) await new Promise(resolve => app.server.close(resolve)); app.close(); }
  if (!directory.startsWith(join(tmpdir(), 'janamen-smoke-'))) throw Error('Unexpected temporary directory');
  await rm(directory, { recursive: true, force: true });
}
