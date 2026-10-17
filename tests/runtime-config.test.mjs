import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_ARCHIVES, runtimeConfiguration, runtimeArchiveIsVerified } from '../scripts/setup-ai.mjs';

test('platform selection uses native Windows exe and separate Linux runtime', () => {
  const windows = runtimeConfiguration('win32', 'x64');
  const linux = runtimeConfiguration('linux', 'x64');
  assert.equal(windows.directory, 'runtime-b8936-win-x64');
  assert.equal(windows.executable, 'llama-server.exe');
  assert.equal(windows.format, 'zip');
  assert.equal(linux.directory, 'runtime-b8936');
  assert.equal(linux.executable, 'llama-server');
  assert.notEqual(windows.sha256, linux.sha256);
  assert.equal(runtimeConfiguration('darwin', 'x64'), null);
  assert.equal(runtimeConfiguration('win32', 'arm64'), null);
});

test('legacy verified Linux manifests remain valid only for that archive', () => {
  const manifest = { runtimeArchiveSha256: RUNTIME_ARCHIVES['linux-x64'].sha256 };
  assert.equal(runtimeArchiveIsVerified(manifest, 'linux', 'x64'), true);
  assert.equal(runtimeArchiveIsVerified(manifest, 'win32', 'x64'), false);
});

test('portable manifest validates the Windows and Linux digests independently', () => {
  const manifest = { runtimeArchives: {
    'linux-x64': RUNTIME_ARCHIVES['linux-x64'].sha256,
    'win32-x64': RUNTIME_ARCHIVES['win32-x64'].sha256,
  } };
  assert.equal(runtimeArchiveIsVerified(manifest, 'linux', 'x64'), true);
  assert.equal(runtimeArchiveIsVerified(manifest, 'win32', 'x64'), true);
  manifest.runtimeArchives['win32-x64'] = RUNTIME_ARCHIVES['linux-x64'].sha256;
  assert.equal(runtimeArchiveIsVerified(manifest, 'win32', 'x64'), false);
  assert.equal(runtimeArchiveIsVerified(manifest, 'linux', 'x64'), true);
  assert.equal(runtimeArchiveIsVerified(null, 'win32', 'x64'), false);
});
