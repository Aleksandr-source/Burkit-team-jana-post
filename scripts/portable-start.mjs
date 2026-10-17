#!/usr/bin/env node
// Portable production launch: only Node built-ins, no npm/node_modules required.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 11)) {
  console.error(`JanaMen: нужен Node.js 24.11 или новее. Сейчас установлен ${process.versions.node}.`);
  console.error('На Windows используйте Node.js из папки .runtime/windows-x64 или установите подходящую версию.');
  process.exitCode = 1;
} else if (!existsSync(join(projectRoot, 'dist', 'index.html'))) {
  console.error('JanaMen: отсутствует готовая сборка dist/index.html.');
  console.error('Перенесите папку проекта целиком, включая dist. Для разработки: npm ci, затем npm run build.');
  process.exitCode = 1;
} else {
  process.chdir(projectRoot);
  console.log('JanaMen · локальная демонстрация');
  console.log('После запуска откройте адрес сервера в браузере: обычно http://localhost:3000');
  console.log('Оставьте это окно открытым. Для остановки нажмите Ctrl+C.');
  console.log('Запуск не скачивает файлы и не пересобирает проект. ИИ запускается только при достаточном запасе памяти.');
  // Keep the production launcher as the top-level process so that its shutdown
  // handler can terminate the complete AI process tree on Windows.
  process.argv.push('--production');
  await import('./launch.mjs');
}
