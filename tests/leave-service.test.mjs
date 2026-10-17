import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, personById, publicPerson, requestById } from '../server/store.mjs';
import { createLeaveService } from '../server/leave-service.mjs';

test('attachment metadata cannot bypass author permissions through a direct service call', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-attachment-service-'));
  const store = openStore(dir, { demoPassword: 'Service-test-only-2468!' });
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  const leave = createLeaveService(store);
  const employee = personById(store.db, 'employee'), manager = personById(store.db, 'manager');
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 45);
  const date = future.toISOString().slice(0, 10);
  const { request } = leave.submit(employee, { startDate: date, endDate: date });
  assert.throws(() => leave.recordAttachment(manager, request.id, { id: 'forbidden-file', name: 'file.txt', size: 1 }), { status: 403, code: 'forbidden' });
  assert.deepEqual(leave.get(employee, request.id), request);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM attachments').get().n, 0);
});

test('final approval rolls back status, balance, history and document if a notification cannot be stored', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'janamen-leave-service-'));
  const store = openStore(dir, { demoPassword: 'Service-test-only-2468!' });
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  const { db } = store;
  const leave = createLeaveService(store);
  const employee = personById(db, 'employee'), manager = personById(db, 'manager'), hr = personById(db, 'hr');
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 45);
  const date = future.toISOString().slice(0, 10);
  const { request } = leave.submit(employee, { startDate: date, endDate: date });
  leave.decide(manager, request.id, { action: 'approve', expectedStatus: 'pending_manager' });
  const before = requestById(db, request.id);
  const notices = db.prepare('SELECT count(*) AS n FROM notifications').get().n;
  db.exec("CREATE TRIGGER reject_final_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'simulated storage error'); END");
  assert.throws(() => leave.decide(hr, request.id, { action: 'approve', expectedStatus: 'pending_hr' }), /simulated storage error/);
  assert.deepEqual(requestById(db, request.id), before);
  assert.equal(publicPerson(db, personById(db, 'employee')).leaveBalance, 24);
  assert.equal(publicPerson(db, personById(db, 'employee')).leaveReserved, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM notifications').get().n, notices);
  assert.equal(db.prepare('SELECT requestId FROM request_documents WHERE requestId=?').get(request.id), undefined);
});
