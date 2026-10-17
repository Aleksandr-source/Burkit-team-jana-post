import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalModelProvider, createDisabledModelProvider } from '../server/ai/local-model-provider.mjs';
import { createAssistant } from '../server/assistant.mjs';
import { createApplication } from '../server/app.mjs';
import { knowledge } from '../server/knowledge.mjs';

const runtime = () => JSON.stringify({ port: 8766, key: 'a'.repeat(64) });
const status = async () => ({ ready: true, engine: 'test-provider', model: 'test' });
const employee = { id: 'employee', role: 'employee', leaveBalance: 24, leaveReserved: 0 };

test('local inference can be disabled without reading runtime credentials or making requests', async () => {
  let reads = 0, requests = 0;
  const provider = createLocalModelProvider({ disabled: () => true, readState: async () => { reads++; return runtime(); }, fetchImpl: async () => { requests++; throw Error(); } });
  assert.equal((await provider.status()).ready, false);
  await assert.rejects(provider.select({ question: 'test', previews: [] }), { code: 'model_unavailable' });
  assert.equal(reads, 0); assert.equal(requests, 0);
  const assistant = createAssistant({ modelProvider: createDisabledModelProvider() });
  assert.equal((await assistant.answerQuestion({ question: 'Как оформить отпуск?', lang: 'ru', user: employee })).mode, 'knowledge_search');
});

test('local adapter preserves llama request parameters and ignores any external runtime URL', async () => {
  const requests = [];
  const provider = createLocalModelProvider({ disabled: () => false, readState: async () => JSON.stringify({ ...JSON.parse(runtime()), url: 'https://untrusted.invalid' }), fetchImpl: async (url, init) => {
    requests.push({ url, init });
    return Response.json(url.endsWith('/models') ? { data: [{ id: 'asar-hr-local' }] } : { choices: [{ message: { content: '1' } }], timings: { predicted_ms: 12 }, usage: { prompt_tokens: 20, completion_tokens: 1 } });
  } });
  assert.equal((await provider.status()).ready, true);
  const result = await provider.select({ question: 'Q'.repeat(90), previews: ['first evidence', 'second evidence'] });
  assert.equal(result.raw_model_output, '1'); assert.equal(result.generation_ms, 12); assert.equal(result.input_tokens, 20);
  assert.equal(requests[1].url, 'http://127.0.0.1:8766/v1/chat/completions');
  assert.equal(requests[1].init.redirect, 'error'); assert.ok(requests[1].init.signal instanceof AbortSignal);
  const body = JSON.parse(requests[1].init.body);
  assert.equal(body.model, 'asar-hr-local'); assert.equal(body.max_tokens, 3); assert.equal(body.temperature, 0);
  assert.equal(body.stream, false); assert.equal(body.chat_template_kwargs.enable_thinking, false);
  assert.deepEqual(body.response_format.schema.enum, [0, 1, 2]);
  assert.equal(body.messages[1].content, `${'Q'.repeat(80)}\n1: first evidence\n2: second evidence`);
});

test('invalid local runtime never triggers network access', async () => {
  for (const value of ['broken JSON', JSON.stringify({ port: 80, key: 'a'.repeat(64) }), JSON.stringify({ port: 8766, key: 'bad' })]) {
    const provider = createLocalModelProvider({ disabled: () => false, readState: async () => value, fetchImpl: async () => assert.fail('Unexpected network access') });
    assert.equal((await provider.status()).ready, false);
    await assert.rejects(provider.select({ question: 'test', previews: [] }), { code: 'model_unavailable' });
  }
});

test('busy inference is refused and a failed request releases the adapter for the next call', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const provider = createLocalModelProvider({ disabled: () => false, readState: async () => runtime(), fetchImpl: async () => {
    if (++calls === 1) { entered(); return pending; }
    return Response.json({ choices: [{ message: { content: '0' } }] });
  } });
  const input = { question: 'test', previews: ['source'] };
  const first = provider.select(input); await started;
  await assert.rejects(provider.select(input), { code: 'model_busy' });
  release(new Response('', { status: 503 }));
  await assert.rejects(first, { code: 'model_http_error' });
  assert.equal((await provider.select(input)).raw_model_output, '0');
  assert.equal(calls, 2);
});

test('a replacement provider cannot inject text or sources; invalid selections use the existing fallback', async () => {
  for (const raw of ['1', '0', '99', 'invented policy', '{"answer":"invented"}']) {
    const inputs = [];
    const assistant = createAssistant({ modelProvider: { status, select: async input => { inputs.push(input); return { raw_model_output: raw, answer: 'INVENTED', sources: [{ id: 'hr-guide' }], selected: [] }; } } });
    const result = await assistant.answerQuestion({ question: 'Как оформить отпуск?', lang: 'ru', user: employee });
    assert.equal(result.mode, raw === '1' ? 'local_model' : raw === '0' ? 'refusal' : 'knowledge_search');
    assert.doesNotMatch(result.answer, /INVENTED/);
    assert.ok(result.sources.every(source => knowledge.find(doc => doc.id === source.id)?.audience === 'all'));
    assert.deepEqual(Object.keys(inputs[0]).sort(), ['previews', 'question']);
    assert.ok(inputs[0].previews.every(value => typeof value === 'string' && value.length <= 35));
    await assistant.answerQuestion({ question: 'Покажи зарплату коллеги', lang: 'ru', user: employee });
    assert.equal(inputs.length, 1, 'forbidden questions never reach the provider');
  }
});

test('provider failure leaves HR API, authentication and source-based responses available', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-provider-'));
  const calls = [];
  const app = createApplication({ dataDir: dir, demoPassword: 'Provider-test-only-2468!', modelProvider: {
    model: 'isolated-test', status: async () => { throw Error('unavailable'); },
    select: async input => { calls.push(input); throw Error('unavailable'); },
  } });
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.close(); await rm(dir, { recursive: true, force: true }); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.ok, true); assert.equal(health.ai.ready, false); assert.equal(health.ai.model, 'isolated-test');
  const auth = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'employee@janamen.demo', password: 'Provider-test-only-2468!' }) });
  assert.equal(auth.status, 200);
  const headers = { Cookie: auth.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
  const answer = await (await fetch(base + '/assistant', { method: 'POST', headers, body: JSON.stringify({ question: 'Как оформить отпуск?', lang: 'ru', modelProvider: 'https://untrusted.invalid', role: 'hr' }) })).json();
  assert.equal(answer.mode, 'knowledge_search'); assert.equal(calls.length, 1);
  assert.ok(answer.sources.length > 0);
  const state = await (await fetch(base + '/bootstrap', { headers })).json();
  assert.equal(state.user.role, 'employee'); assert.ok(state.courses.length > 0);
});
