#!/usr/bin/env node
import './environment.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_DIRECTORY, MODEL_PATH, installationStatus } from './setup-ai.mjs';
import { getAIStatus } from '../server/assistant.mjs';

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const boundedNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`Expected an integer from ${minimum} to ${maximum}.`);
  return number;
};

export async function startLocalAI() {
  if ((await getAIStatus()).ready) {
    console.log('[AI] The local model is already running.'); return null;
  }
  const installed = await installationStatus();
  if (!installed.modelInstalled || !installed.runtimeInstalled || !installed.verified) {
    console.log('[AI] Local model is not installed and verified. Run npm run ai:setup once.');
    console.log('[AI] The app remains available with clearly labelled knowledge search and sources.');
    return null;
  }
  // Reuse the same random local key across restarts. It is not an external API
  // credential and is never bundled into the frontend.
  let previous = {};
  try { previous = JSON.parse(await readFile(join(AI_DIRECTORY, 'runtime.json'), 'utf8')); } catch { /* first start */ }
  const key = typeof previous.key === 'string' && /^[a-f0-9]{64}$/.test(previous.key) ? previous.key : randomBytes(32).toString('hex');
  const port = boundedNumber(process.env.ASAR_AI_PORT, 8766, 1024, 65535);
  const threads = boundedNumber(process.env.ASAR_AI_THREADS, Math.min(2, availableParallelism()), 1, 8);
  await mkdir(AI_DIRECTORY, { recursive: true, mode: 0o700 });
  await writeFile(join(AI_DIRECTORY, 'runtime.json'), JSON.stringify({ port, key, model: installed.model }, null, 2), { mode: 0o600 });
  console.log(`[AI] Starting local Qwen3.5-0.8B on CPU (${threads} thread(s)), loopback port ${port}.`);
  console.log('[AI] Inference stays on this computer. First loading may take a minute.');
  const child = spawn(installed.serverPath, ['--model', MODEL_PATH, '--alias', 'asar-hr-local', '--host', '127.0.0.1',
    '--port', String(port), '--api-key', key, '--threads', String(threads), '--ctx-size', '2048',
    '--parallel', '1', '--batch-size', '128', '--ubatch-size', '64', '--n-predict', '96',
    '--gpu-layers', '0', '--jinja', '--reasoning', 'off', '--reasoning-budget', '0'], {
      cwd: dirname(installed.serverPath), stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
    });
  let finished = false;
  let startupError = null;
  child.once('error', (error) => { startupError = error; finished = true; });
  child.once('close', () => { finished = true; });
  const stop = () => { if (!finished) child.kill('SIGTERM'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const cleanup = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('exit', stop);
  };
  process.once('exit', stop);
  child.once('close', cleanup);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (finished) {
      cleanup();
      throw startupError || new Error('llama-server exited before the model became ready. Inspect the preceding runtime message.');
    }
    if ((await getAIStatus()).ready) {
      console.log('[AI] Ready. Open Asar HR and ask a question in the assistant.');
      return child;
    }
    await delay(1000);
  }
  stop();
  throw new Error('The local model did not become ready within two minutes. Knowledge search is still available.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startLocalAI(); }
  catch (error) { console.error(`[AI] ${error.message}`); process.exitCode = 1; }
}
