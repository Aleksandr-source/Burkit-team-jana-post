import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEvaluationPack, eligibleFixture, retrieveFixtures } from '../evaluation/catalog.mjs';
import { createEvaluationApplication } from '../server/evaluation.mjs';
import { knowledge, knowledgeSource, knowledgeForRole } from '../server/knowledge.mjs';
import { selectEvidence } from '../server/assistant.mjs';
import { createApplication } from '../server/app.mjs';
import { createBusinessStateReader } from '../server/eval-business-state.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pack = await loadEvaluationPack();
const tokens = Object.fromEntries(Object.keys(pack.actors).map((key) => [key, `isolated-test-token-${key}-0123456789abcdef`]));
const employee = { ...pack.actors.employee_a, key: 'employee_a' };
const postBody = { question: 'Как подать заявку на отпуск?', response_language: 'ru' };

async function withServer(options, run) {
  const app = createEvaluationApplication({ ...pack, tokens, today: () => '2026-10-17', ...options });
  const server = await app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, actor = 'employee_a', body, extraHeaders = {}) => {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  try { await run(request); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const chooseFirst = async (_question, entries) => ({ selected: entries.slice(0, 1), raw_model_output: '1',
  model_context_ids: [...new Set(entries.map(({ document }) => document.id))] });

test('original pack hashes validate and fixtures are separated from the product knowledge', () => {
  assert.equal(pack.catalog.size, 58); assert.equal(pack.snapshots.size, 128);
  assert.ok([...pack.catalog.values()].every((row) => row.scope === 'test_only' && row.is_fictional));
  assert.ok(knowledge.every((row) => !pack.catalog.has(row.id)));
});

test('product citations expose honest origin, version, hash and authenticated source path', () => {
  for (const document of knowledge) for (const language of ['ru', 'kk', 'en']) {
    const source = knowledgeSource(document, language);
    assert.equal(source.excerpt, document.content[language]); assert.equal(source.fictional, true);
    assert.match(source.version, /DEMO/); assert.match(source.origin, /Jana Post/);
    assert.match(source.sha256, /^[a-f0-9]{64}$/); assert.equal(source.url, `/api/knowledge/${document.id}?lang=${language}`);
  }
  assert.deepEqual(knowledgeForRole('administrator'), []);
});

test('eligibility enforces approval, date, role, team and organization before retrieval', () => {
  const privateDoc = pack.catalog.get('leave.private.ru');
  assert.equal(eligibleFixture(privateDoc, employee, '2026-10-17'), false);
  assert.equal(eligibleFixture(privateDoc, pack.actors.hr, '2026-10-17'), true);
  const teamDoc = pack.catalog.get('leave.team_a.ru');
  assert.equal(eligibleFixture(teamDoc, pack.actors.manager_a, '2026-10-17'), true);
  assert.equal(eligibleFixture(teamDoc, pack.actors.manager_b, '2026-10-17'), false);
  assert.equal(eligibleFixture(teamDoc, { ...pack.actors.manager_a, organization: 'OTHER' }, '2026-10-17'), false);
  assert.equal(eligibleFixture(pack.catalog.get('leave.revoked.ru'), employee, '2026-10-17'), false);
  assert.equal(eligibleFixture(pack.catalog.get('leave.policy.v1.ru'), employee, '2026-11-01'), false);
  assert.equal(eligibleFixture(pack.catalog.get('leave.policy.v2.ru'), employee, '2026-11-01'), true);
});

test('retrieval is a bounded deterministic lexical search, independent of expected case labels', () => {
  const rows = [...pack.catalog.values()].filter((row) => eligibleFixture(row, employee, '2026-10-17'));
  const first = retrieveFixtures('Как подать заявку на отпуск?', rows, 'ru');
  assert.ok(first.length > 0 && first.length <= 3);
  assert.deepEqual(first, retrieveFixtures('Как подать заявку на отпуск?', [...rows].reverse(), 'ru'));
});

test('standalone service requires auth, denies browser origins and never caches source data', async () => {
  await withServer({ selector: chooseFirst }, async (request) => {
    assert.equal((await request('/v1/assistant/answer', null, postBody)).status, 401);
    assert.equal((await request('/v1/knowledge/leave.create.ru', 'employee_a', undefined, { Origin: 'http://evil.invalid' })).status, 403);
    const denied = await request('/v1/knowledge/leave.private.ru');
    const missing = await request('/v1/knowledge/missing');
    assert.equal(denied.status, 404); assert.deepEqual(denied.body, missing.body);
    const allowed = await request('/v1/knowledge/leave.private.ru', 'hr');
    assert.equal(allowed.status, 200); assert.match(allowed.body.text, /LEAVE-DEMO-741/);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.equal((await request('/v1/knowledge/leave.private.ru')).status, 404);
  });
});

test('oracle returns source quotations and true selector raw output, never synthetic model JSON', async () => {
  let called = 0;
  await withServer({ selector: async (...args) => { called += 1; return chooseFirst(...args); } }, async (request) => {
    const result = await request('/__eval__/oracle', 'employee_a', { ...postBody, evidence: [
      { evidence_id: 'K1', text: 'Исходная статья. Второе условие.', language: 'ru', source_kind: 'application_help', version: 'test' },
    ] });
    assert.equal(result.status, 200); assert.equal(result.body.answer, 'Исходная статья.');
    assert.equal(result.body.raw_model_output, '1'); assert.equal(JSON.parse(result.body.raw_model_output), 1);
    assert.equal(result.body.adapter_semantics, 'evidence_selection_extract');
    assert.deepEqual(result.body.evidence_ids, ['K1']); assert.equal(called, 1);
  });
});

test('empty oracle context never pretends an application refusal was generated by a model', async () => {
  await withServer({ selector: async () => { throw new Error('must not call'); } }, async (request) => {
    const result = await request('/__eval__/oracle', 'employee_a', { ...postBody, evidence: [] });
    assert.equal(result.status, 200); assert.equal(result.body.decision, 'insufficient_context');
    assert.equal(result.body.raw_model_output, '');
    assert.equal(result.body.evaluation_trace.model_called, false);
  });
});

test('integrated snapshots cannot grant HR role via body fields or leak private model context', async () => {
  let called = false;
  await withServer({ selector: async () => { called = true; throw new Error('must not call'); } }, async (request) => {
    const snapshot = [...pack.snapshots.values()].find((row) => row.candidate_pool_ids.includes('leave.private.ru') && row.candidate_pool_ids.length === 1);
    assert.ok(snapshot);
    const result = await request('/v1/assistant/answer', 'employee_a', { ...postBody, role: 'hr', organization: 'DEMO', team: 'A' },
      { 'X-JanaMen-Eval-Case': snapshot.case_id });
    assert.equal(result.status, 200); assert.equal(result.body.status, 'insufficient_context');
    assert.deepEqual(result.body.evaluation_trace.retrieved_ids, []); assert.equal(called, false);
    assert.doesNotMatch(JSON.stringify(result.body), /LEAVE-DEMO-741/);
  });
});

test('snapshots are isolated per request, unknown snapshot is a setup error', async () => {
  await withServer({ selector: chooseFirst }, async (request) => {
    const first = await request('/v1/assistant/answer', 'employee_a', postBody, { 'X-JanaMen-Eval-Case': 'leave.01.ru' });
    assert.equal(first.status, 200);
    assert.ok(first.body.evaluation_trace.retrieved_ids.every((id) => id === 'leave.create.ru'));
    const second = await request('/v1/assistant/answer', 'employee_a', { ...postBody, question: 'Как подать заявку на аванс?' },
      { 'X-JanaMen-Eval-Case': 'advance.01.ru' });
    assert.ok(second.body.evaluation_trace.retrieved_ids.every((id) => id === 'advance.create.ru'));
    const invalid = await request('/v1/assistant/answer', 'employee_a', postBody, { 'X-JanaMen-Eval-Case': 'unknown' });
    assert.equal(invalid.status, 400);
  });
});

test('missing model and invalid raw output are errors rather than successful fallbacks', async () => {
  for (const [error, status] of [['model_unavailable', 503], ['invalid_model_output', 502]]) {
    await withServer({ selector: async () => ({ selected: null, error, raw_model_output: '{bad' }) }, async (request) => {
      const result = await request('/__eval__/oracle', 'employee_a', { ...postBody,
        evidence: [{ evidence_id: 'K1', text: 'Достаточно информации.', language: 'ru' }] });
      assert.equal(result.status, status); assert.equal(result.body.raw_model_output, '{bad');
    });
  }
});

test('test-only state hashing calls its actual reader and refuses unconnected advance', async () => {
  let readerActor;
  await withServer({ selector: chooseFirst, businessStateReader: async ({ actor, kind }) => {
    readerActor = actor; return kind === 'leave' ? { state_sha256: 'a'.repeat(64) } : null;
  } }, async (request) => {
    const result = await request('/__eval__/business-state/leave', 'manager_b');
    assert.equal(result.status, 200); assert.equal(readerActor.key, 'manager_b');
    assert.equal(readerActor.team, 'B');
    assert.equal((await request('/__eval__/business-state/advance')).status, 501);
  });
});

test('a command through the adapter leaves the actual isolated product SQLite unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-eval-test-'));
  const product = createApplication({ dataDir: directory, demoPassword: 'Isolated-Eval-Test-Only-Password', seed: true });
  product.close();
  try {
    await withServer({ selector: chooseFirst, businessStateReader: createBusinessStateReader(directory) }, async (request) => {
      const before = await request('/__eval__/business-state/leave');
      assert.equal(before.status, 200); assert.match(before.body.state_sha256, /^[a-f0-9]{64}$/);
      const result = await request('/v1/assistant/answer', 'employee_a', {
        question: 'Отправь и согласуй мою заявку на отпуск', response_language: 'ru', role: 'hr',
      }, { 'X-JanaMen-Eval-Case': 'leave.01.ru' });
      assert.equal(result.status, 200);
      const after = await request('/__eval__/business-state/leave');
      assert.equal(after.status, 200); assert.deepEqual(after.body, before.body);
      assert.equal((await request('/__eval__/business-state/advance')).status, 501);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('concurrency is limited to one model call, avoiding laptop inference overload', async () => {
  let release; let entered;
  const wait = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { entered = resolve; });
  await withServer({ selector: async (...args) => { entered(); await wait; return chooseFirst(...args); } }, async (request) => {
    const body = { ...postBody, evidence: [{ evidence_id: 'K1', text: 'Демонстрационное условие.', language: 'ru' }] };
    const first = request('/__eval__/oracle', 'employee_a', body);
    await ready;
    const second = await request('/__eval__/oracle', 'employee_a', body);
    assert.equal(second.status, 429);
    release(); assert.equal((await first).status, 200);
  });
});

test('both disable flags prevent any local model call', async () => {
  const previous = { disabled: process.env.ASAR_AI_DISABLED, disable: process.env.ASAR_DISABLE_AI };
  try {
    for (const flag of ['ASAR_AI_DISABLED', 'ASAR_DISABLE_AI']) {
      delete process.env.ASAR_AI_DISABLED; delete process.env.ASAR_DISABLE_AI;
      process.env[flag] = '1';
      const result = await selectEvidence('Вопрос', []);
      assert.equal(result.error, 'model_unavailable'); assert.equal(result.selected, null);
    }
  } finally {
    if (previous.disabled === undefined) delete process.env.ASAR_AI_DISABLED; else process.env.ASAR_AI_DISABLED = previous.disabled;
    if (previous.disable === undefined) delete process.env.ASAR_DISABLE_AI; else process.env.ASAR_DISABLE_AI = previous.disable;
  }
});
