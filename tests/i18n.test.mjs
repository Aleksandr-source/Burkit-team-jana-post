import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatToday } from '../src/hr/i18n.ts';

test('Kazakh dates use calendar names and Kazakhstan time without relying on Kazakh ICU data', () => {
  assert.equal(formatToday('kk', new Date('2026-10-17T20:30:00Z')), 'жексенбі, 18 қазан');
  assert.equal(formatDate('2026-10-17T20:30:00Z', 'kk', true), '18 қаз. 2026 ж., 01:30');
  assert.equal(formatDate('2026-11-09', 'kk'), '9 қар. 2026 ж.');
});

test('calendar-only dates keep their day and malformed dates have a readable placeholder', () => {
  assert.match(formatDate('2026-11-09', 'en'), /9 Nov 2026/);
  assert.match(formatDate('2026-11-09', 'ru'), /9 нояб/);
  assert.equal(formatDate('invalid', 'kk'), '—');
  assert.equal(formatDate('', 'ru'), '—');
});
