import test from 'node:test';
import assert from 'node:assert/strict';
import { canReview, waitingSince, workspaceActions } from '../src/hr/workspace-actions.ts';

const manager = { id: 'm', role: 'manager' };
const hr = { id: 'h', role: 'hr' };
const people = [{ id: 'e', managerId: 'm' }, { id: 'other', managerId: 'other-manager' }];
const request = { id: 'r', employeeId: 'e', status: 'pending_manager', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T12:00:00Z', history: [] };

test('work queue offers only the current review stage and never self-approval', () => {
  assert.equal(canReview(request, manager, people), true);
  assert.equal(canReview(request, hr, people), false);
  assert.equal(canReview({ ...request, status: 'pending_hr' }, manager, people), false);
  assert.equal(canReview({ ...request, status: 'pending_hr' }, hr, people), true);
  assert.equal(canReview({ ...request, employeeId: 'h', status: 'pending_hr' }, hr, people), false);
  assert.equal(canReview({ ...request, status: 'approved' }, hr, people), false);
  assert.equal(canReview({ ...request, employeeId: 'other' }, manager, people), false);
});

test('HR waiting age starts at manager approval rather than submission or a later refresh', () => {
  const advanced = { ...request, status: 'pending_hr', updatedAt: '2026-10-10T10:00:00Z', history: [{ action: 'manager_approved', at: '2026-10-05T10:00:00Z' }] };
  assert.equal(waitingSince(advanced), '2026-10-05T10:00:00Z');
  assert.equal(waitingSince(request), request.createdAt);
});

test('queue sorts oldest pending items and learning totals use real enrollments', () => {
  const data = {
    user: hr, people,
    requests: [
      { ...request, id: 'newer', status: 'pending_hr', history: [{ action: 'manager_approved', at: '2026-10-06T10:00:00Z' }] },
      { ...request, id: 'older', status: 'pending_hr', history: [{ action: 'manager_approved', at: '2026-10-05T10:00:00Z' }] },
      { ...request, id: 'done', status: 'approved' },
    ],
    hrInquiries: [
      { id: 'own', authorId: 'h', status: 'open', createdAt: '2026-10-01' },
      { id: 'open', authorId: 'e', status: 'open', createdAt: '2026-10-02' },
      { id: 'closed', authorId: 'e', status: 'answered', createdAt: '2026-10-01' },
    ],
    courses: [{ id: 'c' }, { id: 'unassigned' }],
    enrollments: [{ id: '1', courseId: 'c', userId: 'e', passed: true }, { id: '2', courseId: 'c', userId: 'other', passed: false }, { id: 'own', courseId: 'c', userId: 'h', passed: false }],
  };
  const queue = workspaceActions(data);
  assert.deepEqual(queue.requests.map(item => item.id), ['older', 'newer']);
  assert.deepEqual(queue.inquiries.map(item => item.id), ['open']);
  assert.equal(queue.learning.length, 1);
  assert.equal(queue.learning[0].completed, 1);
  assert.equal(queue.learning[0].enrollments.length, 2);
  assert.deepEqual(workspaceActions({ ...data, user: { id: 'e', role: 'employee' } }), { requests: [], inquiries: [], learning: [] });
  assert.deepEqual(workspaceActions({ ...data, user: manager }).inquiries, []);
});
