import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistant } from '../server/assistant.mjs';
import { knowledge } from '../server/knowledge.mjs';

const cases = JSON.parse(await readFile(new URL('../evaluation/product-challenge/cases.json', import.meta.url), 'utf8'));
// This set became regression data after its first measured run. The stub
// isolates coverage/rendering and says nothing about neural model accuracy.
const assistant = createAssistant({ modelProvider: {
  status: async () => ({ ready: false }), select: async () => { throw Error('offline'); },
} });
test('a possessive pronoun does not replace a reservation policy answer with account counters', async () => {
  const answer = await assistant.answerQuestion({ question: 'Когда списываются мои дни из остатка отпуска?', lang: 'ru',
    user: { id: 'employee', role: 'employee', leaveBalance: 24, leaveReserved: 5 } });
  assert.equal(answer.sources[0].id, 'leave-balance');
  assert.match(answer.answer, /после подтверждения HR/);
  assert.doesNotMatch(answer.answer, /19/);
});
for (const item of cases) test(`product paraphrase ${item.id}`, async () => {
  assert.ok(item.refusal || knowledge.some(doc => doc.id === item.source
    && item.facts.every(fact => doc.content[item.lang].toLowerCase().includes(fact.toLowerCase()))), 'fixture facts exist in original KB');
  const answer = await assistant.answerQuestion({ question: item.question, lang: item.lang,
    user: { id: 'employee', role: item.role || 'employee', leaveBalance: 24, leaveReserved: 5 } });
  if (item.refusal) {
    assert.equal(answer.mode, 'refusal'); assert.deepEqual(answer.sources, []);
  } else {
    assert.notEqual(answer.mode, 'refusal', item.question);
    assert.ok(answer.sources.some(doc => doc.id === item.source));
    for (const fact of item.facts) assert.ok(answer.answer.toLowerCase().includes(fact.toLowerCase()), fact);
  }
});
