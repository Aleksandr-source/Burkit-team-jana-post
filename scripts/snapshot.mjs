#!/usr/bin/env node
// A private, independent demo copy. Run only after building the interface.
import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_MODEL, RUNTIME_ARCHIVES } from './setup-ai.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: node scripts/snapshot.mjs /new/private/folder');
const destination = resolve(process.argv[2]);
const rel = relative(root, destination);
if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) throw new Error('The copy must be outside the working project.');
if (existsSync(destination)) throw new Error('Destination already exists. Choose a new folder; nothing was overwritten.');
for (const required of ['dist/index.html', '.data/asar.sqlite', '.data/demo-accounts.txt', '.runtime/windows-x64/node.exe']) {
  if (!existsSync(join(root, required))) throw new Error(`Missing demo component: ${required}`);
}
const digest = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
if (await digest(join(root, '.local-ai/models', AI_MODEL.name)) !== AI_MODEL.sha256) throw new Error('Model checksum mismatch.');
const installed = JSON.parse(await readFile(join(root, '.local-ai/installation.json'), 'utf8'));
for (const [platform, config] of Object.entries(RUNTIME_ARCHIVES)) {
  if (installed.runtimeArchives?.[platform] !== config.sha256 || !existsSync(join(root, '.local-ai', config.directory, config.executable))) {
    throw new Error(`The ${platform} runtime must be prepared and verified first.`);
  }
}
await mkdir(destination, { mode: 0o700 });
const excluded = new Set(['.git', '.agents', '.codex', '.aws', 'node_modules', '.data', '.local-ai', '.runtime', 'coverage', 'build', 'playwright-report', 'test-results', 'tsconfig.tsbuildinfo']);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excluded.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || entry.name.endsWith('.log')) continue;
  await cp(join(root, entry.name), join(destination, entry.name), { recursive: true, dereference: true, errorOnExist: true, force: false });
}
await mkdir(join(destination, '.data'), { mode: 0o700 });
const sourceDb = new DatabaseSync(join(root, '.data/asar.sqlite'), { readOnly: true });
try { await backup(sourceDb, join(destination, '.data/asar.sqlite')); } finally { sourceDb.close(); }
for (const item of ['uploads', 'demo-accounts.txt']) {
  if (existsSync(join(root, '.data', item))) await cp(join(root, '.data', item), join(destination, '.data', item), { recursive: true, dereference: true });
}
const copiedDb = new DatabaseSync(join(destination, '.data/asar.sqlite'));
let counts;
try {
  copiedDb.exec("DELETE FROM sessions; UPDATE attachments SET path='uploads/' || id; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
  const integrity = copiedDb.prepare('PRAGMA integrity_check').get();
  if (Object.values(integrity)[0] !== 'ok') throw new Error('Copied SQLite integrity check failed.');
  counts = Object.fromEntries(['people', 'requests', 'courses', 'enrollments', 'attachments'].map((table) => [table, copiedDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  for (const attachment of copiedDb.prepare('SELECT id, size FROM attachments').all()) {
    if ((await stat(join(destination, '.data/uploads', attachment.id))).size !== attachment.size) throw new Error('An attachment is missing from the copy.');
  }
} finally { copiedDb.close(); }
await mkdir(join(destination, '.local-ai'), { mode: 0o700 });
for (const item of ['models', 'runtime-b8936', 'runtime-b8936-win-x64', 'installation.json', 'licenses']) {
  await cp(join(root, '.local-ai', item), join(destination, '.local-ai', item), { recursive: true, dereference: true });
}
await cp(join(root, '.runtime'), join(destination, '.runtime'), { recursive: true, dereference: true });
// Dereference runtime library symlinks so Windows ZIP extraction needs no
// symlink permission, and every file remains independent from the source.
const checksums = {};
async function visit(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await visit(join(directory, entry.name), name);
    else checksums[name] = await digest(join(directory, entry.name));
  }
}
await visit(destination);
await writeFile(join(destination, 'SNAPSHOT.json'), JSON.stringify({
  createdAt: new Date().toISOString(), product: 'JanaMen', purpose: 'Private local demo snapshot',
  platforms: ['Windows 10/11 x64', 'Linux x64 (system Node.js >=24.11)'],
  database: { integrity: 'ok', counts, sessions: 'cleared only in copy' },
  notes: 'Includes fictional demo data and private demo credentials. Keep this copy separate from a public Git repository. Checksums describe the initial state before first launch.',
  checksums,
}, null, 2) + '\n');
console.log(JSON.stringify({ destination, copiedFiles: Object.keys(checksums).length, databaseIntegrity: 'ok', counts }));
