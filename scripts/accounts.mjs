import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const file=resolve(process.env.ASAR_DATA_DIR||'.data','demo-accounts.txt');
try{process.stdout.write(readFileSync(file,'utf8'));}catch{console.error('Сначала запустите npm run dev или npm start: демоаккаунты создаются при первом запуске.');process.exitCode=1;}
