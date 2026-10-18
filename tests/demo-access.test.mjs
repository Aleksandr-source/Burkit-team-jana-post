import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/app.mjs';
import { createDisabledModelProvider } from '../server/ai/local-model-provider.mjs';
import { isLocalDemoRequest } from '../server/demo-access.mjs';

async function fixture(t, demoLogin = false) {
  const dataDir = await mkdtemp(join(tmpdir(), 'janamen-demo-auth-'));
  const app = createApplication({ dataDir, demoLogin, demoPassword: 'Demo-auth-test-only-294!', modelProvider: createDisabledModelProvider() });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function call(path, { cookie, body, headers = {} } = {}) {
    const response = await fetch(origin + '/api' + path, { method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  return { call, origin, dataDir };
}

test('quick demo sign-in is opt-in; normal authentication remains required when off', async t => {
  const { call } = await fixture(t);
  assert.deepEqual((await call('/auth/demo')).data, { enabled: false, roles: [] });
  assert.equal((await call('/auth/demo-login', { body: { role: 'hr' } })).status, 404);
  assert.equal((await call('/bootstrap')).status, 401);
});

test('presentation switch rotates sessions and enforces each role on the server', async t => {
  const { call } = await fixture(t, true);
  const catalog = await call('/auth/demo');
  assert.deepEqual(catalog.data, { enabled: true, roles: ['employee', 'manager', 'hr'] });
  assert.doesNotMatch(JSON.stringify(catalog.data), /password|salt|hash|294/);
  let previous;
  for (const role of ['employee', 'manager', 'hr', 'employee']) {
    const login = await call('/auth/demo-login', { cookie: previous, body: { role } });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal(login.data.user.role, role);
    assert.doesNotMatch(JSON.stringify(login.data), /passwordHash|passwordSalt|294/);
    if (previous) assert.equal((await call('/bootstrap', { cookie: previous })).status, 401, 'old session is invalidated');
    const workspace = await call('/bootstrap', { cookie: login.cookie });
    assert.equal(workspace.data.user.id, role);
    if (role === 'employee') assert.ok(workspace.data.people.every(person => person.id === 'employee'));
    assert.equal((await call('/integrations', { cookie: login.cookie })).status, role === 'hr' ? 200 : 403);
    previous = login.cookie;
  }
  await call('/auth/logout', { cookie: previous, body: {} });
  assert.equal((await call('/bootstrap', { cookie: previous })).status, 401);
});

test('quick sign-in rejects arbitrary accounts, spoofed fields and foreign origins', async t => {
  const { call, origin } = await fixture(t, true);
  for (const body of [{ role: 'outsider' }, { role: 'admin' }, { role: 'hr', userId: 'employee' }, { email: 'hr@janamen.demo' }, { role: 'hr', company: 'Other' }])
    assert.equal((await call('/auth/demo-login', { body })).status, 400);
  assert.equal((await call('/auth/demo-login', { body: { role: 'hr' }, headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call('/auth/demo-login', { body: { role: 'hr' }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 404);
  // Fetch normalizes Host; use HTTP directly to exercise a non-local host.
  const externalHost = await new Promise((resolve, reject) => {
    httpGet(origin + '/api/auth/demo', { headers: { Host: 'public.example' } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => text += chunk);
      response.on('end', () => resolve(JSON.parse(text)));
    }).on('error', reject);
  });
  assert.deepEqual(externalHost, { enabled: false, roles: [] });
});

test('modified identities cannot masquerade as the seeded HR demo account', async t => {
  const { call, dataDir } = await fixture(t, true);
  const db = new DatabaseSync(join(dataDir, 'asar.sqlite'));
  try {
    db.prepare("UPDATE people SET company='Real Company' WHERE id='hr'").run();
    assert.deepEqual((await call('/auth/demo')).data.roles, ['employee', 'manager']);
    assert.equal((await call('/auth/demo-login', { body: { role: 'hr' } })).status, 400);
    db.prepare("UPDATE people SET company='Jana Post · демо',email='real-person@example.test' WHERE id='hr'").run();
    assert.equal((await call('/auth/demo-login', { body: { role: 'hr' } })).status, 400);
  } finally { db.close(); }
});

test('loopback access fails closed for remote clients, custom hosts and cross-origin pages', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000' } };
  assert.equal(isLocalDemoRequest(request), true);
  assert.equal(isLocalDemoRequest({ ...request, socket: { remoteAddress: '192.168.1.7' } }), false);
  assert.equal(isLocalDemoRequest({ ...request, headers: { host: 'evil.test' } }), false);
  assert.equal(isLocalDemoRequest({ ...request, headers: { ...request.headers, origin: 'http://localhost:3000' } }), false);
  assert.equal(isLocalDemoRequest({ ...request, headers: { ...request.headers, origin: 'not a URL' } }), false);
  assert.equal(isLocalDemoRequest({ socket: { remoteAddress: '::1' }, headers: { host: '[::1]:3000', origin: 'http://[::1]:3000' } }), true);
});
