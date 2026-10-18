#!/usr/bin/env node
// Opt-in real-model/API rehearsal. Never run as part of deterministic unit tests.
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createApplication } from '../server/app.mjs';
import { knowledge } from '../server/knowledge.mjs';
import { startLocalAI } from './start-ai.mjs';
import { installationStatus, AI_DIRECTORY, AI_MODEL } from './setup-ai.mjs';
import { resourcePlan } from './resources.mjs';

const output = resolve(process.argv[2] || 'evaluation/demo-qwen06/local-run');
await mkdir(output); // Refuse to overwrite an earlier run.
const casesText = await readFile(process.argv[3] ? resolve(process.argv[3]) : new URL('../evaluation/demo-qwen06/cases.json', import.meta.url), 'utf8');
const cases = JSON.parse(casesText);
if (!Array.isArray(cases) || !cases.length || cases.some(item => !item.id || !item.question || (!item.refusal && (!item.source || !Array.isArray(item.facts))))) throw Error('Expected non-empty product cases with source/facts or refusal');
await writeFile(join(output, 'cases.json'), casesText);
const productSha256 = {};
for (const path of ['server/assistant.mjs', 'server/knowledge.mjs', 'server/knowledge-support.mjs', 'server/ai/local-model-provider.mjs', 'scripts/check-demo-ai.mjs'])
  productSha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
const dataDir = await mkdtemp(join(tmpdir(), 'janamen-demo-'));
const password = randomBytes(24).toString('hex');
const app = createApplication({ dataDir, seed: true, demoPassword: password });
let model, mock, savedRuntime;
const results = [], links = [];
try {
  if (process.env.ASAR_AI_DISABLED === '1' || process.env.ASAR_DISABLE_AI === '1') throw Error('Model is disabled');
  const started = performance.now();
  model = await startLocalAI();
  if (!model) throw Error('Expected an isolated, newly started model process');
  const startupMs = performance.now() - started;
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, cookie, body, accept = 'application/json') {
    const start = performance.now();
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(15000), headers: { Accept: accept, 'Accept-Language': 'en',
        ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text,
      ms: performance.now() - start, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const cookies = {};
  for (const role of ['employee', 'manager', 'hr']) {
    const response = await request('/api/auth/login', null, { email: `${role}@janamen.demo`, password });
    if (response.status !== 200) throw Error('Fixture login failed'); cookies[role] = response.cookie;
  }
  // Cold first request after startup + one full repeat. No artificial warm-up.
  for (let pass = 1; pass <= 2; pass++) for (const item of cases) {
    const response = await request('/api/assistant', cookies[item.role || 'employee'], { question: item.question, lang: item.lang || 'ru' });
    const answer = response.data;
    const correct = response.status === 200 && (!item.mode || answer.mode === item.mode) && (item.refusal ? answer.mode === 'refusal' && !answer.sources.length
      : answer.mode !== 'refusal' && answer.sources.some(source => source.id === item.source)
        && item.facts.every(fact => answer.answer.toLowerCase().includes(fact.toLowerCase())));
    let citationsValid = true;
    for (const source of answer.sources || []) {
      const linked = await request(source.url, cookies[item.role || 'employee']);
      const valid = linked.status === 200 && linked.data.excerpt === source.excerpt
        && linked.data.version === source.version && linked.data.sha256 === source.sha256
        && createHash('sha256').update(source.excerpt).digest('hex') === source.sha256;
      citationsValid &&= valid;
    }
    results.push({ id: item.id, pass, lang: item.lang || 'ru', expectedRefusal: !!item.refusal, role: item.role || 'employee', question: item.question,
      status: response.status, ms: response.ms, correct, citationsValid, ...answer });
    console.log(`${pass}/${item.id}: ${answer.mode}, ${Math.round(response.ms)} ms, correct=${correct}`);
  }
  for (const role of ['anonymous', 'employee', 'manager', 'hr']) for (const document of knowledge) for (const lang of ['ru', 'kk', 'en']) {
    const allowed = role === 'hr' || role !== 'anonymous' && (document.audience === 'all' || role === 'manager' && document.audience === 'manager');
    for (const accept of ['application/json', 'text/html']) {
      const response = await request(`/api/knowledge/${document.id}?lang=${lang}`, cookies[role], undefined, accept);
      const expected = role === 'anonymous' ? 401 : allowed ? 200 : 404;
      const contentOK = !allowed || (accept === 'application/json' ? response.data.excerpt === document.content[lang] : response.data.includes(document.title[lang]));
      links.push({ role, id: document.id, lang, accept, status: response.status, expected, passed: response.status === expected && contentOK });
    }
  }
  const closed = once(model, 'close'); model.kill('SIGTERM'); await closed; model = null;
  const fallbackProbe = { question: 'Кто согласует заявку на отпуск?', lang: 'ru' };
  const offline = await request('/api/assistant', cookies.employee, fallbackProbe);
  // Controlled unresponsive runtime: prove the deadline/fallback separately
  // from real-model performance. No fabricated timeout is counted as inference.
  savedRuntime = await readFile(join(AI_DIRECTORY, 'runtime.json'), 'utf8');
  mock = createServer(() => {}); mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
  await writeFile(join(AI_DIRECTORY, 'runtime.json'), JSON.stringify({ model: AI_MODEL.name, port: mock.address().port, key: randomBytes(32).toString('hex') }), { mode: 0o600 });
  const timeout = await request('/api/assistant', cookies.employee, fallbackProbe);
  const summary = { createdAt: new Date().toISOString(), model: await installationStatus(),
    hardware: { cpu: cpus()[0].model, ramBytes: totalmem() }, plan: resourcePlan(), startupMs,
    datasetSha256: createHash('sha256').update(casesText).digest('hex'), productSha256,
    calls: results.length, correct: results.filter(row => row.correct).length,
    byLanguage: Object.fromEntries([...new Set(results.map(row => row.lang))].map(lang => {
      const rows = results.filter(row => row.lang === lang);
      const latency = rows.map(row => row.ms).sort((a, b) => a - b);
      return [lang, { calls: rows.length, correct: rows.filter(row => row.correct).length,
        supported: rows.filter(row => !row.expectedRefusal).length,
        supportedCorrect: rows.filter(row => !row.expectedRefusal && row.correct).length,
        refusals: rows.filter(row => row.expectedRefusal).length,
        refusalsCorrect: rows.filter(row => row.expectedRefusal && row.correct).length,
        p95Ms: latency[Math.ceil(latency.length * .95) - 1] }];
    })),
    maxMs: Math.max(...results.map(row => row.ms)), over5s: results.filter(row => row.ms > 5000).length,
    over10s: results.filter(row => row.ms > 10000).length,
    demoQuoteAnswers: results.filter(row => row.mode === 'demo_quote').length,
    localModelAnswers: results.filter(row => row.mode === 'local_model').length,
    citationsValid: results.every(row => row.citationsValid), accessChecks: links.length,
    accessPassed: links.filter(row => row.passed).length,
    offline: { mode: offline.data.mode, ms: offline.ms, status: offline.status },
    simulatedTimeout: { mode: timeout.data.mode, ms: timeout.ms, status: timeout.status } };
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  await writeFile(join(output, 'sources-access.json'), JSON.stringify(links, null, 2));
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.correct !== summary.calls || !summary.citationsValid || summary.accessPassed !== summary.accessChecks || summary.over10s
    || offline.data.mode !== 'knowledge_search' || timeout.data.mode !== 'knowledge_search' || timeout.ms > 10000 || timeout.ms < 7900) process.exitCode = 1;
} finally {
  if (savedRuntime) await writeFile(join(AI_DIRECTORY, 'runtime.json'), savedRuntime, { mode: 0o600 });
  if (mock) { mock.closeAllConnections(); await new Promise(done => mock.close(done)); }
  if (model) { const closed = once(model, 'close'); model.kill('SIGTERM'); await closed; }
  if (app.server.listening) await new Promise(done => app.server.close(done));
  app.close(); await rm(dataDir, { recursive: true, force: true });
}
