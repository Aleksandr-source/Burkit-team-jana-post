import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceSync, commitAndRefresh } from '../src/hr/workspace-sync.ts';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('a slow workspace response cannot roll an approved request back to pending', async () => {
  const old = deferred(), fresh = deferred(), seen = [];
  let calls = 0;
  const sync = createWorkspaceSync(() => (++calls === 1 ? old : fresh).promise, value => seen.push(value), () => assert.fail('unexpected failure'));
  const first = sync.refresh(); const second = sync.refresh();
  fresh.resolve({ status: 'approved' }); await second;
  old.resolve({ status: 'pending_manager' }); await first;
  assert.deepEqual(seen, [{ status: 'approved' }]);
});

test('logout invalidates in-flight data and stale authentication errors cannot sign out the next account', async () => {
  const previous = deferred(), current = deferred(), seen = [], errors = [];
  let calls = 0;
  const sync = createWorkspaceSync(() => (++calls === 1 ? previous : current).promise, value => seen.push(value), error => errors.push(error));
  const first = sync.refresh(); sync.invalidate(); const next = sync.refresh();
  current.resolve({ user: 'hr' }); await next;
  previous.reject({ status: 401 }); await first;
  assert.deepEqual(seen, [{ user: 'hr' }]); assert.deepEqual(errors, []);
  const pending = deferred();
  const signedOut = createWorkspaceSync(() => pending.promise, value => seen.push(value), () => {});
  const load = signedOut.refresh(); signedOut.invalidate(); pending.resolve({ user: 'employee' }); await load;
  assert.deepEqual(seen, [{ user: 'hr' }]);
});

test('a committed request stays successful when the following workspace refresh fails', async () => {
  const events = []; let writes = 0;
  const result = await commitAndRefresh(async () => { writes++; return { id: 'saved-request' }; }, value => events.push(value.id), async () => { throw Error('offline'); }, () => events.push('saved-but-stale'));
  assert.equal(writes, 1); assert.equal(result.id, 'saved-request');
  assert.deepEqual(events, ['saved-request', 'saved-but-stale']);
});

test('a rejected write is never displayed as saved', async () => {
  const conflict = Error('status changed'); const events = [];
  await assert.rejects(commitAndRefresh(async () => { throw conflict; }, () => events.push('saved'), async () => events.push('refresh'), () => events.push('warning')), error => error === conflict);
  assert.deepEqual(events, []);
});
