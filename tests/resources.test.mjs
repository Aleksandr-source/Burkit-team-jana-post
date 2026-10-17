import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireAILock } from '../scripts/ai-process-lock.mjs';
import { memoryPressure, memorySnapshot, resourcePlan } from '../scripts/resources.mjs';

const GiB = 1024 ** 3;
const memory = (total, available) => ({ totalBytes: total * GiB, availableBytes: available * GiB });

test('8 GiB demonstration laptop defaults to one CPU thread and small buffers', () => {
  const plan = resourcePlan({ env: {}, memory: memory(8, 3), cpuCount: 4 });
  assert.equal(plan.profile, 'low');
  assert.equal(plan.aiAllowed, true);
  assert.equal(plan.threads, 1);
  assert.equal(plan.context, 1024);
  assert.equal(plan.batch, 64);
  assert.equal(plan.microBatch, 32);
  assert.equal(plan.startupMs, 60000);
  assert.equal(plan.nodeHeapMiB, 256);
});

test('insufficient headroom disables new model admission while preserving HR settings', () => {
  const plan = resourcePlan({ env: {}, memory: memory(8, 1.5), cpuCount: 4 });
  assert.equal(plan.aiAllowed, false);
  assert.equal(plan.reason, 'memory');
  assert.equal(plan.nodeHeapMiB, 256);
  assert.equal(plan.minimumAvailableBytes, 2 * GiB);
});

test('both legacy disable names and explicit off profile disable the model', () => {
  for (const env of [{ ASAR_AI_DISABLED: '1' }, { ASAR_DISABLE_AI: '1' }, { JANAMEN_RESOURCE_PROFILE: 'off' }]) {
    const plan = resourcePlan({ env, memory: memory(16, 12), cpuCount: 8 });
    assert.equal(plan.disabled, true);
    assert.equal(plan.aiAllowed, false);
  }
});

test('standard override still respects available memory and validates manual values', () => {
  const plan = resourcePlan({ env: { JANAMEN_RESOURCE_PROFILE: 'standard' }, memory: memory(8, 1), cpuCount: 1 });
  assert.equal(plan.profile, 'standard');
  assert.equal(plan.threads, 1);
  assert.equal(plan.aiAllowed, false);
  assert.throws(() => resourcePlan({ env: { ASAR_AI_THREADS: '0' }, memory: memory(8, 3) }), /ASAR_AI_THREADS/);
  assert.throws(() => resourcePlan({ env: { JANAMEN_RESOURCE_PROFILE: 'fastest' }, memory: memory(8, 3) }), /RESOURCE_PROFILE/);
});

test('Linux uses reclaimable MemAvailable and respects finite cgroup headroom', () => {
  const files = new Map([
    ['/proc/meminfo', 'MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n'],
    ['/sys/fs/cgroup/memory.max', String(2 * GiB)],
    ['/sys/fs/cgroup/memory.current', String(1.5 * GiB)],
  ]);
  const snapshot = memorySnapshot({ platform: 'linux', total: 8 * GiB, available: 0.25 * GiB,
    read: (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path); } });
  assert.equal(snapshot.totalBytes, 2 * GiB);
  assert.equal(snapshot.availableBytes, 0.5 * GiB);
  assert.equal(snapshot.hostAvailableBytes, 4 * GiB);
  assert.equal(snapshot.cgroupAvailableBytes, 0.5 * GiB);
});

test('Windows and unavailable /proc use lightweight OS memory totals', () => {
  const read = () => { throw new Error('no proc'); };
  for (const platform of ['win32', 'linux']) {
    const snapshot = memorySnapshot({ platform, total: 8 * GiB, available: 3 * GiB, read });
    assert.equal(snapshot.totalBytes, 8 * GiB);
    assert.equal(snapshot.availableBytes, 3 * GiB);
    assert.equal(snapshot.cgroupAvailableBytes, null);
  }
});

test('a 900 MiB systemd unit can load a small model without a false 2 GiB admission or 768 MiB watchdog failure', () => {
  const MiB = 1024 ** 2;
  const files = new Map([
    ['/proc/meminfo', 'MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n'],
    ['/proc/self/cgroup', '0::/user.slice/ai.service\n'],
    ['/sys/fs/cgroup/user.slice/ai.service/memory.max', String(900 * MiB)],
    ['/sys/fs/cgroup/user.slice/ai.service/memory.current', String(30 * MiB)],
  ]);
  const read = (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path); };
  const before = memorySnapshot({ platform: 'linux', total: 8 * GiB, available: 3 * GiB, read });
  const plan = resourcePlan({ env: {}, memory: before, cpuCount: 4 });
  assert.equal(plan.profile, 'low');
  assert.equal(plan.aiAllowed, true);
  files.set('/sys/fs/cgroup/user.slice/ai.service/memory.current', String(700 * MiB));
  const loaded = memorySnapshot({ platform: 'linux', total: 8 * GiB, available: 3 * GiB, read });
  assert.equal(memoryPressure(plan, loaded), false);
  files.set('/sys/fs/cgroup/user.slice/ai.service/memory.current', String(850 * MiB));
  assert.equal(memoryPressure(plan, memorySnapshot({ platform: 'linux', total: 8 * GiB, available: 3 * GiB, read })), true);
});

test('system-wide pressure and an insufficient shared parent-unit budget are detected independently', () => {
  const MiB = 1024 ** 2;
  const files = new Map([
    ['/proc/self/cgroup', '0::/user.slice/ai.service\n'],
    ['/sys/fs/cgroup/user.slice/ai.service/memory.max', String(900 * MiB)],
    ['/sys/fs/cgroup/user.slice/ai.service/memory.current', String(30 * MiB)],
    ['/sys/fs/cgroup/user.slice/memory.max', String(2 * GiB)],
    ['/sys/fs/cgroup/user.slice/memory.current', String(1.5 * GiB)],
  ]);
  const read = (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path); };
  const snapshot = memorySnapshot({ platform: 'linux', total: 8 * GiB, available: 3 * GiB, read });
  const plan = resourcePlan({ env: {}, memory: snapshot, cpuCount: 4 });
  assert.equal(plan.aiAllowed, false);
  assert.equal(plan.reason, 'cgroup');
  assert.equal(memoryPressure(plan, { ...snapshot, hostAvailableBytes: 512 * MiB }), true);
});

test('exclusive startup lock rejects simultaneous model loading and releases cleanly', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-ai-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await acquireAILock(directory);
  assert.equal(first.acquired, true);
  await first.updateChildPid(process.pid);
  assert.equal((await acquireAILock(directory)).acquired, false);
  await first.release();
  const next = await acquireAILock(directory);
  assert.equal(next.acquired, true);
  await next.release();
});

test('a live native child keeps ownership after the wrapper dies; dead stale owner is reclaimed', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-ai-stale-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'process.lock.json');
  await writeFile(path, JSON.stringify({ pid: 12345, childPid: 56789, token: 'old' }));
  assert.equal((await acquireAILock(directory, { isAlive: (pid) => pid === 56789 })).acquired, false);
  const lock = await acquireAILock(directory, { isAlive: () => false });
  assert.equal(lock.acquired, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid);
  await lock.release();
});

test('a new incomplete lock is treated as another startup, never deleted', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-ai-writing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'process.lock.json'), '');
  assert.equal((await acquireAILock(directory)).acquired, false);
});

test('parallel stale-owner reclaim has one winner and duplicate cleanup never deletes the next owner', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-ai-reclaim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'process.lock.json'), JSON.stringify({ pid: 12345, token: 'old' }));
  const locks = await Promise.all(Array.from({ length: 8 }, () => acquireAILock(directory, { isAlive: (pid) => pid === process.pid })));
  const winners = locks.filter((lock) => lock.acquired);
  assert.equal(winners.length, 1);
  await Promise.all([winners[0].release(), winners[0].release()]);
  const next = await acquireAILock(directory);
  assert.equal(next.acquired, true);
  await winners[0].release();
  assert.equal((await acquireAILock(directory)).acquired, false);
  await next.release();
});

test('a leftover startup gate fails closed instead of risking two native models', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'janamen-ai-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'process.startup.guard'), JSON.stringify({ pid: 12345 }));
  assert.equal((await acquireAILock(directory)).acquired, false);
});
