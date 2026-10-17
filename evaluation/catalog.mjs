import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

export const PACK_DIRECTORY = fileURLToPath(new URL('./vendor/janamen-eval-v1.0/', import.meta.url));
export const ZIP_SHA256 = '656360a7c45a97fc115c491e768d53d8bd67e5f75c75bdd83e31ce460d2de782';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const roles = new Set(['employee', 'manager', 'hr']);
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const invariant = (value, message) => { if (!value) throw new Error(`Invalid evaluation pack: ${message}`); };

async function jsonl(path) {
  return (await readFile(path, 'utf8')).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

// This runtime never parses cases.jsonl, CASEBOOK or evaluator expectations.
// Their opaque bytes are hashed only to verify the original pack manifest.
// All imported material stays in a separate test namespace, outside product KB.
export async function loadEvaluationPack(directory = PACK_DIRECTORY) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  invariant(manifest.version === '1.0.0' && manifest.model_quality === 'NOT_EVALUATED', 'manifest');
  for (const [name, expected] of Object.entries(manifest.sha256)) {
    const path = resolve(root, name);
    invariant(path.startsWith(`${root}${sep}`) && /^[a-f0-9]{64}$/.test(expected), 'manifest path/hash');
    invariant(hash(await readFile(path)) === expected, `file hash: ${name}`);
  }
  const documents = await jsonl(join(root, 'data/knowledge.jsonl'));
  const snapshotRows = await jsonl(join(root, 'data/service-snapshots.jsonl'));
  const actors = JSON.parse(await readFile(join(root, 'configs/actors.json'), 'utf8'));
  invariant(documents.length > 0 && documents.length < 2000 && snapshotRows.length > 0, 'empty or oversized namespace');
  const catalog = new Map();
  for (const document of documents) {
    invariant(typeof document.knowledge_id === 'string' && !catalog.has(document.knowledge_id), 'duplicate/missing knowledge ID');
    invariant(typeof document.text === 'string' && hash(document.text) === document.sha256, 'knowledge text hash');
    invariant(document.scope === 'test_only' && document.is_fictional === true, 'non-fixture material');
    invariant(['ru', 'kk'].includes(document.language) && Array.isArray(document.roles)
      && document.roles.every((role) => roles.has(role)), 'language/roles');
    invariant((document.effective_from === null || validDate(document.effective_from))
      && (document.effective_to === null || validDate(document.effective_to)), 'effective dates');
    catalog.set(document.knowledge_id, Object.freeze({ ...document, roles: Object.freeze([...document.roles]) }));
  }
  const snapshots = new Map();
  for (const row of snapshotRows) {
    invariant(Object.keys(row).sort().join(',') === 'as_of_date,candidate_pool_ids,case_id', 'snapshot contains evaluator-only fields');
    invariant(typeof row.case_id === 'string' && !snapshots.has(row.case_id) && validDate(row.as_of_date), 'snapshot ID/date');
    invariant(Array.isArray(row.candidate_pool_ids) && row.candidate_pool_ids.every((id) => catalog.has(id)), 'snapshot pool');
    snapshots.set(row.case_id, Object.freeze({ ...row, candidate_pool_ids: Object.freeze([...row.candidate_pool_ids]) }));
  }
  for (const actor of Object.values(actors)) invariant(roles.has(actor.role)
    && typeof actor.organization === 'string' && typeof actor.token_env === 'string', 'actor');
  return { catalog, snapshots, actors, manifest };
}

export function eligibleFixture(document, actor, asOfDate) {
  return Boolean(document && actor && validDate(asOfDate) && document.approved === true
    && document.scope === 'test_only' && document.is_fictional === true
    && document.organization === actor.organization && document.roles.includes(actor.role)
    && (document.team === null || document.team === actor.team || actor.role === 'hr')
    && (document.effective_from === null || document.effective_from <= asOfDate)
    && (document.effective_to === null || asOfDate < document.effective_to));
}

const normalized = (text) => text.toLowerCase().normalize('NFKC').replace(/ё/g, 'е');
const stopwords = new Set(['как', 'что', 'это', 'мне', 'мой', 'мои', 'для', 'уже', 'или', 'the', 'and', 'how', 'мен', 'үшін', 'бұл', 'қалай']);
export function retrieveFixtures(question, documents, language, topK = 3) {
  const tokens = [...new Set((normalized(question).match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter((word) => !stopwords.has(word)).map((word) => word.slice(0, 5)))];
  return documents.map((document) => {
    const title = normalized(document.title), content = normalized(document.text);
    const score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 3 : 0) + (content.includes(token) ? 1 : 0), 0);
    return { document, score: score ? score + (document.language === language ? 0.1 : 0) : 0 };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score
    || a.document.knowledge_id.localeCompare(b.document.knowledge_id)).slice(0, topK).map(({ document }) => document);
}
