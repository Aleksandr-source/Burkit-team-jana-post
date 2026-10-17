import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { eligibleFixture, retrieveFixtures } from '../evaluation/catalog.mjs';
import { selectEvidence } from './assistant.mjs';

const semantics = 'evidence_selection_extract';
const unknown = (language) => language === 'kk'
  ? 'Қолжетімді дереккөздерде расталған жауап жоқ. HR маманына жүгініңіз.'
  : 'В доступных источниках нет подтверждённого ответа. Обратитесь в HR.';
const httpError = (status, code) => Object.assign(new Error(code), { status, code });
const sameToken = (left, right) => typeof left === 'string' && typeof right === 'string'
  && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));

async function readJSON(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw httpError(415, 'json_required');
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw httpError(413, 'body_too_large');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw httpError(400, 'invalid_json'); }
}

function validateQuestion(body) {
  if (typeof body.question !== 'string' || body.question.trim().length < 3 || body.question.length > 1200
    || !['ru', 'kk'].includes(body.response_language)) throw httpError(400, 'invalid_question_or_language');
}

function source(document) {
  return { knowledge_id: document.knowledge_id, title: document.title, version: document.version,
    url: `/v1/knowledge/${encodeURIComponent(document.knowledge_id)}` };
}

function sentences(documents) {
  return documents.flatMap((document) => (document.text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [])
    .map((text) => ({ text: text.trim(), document: { id: document.knowledge_id } })).filter(({ text }) => text))
    .slice(0, 8).map((sentence, index) => ({ ...sentence, number: index + 1 }));
}

// The factory is intentionally never imported or mounted by the production app.
// It has fixture-only roles and no HR actions. HTTP tokens and snapshot headers
// grant access only within this standalone test process.
export function createEvaluationApplication({ catalog, snapshots, actors, tokens, selector = selectEvidence,
  businessStateReader = null, today = () => new Date().toISOString().slice(0, 10) }) {
  if (!(catalog instanceof Map) || !catalog.size || !(snapshots instanceof Map) || !snapshots.size) {
    throw new Error('Evaluation fixtures must be loaded before startup');
  }
  const credentials = Object.entries(actors).map(([key, actor]) => ({
    actor: Object.freeze({ ...actor, key }), token: tokens[key],
  }));
  if (credentials.some(({ token }) => typeof token !== 'string' || token.length < 24)
    || new Set(credentials.map(({ token }) => token)).size !== credentials.length) throw new Error('Unique evaluation tokens are required');
  let busy = false;

  async function infer(question, language, documents, retrievedIds, retrievalMs) {
    if (!documents.length) return {
      decision: 'insufficient_context', answer: unknown(language), evidence_ids: [],
      // Empty output, not synthesized model JSON. This deliberately cannot
      // pass the pack's generative raw-schema gate without a model call.
      raw_model_output: '',
      evaluation_trace: { retrieved_ids: retrievedIds, model_context_ids: [], model_called: false },
      telemetry: { retrieval_ms: retrievalMs }, adapter_semantics: semantics,
    };
    if (busy) throw httpError(429, 'one_evaluation_request_at_a_time');
    busy = true;
    let result;
    try { result = await selector(question, sentences(documents)); }
    finally { busy = false; }
    // No knowledge-search fallback here: a missing model or invalid raw output
    // is an evaluation error, even though product UX has a labelled fallback.
    if (!result || result.selected === null || result.error) {
      const error = httpError(result?.error === 'model_busy' ? 429 : result?.error === 'invalid_model_output' ? 502 : 503,
        result?.error || 'model_unavailable');
      error.raw_model_output = result?.raw_model_output ?? null;
      throw error;
    }
    const index = new Map(documents.map((document) => [document.knowledge_id, document]));
    if (!Array.isArray(result.selected) || result.selected.some(({ text, document }) =>
      !index.has(document?.id) || typeof text !== 'string' || !index.get(document.id).text.includes(text))) {
      throw httpError(502, 'selector_evidence_outside_context');
    }
    const evidenceIds = [...new Set(result.selected.map(({ document }) => document.id))];
    return {
      decision: evidenceIds.length ? 'answer' : 'insufficient_context',
      answer: evidenceIds.length ? result.selected.map(({ text }) => text).join(' ') : unknown(language),
      evidence_ids: evidenceIds,
      raw_model_output: result.raw_model_output ?? null,
      evaluation_trace: { retrieved_ids: retrievedIds, model_context_ids: result.model_context_ids ?? [], model_called: true,
        evidence_serialization: 'product: first 8 sentences; at most two 35-character previews' },
      telemetry: { retrieval_ms: retrievalMs, generation_ms: result.generation_ms ?? null,
        model_request_ms: result.model_request_ms ?? null,
        input_tokens: result.input_tokens ?? null, output_tokens: result.output_tokens ?? null },
      adapter_semantics: semantics,
    };
  }

  async function handler(request, response) {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      response.end(JSON.stringify(body));
    };
    try {
      // Require both a loopback listener and a loopback peer. No remote flags.
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) throw httpError(403, 'loopback_only');
      if (request.headers.origin) throw httpError(403, 'browser_origins_not_allowed');
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      if (request.method === 'GET' && path === '/health') return send(200, { ok: true,
        namespace: 'isolated_fictional_evaluation', adapter_semantics: semantics, concurrency: 1,
        product_quality: 'NOT_EVALUATED', knowledge_fragments: catalog.size, snapshots: snapshots.size });
      const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      const actor = credentials.find(({ token }) => sameToken(bearer, token))?.actor;
      if (!actor) throw httpError(401, 'authentication_required');
      const caseId = request.headers['x-janamen-eval-case'];
      const snapshot = caseId === undefined ? null : snapshots.get(caseId);
      if (caseId !== undefined && !snapshot) throw httpError(400, 'unknown_evaluation_snapshot');
      const asOfDate = snapshot?.as_of_date || today();
      if (request.method === 'GET' && path.startsWith('/v1/knowledge/')) {
        const document = catalog.get(decodeURIComponent(path.slice('/v1/knowledge/'.length)));
        if (!eligibleFixture(document, actor, asOfDate)) throw httpError(404, 'not_found');
        return send(200, { ...source(document), text: document.text, language: document.language,
          fictional: true, source_kind: document.source_kind, sha256: document.sha256 });
      }
      if (request.method === 'GET' && /^\/__eval__\/business-state\/(leave|advance)$/.test(path)) {
        const kind = path.split('/').at(-1);
        const state = businessStateReader ? await businessStateReader({ actor, kind }) : null;
        if (!state) throw httpError(501, 'business_state_not_connected');
        if (!/^[a-f0-9]{64}$/.test(state.state_sha256)) throw httpError(500, 'invalid_business_state_digest');
        return send(200, { state_sha256: state.state_sha256 });
      }
      if (request.method !== 'POST' || !['/__eval__/oracle', '/v1/assistant/answer'].includes(path)) throw httpError(404, 'not_found');
      const body = await readJSON(request); validateQuestion(body);
      const started = performance.now();
      if (path === '/__eval__/oracle') {
        if (!Array.isArray(body.evidence) || body.evidence.length > 64) throw httpError(400, 'invalid_evidence');
        const documents = body.evidence.map((entry) => {
          if (!entry || !/^[A-Za-z0-9._-]{1,100}$/.test(entry.evidence_id)
            || typeof entry.text !== 'string' || entry.text.length > 65536
            || !['ru', 'kk'].includes(entry.language)) throw httpError(400, 'invalid_evidence');
          return { knowledge_id: entry.evidence_id, text: entry.text, source_kind: entry.source_kind,
            language: entry.language, version: entry.version };
        });
        if (new Set(documents.map(({ knowledge_id }) => knowledge_id)).size !== documents.length) throw httpError(400, 'duplicate_evidence_id');
        return send(200, await infer(body.question, body.response_language, documents, documents.map(({ knowledge_id }) => knowledge_id), 0));
      }
      // Snapshot selection never changes the actor. Forged role/team/org fields
      // in request bodies are ignored; filtering precedes retrieval and model.
      const pool = snapshot ? snapshot.candidate_pool_ids.map((id) => catalog.get(id)) : [...catalog.values()];
      const allowed = pool.filter((document) => eligibleFixture(document, actor, asOfDate));
      const retrieved = retrieveFixtures(body.question, allowed, body.response_language);
      const result = await infer(body.question, body.response_language, retrieved,
        retrieved.map(({ knowledge_id }) => knowledge_id), performance.now() - started);
      const permitted = new Set(result.evidence_ids);
      return send(200, { ...result, status: result.decision === 'answer' ? 'answered' : result.decision,
        sources: retrieved.filter(({ knowledge_id }) => permitted.has(knowledge_id)).map(source),
        integration_scope: 'isolated_fixture_acl_retrieval_and_product_selector' });
    } catch (error) {
      return send(error.status || 500, { error: error.code || 'evaluation_internal_error',
        ...(error.raw_model_output !== undefined ? { raw_model_output: error.raw_model_output } : {}) });
    }
  }

  return {
    handler,
    async listen(port = 8989) {
      const server = createServer(handler);
      server.requestTimeout = 65000; server.headersTimeout = 10000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      return server;
    },
  };
}
