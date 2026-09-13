import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { build } from 'vite';
import { test } from 'vitest';

import { studioSourceMaps } from '../../apps/studio/scripts/telemetry-plugins.ts';

test('Studio processes compiled chunk identities even without upload credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-offline-build-'));
  try {
    const plugins = studioSourceMaps('test', root, '0.2.0');
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, 'studio-offline-source-maps');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('the credential-free Studio build registers real chunks and removes private source maps', async () => {
  const root = mkdtempSync(join(tmpdir(), 'studio-offline-bundle-'));
  try {
    const entry = join(root, 'entry.js');
    writeFileSync(entry, 'globalThis.studioOfflineFixture = true;');
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: studioSourceMaps('test', root, '0.2.0'),
      build: { outDir: join(root, 'dist'), rollupOptions: { input: entry } },
    });
    const assets = join(root, 'dist/assets');
    const files = readdirSync(assets);
    assert(files.some((file) => file.endsWith('.js')));
    assert(!files.some((file) => file.endsWith('.map')));
    const runtime = {};
    for (const file of files.filter((candidate) => candidate.endsWith('.js'))) {
      runInNewContext(readFileSync(join(assets, file), 'utf8'), runtime, {
        filename: file,
      });
    }
    assert.equal(runtime.studioOfflineFixture, true);
    assert.equal(Object.keys(runtime._posthogChunkIds ?? {}).length, 1);
  } finally {
    rmSync(root, { recursive: true });
  }
});
