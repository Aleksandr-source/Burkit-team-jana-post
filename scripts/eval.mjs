import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The safe default only validates fixture integrity. Running inference requires
// using the explicitly documented benchmark command; this wrapper never does.
const command = process.argv[2] || 'validate';
const root = fileURLToPath(new URL('../evaluation/vendor/janamen-eval-v1.0/', import.meta.url));
const run = (args) => new Promise((resolve) => {
  const child = spawn(process.env.PYTHON || 'python3', args, { cwd: root, stdio: 'inherit',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  child.once('error', (error) => { console.error(`Python 3 is required: ${error.message}`); resolve(1); });
  child.once('exit', (code) => resolve(code ?? 1));
});
if (command === 'validate') process.exitCode = await run(['evaluate.py', 'validate']);
else if (command === 'self-test') process.exitCode = await run(['-m', 'unittest', 'discover', '-s', 'tests', '-q']);
else {
  console.error('Usage: node scripts/eval.mjs [validate|self-test]. These commands never call a model.');
  process.exitCode = 1;
}
