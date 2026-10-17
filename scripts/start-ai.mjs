#!/usr/bin/env node
import './environment.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_DIRECTORY, MODEL_PATH, installationStatus } from './setup-ai.mjs';
import { getAIStatus } from '../server/assistant.mjs';
import { acquireAILock } from './ai-process-lock.mjs';
import { memoryPressure, resourceMessage, resourcePlan } from './resources.mjs';

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const boundedNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`Expected an integer from ${minimum} to ${maximum}.`);
  return number;
};

export async function startLocalAI() {
  const plan = resourcePlan();
  if (plan.disabled) { console.log(resourceMessage(plan)); return null; }
  if ((await getAIStatus()).ready) {
    console.log('[AI] Локальная модель уже работает. Вторая копия не запускается.'); return null;
  }
  if (!plan.aiAllowed) { console.log(resourceMessage(plan)); return null; }
  const installed = await installationStatus();
  if (!installed.modelInstalled || !installed.runtimeInstalled || !installed.verified) {
    console.log('[AI] Local model is not installed and verified. Run npm run ai:setup once.');
    console.log('[AI] The app remains available with clearly labelled knowledge search and sources.');
    return null;
  }
  await mkdir(AI_DIRECTORY, { recursive: true, mode: 0o700 });
  const lock = await acquireAILock(AI_DIRECTORY);
  if (!lock.acquired) {
    console.log('[AI] Другой процесс уже запускает локальную модель. Вторая копия не запускается.');
    return null;
  }
  let child = null;
  let stopChild = () => {};
  try {
    // Reuse the same random local key across restarts. It is not an external API
    // credential and is never bundled into the frontend.
    let previous = {};
    try { previous = JSON.parse(await readFile(join(AI_DIRECTORY, 'runtime.json'), 'utf8')); } catch { /* first start */ }
    const key = typeof previous.key === 'string' && /^[a-f0-9]{64}$/.test(previous.key) ? previous.key : randomBytes(32).toString('hex');
    const port = boundedNumber(process.env.ASAR_AI_PORT, 8766, 1024, 65535);
    const threads = plan.threads;
    await writeFile(join(AI_DIRECTORY, 'runtime.json'), JSON.stringify({ port, key, model: installed.model }, null, 2), { mode: 0o600 });
    console.log(`[AI] Starting local Qwen3.5-0.8B on CPU (${threads} thread(s)), loopback port ${port}.`);
    console.log(resourceMessage(plan));
    console.log('[AI] Обработка остаётся на этом компьютере. При нехватке памяти модель будет остановлена.');
    child = spawn(installed.serverPath, ['--model', MODEL_PATH, '--alias', 'asar-hr-local', '--host', '127.0.0.1',
      '--port', String(port), '--api-key', key, '--threads', String(threads), '--threads-batch', String(threads), '--ctx-size', String(plan.context),
      '--parallel', '1', '--batch-size', String(plan.batch), '--ubatch-size', String(plan.microBatch), '--n-predict', String(plan.predictions),
      '--gpu-layers', '0', '--jinja', '--reasoning', 'off', '--reasoning-budget', '0'], {
        cwd: dirname(installed.serverPath), stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
      });
    let finished = false;
    let startupError = null;
    child.once('error', (error) => { startupError = error; finished = true; });
    child.once('close', () => { finished = true; });
    let killTimer;
    const stop = () => {
      if (finished) return;
      child.kill('SIGTERM');
      if (!killTimer) {
        killTimer = setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 2000);
        killTimer.unref();
      }
    };
    stopChild = stop;
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const cleanup = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      process.off('exit', stop);
      clearInterval(memoryGuard);
      clearTimeout(killTimer);
      void lock.release().catch((error) => console.error(`[AI] Не удалось освободить блокировку: ${error.message}`));
    };
    const memoryGuard = setInterval(() => {
      if (!finished && memoryPressure(plan)) {
        console.log('[AI] Мало системной памяти или исчерпан лимит процесса. Модель остановлена; поиск по базе знаний остаётся доступен.');
        stop();
      }
    }, 5000);
    memoryGuard.unref();
    process.once('exit', stop);
    child.once('close', cleanup);
    if (child.pid) await lock.updateChildPid(child.pid);
    const deadline = Date.now() + plan.startupMs;
    while (Date.now() < deadline) {
      if (finished) {
        cleanup();
        throw startupError || new Error('llama-server exited before the model became ready. Inspect the preceding runtime message.');
      }
      if ((await getAIStatus()).ready) {
        console.log('[AI] Готово. Откройте JanaMen и задайте вопрос ассистенту.');
        return child;
      }
      await delay(1000);
    }
    stop();
    throw new Error(`Модель не стала доступна за ${plan.startupMs / 1000} секунд. Поиск по базе знаний остаётся доступен.`);
  } catch (error) {
    // Keep ownership until the native process is actually closed.
    if (child) stopChild();
    else await lock.release();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startLocalAI(); }
  catch (error) { console.error(`[AI] ${error.message}`); process.exitCode = 1; }
}
