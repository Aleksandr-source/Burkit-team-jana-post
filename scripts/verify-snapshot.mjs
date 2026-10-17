import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const snapshot = JSON.parse(await readFile(join(directory, 'SNAPSHOT.json'), 'utf8'));
let verified = 0;
for (const [file, expected] of Object.entries(snapshot.checksums)) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, file))) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error(`File differs from the original snapshot: ${file}`);
  verified += 1;
}
console.log(`Verified ${verified} files. Checksums match the saved snapshot.`);
