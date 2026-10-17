import test from 'node:test';
import assert from 'node:assert/strict';
import { posix, win32 } from 'node:path';
import { resolveStaticPath } from '../server/paths.mjs';

test('static assets resolve inside the project on Linux and Windows', () => {
  for (const [paths, root] of [[posix, '/demo/Asar HR/dist'], [win32, 'C:\\demo\\Asar HR\\dist']]) {
    assert.equal(resolveStaticPath(root, '/', paths), root);
    assert.equal(resolveStaticPath(root, '/assets/app.js', paths), paths.join(root, 'assets', 'app.js'));
    assert.equal(resolveStaticPath(root, '/profile', paths), paths.join(root, 'profile'));
    assert.equal(resolveStaticPath(root, '/../.data/asar.sqlite', paths), null);
    assert.equal(resolveStaticPath(root, '/../dist-other/file.js', paths), null);
  }
  assert.equal(resolveStaticPath('C:\\demo\\dist', '/..\\.data\\asar.sqlite', win32), null);
});
