import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKnowledgeSource } from '../server/knowledge-page.mjs';

test('source HTML treats knowledge text and metadata as text, not markup', () => {
  const page = renderKnowledgeSource({ title: '<script>alert(1)</script>', excerpt: '<img src=x onerror=alert(1)>',
    origin: 'A & B', version: '"demo"', id: 'test', sha256: 'abc' }, 'ru');
  assert.ok(!page.includes('<script>'));
  assert.ok(!page.includes('<img'));
  assert.ok(page.includes('&lt;script&gt;'));
  assert.ok(page.includes('A &amp; B'));
});
