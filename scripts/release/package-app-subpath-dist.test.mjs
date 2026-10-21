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

import { describe, test } from 'vitest';

import {
  packageAppSubpathDist,
  SUBPATH_APPS,
} from './package-app-subpath-dist.mjs';

const COMMIT = 'a'.repeat(40);
const gnuTar = /GNU tar/.test(
  spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout ?? '',
);

// The shape a /v8/ build of each app at 8.5.0 emits, after its build.mjs has
// run. Interviewer's stamps its own dist-info.json (it has no other build
// stamp); Architect's carries build-info.json from write-build-info.mjs.
const DISTS = {
  architect: {
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
  },
  interviewer: {
    'index.html':
      '<script type="module" src="/v8/assets/main-abc.js"></script><link rel="stylesheet" href="/v8/assets/main-def.css">',
    'manifest.webmanifest': JSON.stringify({
      name: 'Interviewer 8',
      start_url: '/v8/',
      scope: '/v8/',
      id: '/v8/',
    }),
    'sw.js':
      'self.workbox.setCacheNameDetails({prefix:"interviewer-v8-8.5.0-direct-1234"});',
    'assets/main-abc.js': 'console.log(1);',
    'assets/main-def.css': 'body{}',
    'dist-info.json': JSON.stringify({
      tag: '@codaco/interviewer@8.5.0',
      version: '8.5.0',
      commit: null,
      base: '/v8/',
      cachePrefix: 'interviewer-v8-',
    }),
  },
};

test('covers every app that ships a sub-path dist', () => {
  assert.deepEqual(Object.keys(DISTS).toSorted(), Object.keys(SUBPATH_APPS));
});

test('refuses an app without a sub-path dist', () => {
  assert.throws(
    () =>
      packageAppSubpathDist({
        app: 'fresco',
        dist: mkdtempSync(join(tmpdir(), 'subpath-dist-')),
        tag: 'fresco@8.5.0',
        version: '8.5.0',
        commit: COMMIT,
        base: '/v8/',
        out: join(tmpdir(), 'never.tgz'),
      }),
    /'fresco' has no sub-path dist/,
  );
  assert.throws(
    () =>
      packageAppSubpathDist({
        app: 'toString',
        dist: tmpdir(),
        tag: '',
        version: '',
        commit: COMMIT,
        base: '/v8/',
        out: '',
      }),
    /has no sub-path dist/,
  );
});

describe.each(Object.keys(SUBPATH_APPS))('%s', (app) => {
  const { label, htmlEntries } = SUBPATH_APPS[app];
  const tag = `@codaco/${app}@8.5.0`;

  // `overrides` replaces whole files to break one property at a time.
  function fakeDist(overrides = {}) {
    const dist = mkdtempSync(join(tmpdir(), 'subpath-dist-'));
    for (const [file, contents] of Object.entries({
      ...DISTS[app],
      ...overrides,
    })) {
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
      `${app}-v8-dist.tgz`,
    );
    const result = packageAppSubpathDist({
      app,
      dist,
      tag,
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
      assert.equal(cachePrefix, `${app}-v8-`);

      const entries = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
      // The archive root is the dist root, so the next major extracts it
      // straight into dist/v8.
      for (const entry of [
        ...htmlEntries.map((file) => `./${file}`),
        './sw.js',
        './manifest.webmanifest',
        './dist-info.json',
      ]) {
        assert.ok(entries.includes(entry), `${entry} is packed`);
      }
      assert.ok(entries.some((entry) => entry.startsWith('./assets/')));
      assert.ok(!entries.some((entry) => /_headers|_redirects/.test(entry)));

      // The released tag and commit, even over a stamp the build wrote.
      const info = JSON.parse(
        execFileSync('tar', ['-xzOf', out, './dist-info.json'], {
          encoding: 'utf8',
        }),
      );
      assert.deepEqual(info, {
        tag,
        version: '8.5.0',
        commit: COMMIT,
        base: '/v8/',
        cachePrefix: `${app}-v8-`,
      });

      assert.equal(
        sha256,
        createHash('sha256').update(readFileSync(out)).digest('hex'),
      );
      // sha256sum's own format, which the publish job checks with `-c`.
      assert.equal(
        readFileSync(`${out}.sha256`, 'utf8'),
        `${sha256}  ${app}-v8-dist.tgz\n`,
      );
    },
  );

  // Same files, different directories and timestamps: the bytes must not
  // move, or the same dist could never be matched against a pin.
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

  // A worker under the root prefix would be pruned by the next major's, or
  // prune its caches itself.
  test('refuses a worker that precaches outside the sub-path prefix', () => {
    const dist = fakeDist({
      'sw.js': `self.workbox.setCacheNameDetails({prefix:"${app}-8.5.0-direct-1234"});`,
    });
    assert.throws(() => pack(dist), new RegExp(`not ${app}-v8-8\\.5\\.0-`));
  });

  test('refuses source maps', () => {
    const dist = fakeDist({ 'assets/index-abc.js.map': '{}' });
    assert.throws(() => pack(dist), /source maps.*assets\/index-abc\.js\.map/);
  });

  test('refuses a missing entry point', () => {
    for (const file of htmlEntries) {
      const dist = fakeDist({ [file]: null });
      assert.throws(
        () => pack(dist),
        new RegExp(`missing ${file.replace('.', '\\.')}`),
      );
    }
  });

  test('refuses a tag that does not name the version', () => {
    assert.throws(
      () => pack(fakeDist(), { tag: `@codaco/${app}@8.4.0` }),
      new RegExp(`not the release tag of ${label} 8\\.5\\.0`),
    );
    // Another app's tag at the same version is not this app's release.
    const other = app === 'architect' ? 'interviewer' : 'architect';
    assert.throws(
      () => pack(fakeDist(), { tag: `@codaco/${other}@8.5.0` }),
      /not the release tag/,
    );
    assert.throws(
      () => pack(fakeDist(), { commit: 'abc' }),
      /commit must be a full SHA/,
    );
  });

  test('leaves nothing packed when a check fails', () => {
    const dist = fakeDist({ 'assets/x.map': '{}' });
    const stamped = existsSync(join(dist, 'dist-info.json'))
      ? readFileSync(join(dist, 'dist-info.json'), 'utf8')
      : undefined;
    let out;
    try {
      ({ out } = pack(dist));
    } catch {
      // expected
    }
    assert.equal(out, undefined);
    // Whatever the build stamped (or did not) is left as it was.
    assert.equal(
      existsSync(join(dist, 'dist-info.json'))
        ? readFileSync(join(dist, 'dist-info.json'), 'utf8')
        : undefined,
      stamped,
    );
  });
});
