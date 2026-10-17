import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Keep shell variables authoritative and load optional local configuration.
const file = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(file)) loadEnvFile(file);
