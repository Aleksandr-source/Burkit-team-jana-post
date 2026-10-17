import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEvaluationPack } from '../evaluation/catalog.mjs';
import { createEvaluationApplication } from '../server/evaluation.mjs';
import { createApplication } from '../server/app.mjs';
import { createBusinessStateReader } from '../server/eval-business-state.mjs';

// Explicit separate command only. Never starts/downloads a model, never mounts
// testing routes in the application on port 3000, never opens the public network.
const pack = await loadEvaluationPack();
const runtimeDir = fileURLToPath(new URL('../evaluation/.runtime/', import.meta.url));
const port = Number(process.env.JANAMEN_EVAL_PORT || 8989);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3000, 8766].includes(port)) {
  throw new Error('Choose a separate evaluation port between 1024 and 65535');
}
const tokens = Object.fromEntries(Object.keys(pack.actors).map((key) => [key, randomBytes(32).toString('base64url')]));
// Seed the real application schema in a fresh private temporary directory.
// Its HTTP server never listens; the adapter receives only a read-only hasher.
const dataDir = await mkdtemp(join(tmpdir(), 'janamen-evaluation-'));
let server;
try {
  const product = createApplication({ dataDir, demoPassword: randomBytes(24).toString('base64url'), seed: true });
  product.close();
  const app = createEvaluationApplication({ ...pack, tokens, businessStateReader: createBusinessStateReader(dataDir) });
  server = await app.listen(port);
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  await writeFile(join(runtimeDir, 'tokens.env'), Object.entries(pack.actors)
    .map(([key, actor]) => `export ${actor.token_env}='${tokens[key]}'`).join('\n') + '\n', { mode: 0o600 });
} catch (error) {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
  throw error;
}
console.log(`JanaMen isolated evaluation: http://127.0.0.1:${port}`);
console.log('Tokens: evaluation/.runtime/tokens.env (private; do not commit).');
console.log('No model has been started. One inference request at a time; missing model returns 503.');
console.log('Scope: fixture ACL/retrieval + product evidence selector. Not a product-quality certification.');
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(runtimeDir, 'tokens.env'), { force: true });
    process.exit(0);
  });
};
process.once('SIGINT', stop); process.once('SIGTERM', stop);
