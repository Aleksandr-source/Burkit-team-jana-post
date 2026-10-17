#!/usr/bin/env node
// Explicit, one-time installation. No downloaded shell/install scripts are run.
import { AI_MODEL } from './ai-model.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AI_DIRECTORY = fileURLToPath(new URL('../.local-ai/', import.meta.url));
export { AI_MODEL } from './ai-model.mjs';
export const LLAMA_COMMIT = '2dd84169d1225c2a56ddd1902d718f4514d7536a';
export const MODEL_PATH = join(AI_DIRECTORY, 'models', AI_MODEL.name);
export const SOURCE_PATH = join(AI_DIRECTORY, 'llama.cpp');
export const BUILD_PATH = join(SOURCE_PATH, 'build');
export const RUNTIME_ARCHIVES = {
  'linux-x64': {
    platform: 'linux', arch: 'x64', directory: 'runtime-b8936', executable: 'llama-server',
    filename: 'llama-b8936-bin-ubuntu-x64.tar.gz', format: 'tar.gz',
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b8936/llama-b8936-bin-ubuntu-x64.tar.gz',
    sha256: '9eb1116a03be6ab2056c38788cc90a1a86541443bf44b703eb6e2f809b068438',
  },
  'win32-x64': {
    platform: 'win32', arch: 'x64', directory: 'runtime-b8936-win-x64', executable: 'llama-server.exe',
    filename: 'llama-b8936-bin-win-cpu-x64.zip', format: 'zip',
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b8936/llama-b8936-bin-win-cpu-x64.zip',
    sha256: 'f400223ba8f4cd370e027894b66d29b8c067a50993d5daaa6abb5568f6db36ba',
  },
};
export function runtimeConfiguration(platform = process.platform, arch = process.arch) {
  return RUNTIME_ARCHIVES[`${platform}-${arch}`] || null;
}
export function runtimeArchiveIsVerified(manifest, platform = process.platform, arch = process.arch) {
  const config = runtimeConfiguration(platform, arch);
  if (!config) return false;
  return manifest?.runtimeArchives?.[`${platform}-${arch}`] === config.sha256
    || manifest?.runtimeArchiveSha256 === config.sha256;
}
const RUNTIME_ARCHIVE = runtimeConfiguration();
const DOWNLOAD_COMMAND = process.platform === 'win32' ? 'curl.exe' : 'curl';
export const NATIVE_SERVER_PATH = process.platform === 'win32'
  ? join(BUILD_PATH, 'bin', 'Release', 'llama-server.exe') : join(BUILD_PATH, 'bin', 'llama-server');
export const PREBUILT_SERVER_PATH = RUNTIME_ARCHIVE
  ? join(AI_DIRECTORY, RUNTIME_ARCHIVE.directory, RUNTIME_ARCHIVE.executable) : NATIVE_SERVER_PATH;
export const SERVER_PATH = existsSync(PREBUILT_SERVER_PATH) ? PREBUILT_SERVER_PATH
  : existsSync(NATIVE_SERVER_PATH) ? NATIVE_SERVER_PATH : process.arch === 'x64' ? PREBUILT_SERVER_PATH : NATIVE_SERVER_PATH;

async function exists(path) { try { await access(path); return true; } catch { return false; } }
function run(command, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', ...options });
    let output = '';
    if (options.capture) {
      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => { output += data; });
    }
    child.once('error', fail);
    child.once('close', (code) => code === 0 ? done(output.trim()) : fail(new Error(`${command} failed (${code}). ${output.slice(-1500)}`)));
  });
}
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function installationStatus() {
  const modelInstalled = await exists(MODEL_PATH);
  let manifest = null;
  try { manifest = JSON.parse(await readFile(join(AI_DIRECTORY, 'installation.json'), 'utf8')); } catch { /* first setup */ }
  const preferNative = manifest?.runtimeMode === 'native-build' && await exists(NATIVE_SERVER_PATH);
  const serverPath = preferNative ? NATIVE_SERVER_PATH : await exists(PREBUILT_SERVER_PATH) ? PREBUILT_SERVER_PATH
    : await exists(NATIVE_SERVER_PATH) ? NATIVE_SERVER_PATH : SERVER_PATH;
  const runtimeInstalled = await exists(serverPath);
  const runtimeMode = RUNTIME_ARCHIVE && serverPath === PREBUILT_SERVER_PATH ? 'official-prebuilt' : 'native-build';
  const runtimeVerified = runtimeMode === 'official-prebuilt'
    ? runtimeArchiveIsVerified(manifest)
    : manifest?.runtimeCommit === LLAMA_COMMIT;
  return { modelInstalled, runtimeInstalled, model: AI_MODEL.name, modelPath: MODEL_PATH,
    serverPath, verified: manifest?.sha256 === AI_MODEL.sha256 && runtimeVerified,
    modelVerified: manifest?.sha256 === AI_MODEL.sha256, runtimeVerified,
    runtimeCommit: LLAMA_COMMIT, runtimeMode, runtimePlatform: `${process.platform}-${process.arch}` };
}

async function installModel() {
  await mkdir(dirname(MODEL_PATH), { recursive: true });
  if (await exists(MODEL_PATH)) {
    console.log('[AI] Checking the installed model SHA-256…');
    if (await sha256(MODEL_PATH) === AI_MODEL.sha256) {
      console.log('[AI] The verified model is already installed.'); return;
    }
    throw new Error(`Existing model checksum differs from the pinned GGUF file: ${MODEL_PATH}. Move that file aside before retrying.`);
  }
  console.log('[AI] Downloading Qwen3-0.6B Q4_K_M (~484 MB). Internet is needed only for installation.');
  console.log(`[AI] Model: ${AI_MODEL.url}`);
  const temporaryPath = `${MODEL_PATH}.part`;
  // curl only downloads a fixed data file and can resume an interrupted transfer.
  await run(DOWNLOAD_COMMAND, ['--fail', '--location', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '30', '--continue-at', '-', '--output', temporaryPath, AI_MODEL.url]);
  console.log('[AI] Verifying the pinned model SHA-256…');
  const digest = await sha256(temporaryPath);
  if (digest !== AI_MODEL.sha256) throw new Error(`Model checksum mismatch: ${digest}. The partial file was retained for inspection; it will not be loaded.`);
  await rename(temporaryPath, MODEL_PATH);
  console.log(`[AI] Model verified: ${AI_MODEL.sha256}`);
}

async function buildRuntime() {
  if (process.platform !== 'linux') throw new Error('Source builds in this installer target Linux. On Windows use the official prebuilt CPU runtime.');
  if (await exists(NATIVE_SERVER_PATH)) {
    try {
      const commit = await run('git', ['-C', SOURCE_PATH, 'rev-parse', 'HEAD'], { capture: true });
      if (commit === LLAMA_COMMIT) {
        await run(NATIVE_SERVER_PATH, ['--version'], { capture: true });
        console.log('[AI] The pinned local runtime is already built.'); return;
      }
    } catch { /* Reconfigure an interrupted build. */ }
  }
  await mkdir(SOURCE_PATH, { recursive: true });
  if (!await exists(join(SOURCE_PATH, '.git'))) {
    await run('git', ['init', SOURCE_PATH]);
    await run('git', ['-C', SOURCE_PATH, 'remote', 'add', 'origin', 'https://github.com/ggml-org/llama.cpp.git']);
  }
  const origin = await run('git', ['-C', SOURCE_PATH, 'remote', 'get-url', 'origin'], { capture: true });
  if (origin !== 'https://github.com/ggml-org/llama.cpp.git') throw new Error('Unexpected llama.cpp origin. Refusing to fetch or build a different repository.');
  console.log(`[AI] Fetching pinned llama.cpp commit ${LLAMA_COMMIT}…`);
  await run('git', ['-C', SOURCE_PATH, '-c', 'core.hooksPath=/dev/null', 'fetch', '--depth', '1', 'origin', LLAMA_COMMIT]);
  await run('git', ['-C', SOURCE_PATH, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', LLAMA_COMMIT]);
  const actual = await run('git', ['-C', SOURCE_PATH, 'rev-parse', 'HEAD'], { capture: true });
  if (actual !== LLAMA_COMMIT) throw new Error('Runtime source revision verification failed.');
  console.log('[AI] Configuring a CPU-only native build for this computer (no GPU or AVX2 requirement)…');
  await run('cmake', ['-S', SOURCE_PATH, '-B', BUILD_PATH, '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=ON', '-DGGML_CUDA=OFF', '-DGGML_VULKAN=OFF',
    '-DGGML_OPENCL=OFF', '-DLLAMA_CURL=OFF', '-DLLAMA_OPENSSL=OFF', '-DLLAMA_BUILD_TESTS=OFF',
    '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_SERVER=ON', '-DLLAMA_BUILD_TOOLS=ON']);
  const jobs = Math.max(1, Math.min(2, availableParallelism()));
  console.log(`[AI] Compiling llama-server with ${jobs} CPU thread(s). This may take several minutes…`);
  await run('cmake', ['--build', BUILD_PATH, '--config', 'Release', '--target', 'llama-server', '--parallel', String(jobs)]);
  await run(NATIVE_SERVER_PATH, ['--version']);
}

async function installPrebuiltRuntime() {
  if (!RUNTIME_ARCHIVE) return false;
  if (await exists(PREBUILT_SERVER_PATH)) {
    await run(PREBUILT_SERVER_PATH, ['--version']);
    console.log('[AI] The official pinned CPU runtime is already installed.');
    return true;
  }
  console.log(`[AI] Downloading the official ${process.platform === 'win32' ? 'Windows' : 'Linux'} CPU runtime (~16 MB). It includes CPU variants for this platform.`);
  const archive = join(AI_DIRECTORY, RUNTIME_ARCHIVE.filename);
  if (!await exists(archive) || await sha256(archive) !== RUNTIME_ARCHIVE.sha256) {
    const partial = `${archive}.part`;
    await run(DOWNLOAD_COMMAND, ['--fail', '--location', '--retry', '3', '--connect-timeout', '30', '--continue-at', '-', '--output', partial, RUNTIME_ARCHIVE.url]);
    const digest = await sha256(partial);
    if (digest !== RUNTIME_ARCHIVE.sha256) throw new Error('Official runtime archive checksum mismatch. It will not be extracted or executed.');
    await rename(partial, archive);
  }
  // The digest above comes from GitHub's release asset metadata for pinned
  // b8936. Check archive paths as well before extracting into our own directory.
  const destination = dirname(PREBUILT_SERVER_PATH);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  if (RUNTIME_ARCHIVE.format === 'zip') {
    // Paths travel through environment variables rather than PowerShell source,
    // so spaces, quotes and Cyrillic usernames cannot become executable text.
    const env = { ...process.env, ASAR_AI_ARCHIVE: archive, ASAR_AI_DESTINATION: destination };
    const listing = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead($env:ASAR_AI_ARCHIVE); try { $zip.Entries | ForEach-Object { $_.FullName } } finally { $zip.Dispose() }"], { capture: true, env, windowsHide: true });
    const entries = listing.split(/\r?\n/).filter(Boolean).map((entry) => entry.replaceAll('\\', '/'));
    if (!entries.length || entries.some((entry) => entry.startsWith('/') || /^[a-z]:/i.test(entry) || entry.split('/').includes('..') || entry.includes('\0'))) {
      throw new Error('Unexpected Windows runtime archive paths. Refusing extraction.');
    }
    await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:ASAR_AI_ARCHIVE -DestinationPath $env:ASAR_AI_DESTINATION -Force"], { env, windowsHide: true });
  } else {
    const entries = (await run('tar', ['-tzf', archive], { capture: true })).split('\n')
      .filter((entry) => entry && entry !== '.' && entry !== './');
    if (!entries.length || entries.some((entry) => !entry.startsWith('llama-b8936/') || entry.split('/').includes('..') || entry.startsWith('/'))) {
      throw new Error('Unexpected runtime archive paths. Refusing extraction.');
    }
    await run('tar', ['-xzf', archive, '--strip-components=1', '--no-same-owner', '-C', destination]);
  }
  await run(PREBUILT_SERVER_PATH, ['--version']);
  console.log(`[AI] Official runtime archive verified: ${RUNTIME_ARCHIVE.sha256}`);
  return true;
}

export async function setupAI({ modelOnly = false, runtimeOnly = false, buildFromSource = false } = {}) {
  if (!['linux', 'win32'].includes(process.platform) || (process.platform === 'win32' && process.arch !== 'x64')) throw new Error('This installer supports Linux and Windows x64.');
  console.log('[AI] Preparing local inference with the verified official CPU runtime. Linux --build compiles from source.');
  console.log('[AI] Dependencies: curl; Linux extraction uses tar, Windows extraction uses built-in PowerShell. Source builds additionally need git, cmake and a C++ compiler.');
  await mkdir(AI_DIRECTORY, { recursive: true, mode: 0o700 });
  if (!runtimeOnly) await installModel();
  let selectedRuntimeMode;
  if (!modelOnly) {
    const usePrebuilt = !buildFromSource && await installPrebuiltRuntime();
    if (!usePrebuilt) await buildRuntime();
    selectedRuntimeMode = usePrebuilt ? 'official-prebuilt' : 'native-build';
  }
  const status = await installationStatus();
  if (status.modelInstalled && status.runtimeInstalled) {
    const verified = await sha256(MODEL_PATH);
    if (verified !== AI_MODEL.sha256) throw new Error('Final model verification failed.');
    let previous = {};
    try { previous = JSON.parse(await readFile(join(AI_DIRECTORY, 'installation.json'), 'utf8')); } catch { /* first installation */ }
    const runtimeArchives = {};
    for (const [platform, config] of Object.entries(RUNTIME_ARCHIVES)) {
      if (previous.runtimeArchives?.[platform] === config.sha256 || previous.runtimeArchiveSha256 === config.sha256) runtimeArchives[platform] = config.sha256;
    }
    const runtimeMode = selectedRuntimeMode || status.runtimeMode;
    if (runtimeMode === 'official-prebuilt' && RUNTIME_ARCHIVE) runtimeArchives[`${process.platform}-${process.arch}`] = RUNTIME_ARCHIVE.sha256;
    await writeFile(join(AI_DIRECTORY, 'installation.json'), JSON.stringify({
      model: AI_MODEL.name, revision: AI_MODEL.revision, sha256: verified, license: AI_MODEL.license,
      runtimeCommit: LLAMA_COMMIT, installedAt: new Date().toISOString(),
      runtimeMode, runtimePlatform: `${process.platform}-${process.arch}`, runtimeArchives,
      runtimeArchiveSha256: runtimeMode === 'official-prebuilt' && RUNTIME_ARCHIVE ? RUNTIME_ARCHIVE.sha256 : null,
      modelBytes: (await stat(MODEL_PATH)).size,
    }, null, 2), { mode: 0o600 });
    console.log('[AI] Installation complete. Start with: npm run ai:start');
  }
  return installationStatus();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--status')) {
      const { getAIStatus } = await import('../server/assistant.mjs');
      console.log(JSON.stringify({ installation: await installationStatus(), runtime: await getAIStatus() }, null, 2));
    } else {
      await setupAI({ modelOnly: process.argv.includes('--model-only'), runtimeOnly: process.argv.includes('--runtime-only'), buildFromSource: process.argv.includes('--build') });
    }
  } catch (error) {
    console.error(`[AI] ${error.message}`);
    console.error(process.platform === 'win32'
      ? '[AI] Use the official Windows CPU archive with all DLLs, PowerShell and curl.exe. If DLL loading fails, install Microsoft Visual C++ Redistributable x64.'
      : '[AI] Install curl and tar; source builds also require a C++ compiler, CMake and Git.');
    process.exitCode = 1;
  }
}
