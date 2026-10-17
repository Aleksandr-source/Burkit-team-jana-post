import { open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

// Exclusive creation also protects two launchers that start before /v1/models
// becomes ready. Keep the native child's PID so a killed wrapper is not a reason
// to start a second copy of a model that is still loading.
export async function acquireAILock(directory, { isAlive = processIsAlive, now = Date.now } = {}) {
  const path = join(directory, 'process.lock.json');
  const guardPath = join(directory, 'process.startup.guard');
  let guard;
  try { guard = await open(guardPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return { acquired: false }; throw error; }
  // Serialize inspection and stale-owner reclamation. Without this short-lived
  // gate, two contenders could inspect one stale token and unlink a replacement
  // lock created between their read and unlink calls. A crashed gate is kept
  // conservatively: the HR app falls back rather than risk a duplicate model.
  try {
    await guard.writeFile(JSON.stringify({ pid: process.pid, createdAt: now() }));
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(path, 'wx', 0o600);
        const record = { pid: process.pid, childPid: null, token, createdAt: now() };
        try { await handle.writeFile(JSON.stringify(record)); }
        finally { await handle.close(); }
        let released = false;
        let pending = Promise.resolve();
        return {
          acquired: true,
          async updateChildPid(pid) {
            pending = pending.then(async () => {
              if (released) return;
              record.childPid = pid;
              await writeFile(path, JSON.stringify(record), { mode: 0o600 });
            });
            await pending;
          },
          async release() {
            if (released) return;
            released = true;
            // A close callback and a startup error may race to clean up. Release
            // once, after an in-flight child PID write, without recreating a lock.
            await pending.catch(() => {});
            try { const current = JSON.parse(await readFile(path, 'utf8')); if (current.token === token) await unlink(path); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          },
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let owner;
        try { owner = JSON.parse(await readFile(path, 'utf8')); }
        catch {
          // Another process may be in the short window between open and write.
          try { if (now() - (await stat(path)).mtimeMs < 30000) return { acquired: false }; }
          catch (statError) { if (statError.code === 'ENOENT') continue; throw statError; }
        }
        if (owner && (isAlive(owner.pid) || isAlive(owner.childPid))) return { acquired: false };
        // Only reclaim the owner inspected above. Other contenders can safely
        // retry on a later launch if the stale file is already being reclaimed.
        try {
          const current = await readFile(path, 'utf8');
          if (owner && JSON.parse(current).token !== owner.token) return { acquired: false };
          await unlink(path);
        } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') return { acquired: false }; }
      }
    }
    return { acquired: false };
  } finally {
    await guard.close();
    await unlink(guardPath);
  }
}
