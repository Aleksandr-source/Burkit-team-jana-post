import test from 'node:test';
import assert from 'node:assert/strict';
import { readQuizDraft, quizDraftKey } from '../src/hr/learning.ts';

const course = { id: 'onboarding', updatedAt: 'v1', quiz: [{ options: ['a', 'b'] }, { options: ['a', 'b', 'c'] }] };
test('quiz drafts isolate accounts and material revisions', () => {
  assert.notEqual(quizDraftKey('employee', course), quizDraftKey('hr', course));
  assert.notEqual(quizDraftKey('employee', course), quizDraftKey('employee', { ...course, updatedAt: 'v2' }));
});
test('partial quiz drafts retain valid choices without turning gaps into answers', () => {
  const partial = readQuizDraft('[null,2]', course);
  assert.equal(partial[0], undefined); assert.equal(partial[1], 2);
  assert.deepEqual(readQuizDraft('[1,0]', course), [1, 0]);
  assert.deepEqual(readQuizDraft('["1",99]', course), []);
  assert.deepEqual(readQuizDraft('broken', course), []);
  assert.deepEqual(readQuizDraft('{"0":1}', course), []);
});
