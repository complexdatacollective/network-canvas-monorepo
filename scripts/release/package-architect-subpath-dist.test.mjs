import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

import { packageArchitectSubpathDist } from './package-architect-subpath-dist.mjs';

const COMMIT = 'a'.repeat(40);
const gnuTar = /GNU tar/.test(
  spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout ?? '',
);

// The shape a /v8/ build of Architect 8.5.0 emits, after build.mjs has run.
// `overrides` replaces whole files to break one property at a time.
function fakeDist(overrides = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'subpath-dist-'));
  const files = {
    'index.html':
      '<script type="module" src="/v8/assets/index-abc.js"></script>',
    'preview/index.html':
      '<link rel="stylesheet" href="/v8/assets/preview-def.css">',
    'manifest.webmanifest': JSON.stringify({
      name: 'Architect 8',
      start_url: '/v8/',
      scope: '/v8/',
    }),
    'sw.js':
      'self.workbox.setCacheNameDetails({prefix:"architect-v8-8.5.0-direct-1234"});',
    'assets/index-abc.js': 'console.log(1);',
    'assets/preview-def.css': 'body{}',
    'build-info.json': '{"commit":"x"}',
    ...overrides,
  };
  for (const [file, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const path = join(dist, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  return dist;
}

function pack(dist, options = {}) {
  const out = join(
    mkdtempSync(join(tmpdir(), 'subpath-out-')),
    'architect-v8-dist.tgz',
  );
  const result = packageArchitectSubpathDist({
    dist,
    tag: '@codaco/architect@8.5.0',
    version: '8.5.0',
    commit: COMMIT,
    base: '/v8/',
    out,
    ...options,
  });
  return { ...result, out };
}

test.runIf(gnuTar)(
  'packs the dist root with its dist-info and without hosting rules',
  () => {
    const dist = fakeDist({
      _headers: '/*\n  Cache-Control: no-store\n',
      _redirects: '/* /index.html 200\n',
    });
    const { out, sha256, cachePrefix } = pack(dist);
    assert.equal(cachePrefix, 'architect-v8-');

    const entries = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    // The archive root is the dist root, so Architect 9 extracts it straight
    // into dist/v8.
    for (const entry of [
      './index.html',
      './sw.js',
      './manifest.webmanifest',
      './preview/index.html',
      './assets/index-abc.js',
      './dist-info.json',
    ]) {
      assert.ok(entries.includes(entry), `${entry} is packed`);
    }
    assert.ok(!entries.some((entry) => /_headers|_redirects/.test(entry)));

    const info = JSON.parse(
      execFileSync('tar', ['-xzOf', out, './dist-info.json'], {
        encoding: 'utf8',
      }),
    );
    assert.deepEqual(info, {
      tag: '@codaco/architect@8.5.0',
      version: '8.5.0',
      commit: COMMIT,
      base: '/v8/',
      cachePrefix: 'architect-v8-',
    });

    assert.equal(
      sha256,
      createHash('sha256').update(readFileSync(out)).digest('hex'),
    );
    assert.equal(
      readFileSync(`${out}.sha256`, 'utf8'),
      `${sha256}  architect-v8-dist.tgz\n`,
    );
    execFileSync('sha256sum', ['-c', 'architect-v8-dist.tgz.sha256'], {
      cwd: join(out, '..'),
      stdio: 'pipe',
    });
  },
);

// Same files, different directories and timestamps: the bytes must not move,
// or the same dist could never be matched against a pin.
test.runIf(gnuTar)('packs the same dist to the same bytes', () => {
  const first = fakeDist();
  const second = fakeDist();
  utimesSync(join(second, 'index.html'), new Date(0), new Date(1e12));
  assert.equal(pack(first).sha256, pack(second).sha256);
});

test('refuses a dist that loads assets from the root', () => {
  const dist = fakeDist({
    'index.html':
      '<script src="/v8/assets/a.js"></script><script src="/assets/b.js"></script>',
  });
  assert.throws(() => pack(dist), /index\.html still loads assets from/);
});

test('refuses a root build', () => {
  const dist = fakeDist({
    'index.html': '<script src="/assets/a.js"></script>',
  });
  assert.throws(() => pack(dist), /does not load its assets from \/v8\//);
  assert.throws(() => pack(fakeDist(), { base: '/' }), /needs a base/);
});

test('refuses a manifest scoped outside the base', () => {
  const dist = fakeDist({
    'manifest.webmanifest': JSON.stringify({ start_url: '/v8/', scope: '/' }),
  });
  assert.throws(() => pack(dist), /scope is "\/", not \/v8\//);
});

// A worker under the root prefix would be pruned by Architect 9's, or prune
// Architect 9's caches itself.
test('refuses a worker that precaches outside the sub-path prefix', () => {
  const dist = fakeDist({
    'sw.js':
      'self.workbox.setCacheNameDetails({prefix:"architect-8.5.0-direct-1234"});',
  });
  assert.throws(() => pack(dist), /not architect-v8-8\.5\.0-/);
});

test('refuses source maps', () => {
  const dist = fakeDist({ 'assets/index-abc.js.map': '{}' });
  assert.throws(() => pack(dist), /source maps.*assets\/index-abc\.js\.map/);
});

test('refuses a missing entry point', () => {
  const dist = fakeDist({ 'preview/index.html': null });
  assert.throws(() => pack(dist), /missing preview\/index\.html/);
});

test('refuses a tag that does not name the version', () => {
  assert.throws(
    () => pack(fakeDist(), { tag: '@codaco/architect@8.4.0' }),
    /not the release tag of Architect 8\.5\.0/,
  );
  assert.throws(
    () => pack(fakeDist(), { commit: 'abc' }),
    /commit must be a full SHA/,
  );
});

test('leaves nothing packed when a check fails', () => {
  const dist = fakeDist({ 'assets/x.map': '{}' });
  let out;
  try {
    ({ out } = pack(dist));
  } catch {
    // expected
  }
  assert.equal(out, undefined);
  assert.equal(existsSync(join(dist, 'dist-info.json')), false);
});
