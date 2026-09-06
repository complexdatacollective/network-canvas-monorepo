import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Hono } from 'hono';
import { expect, it } from 'vitest';

import type { PrincipalVariables } from '../../auth/principal.ts';
import { mountClient } from '../../client-assets.ts';
import { resolve } from '../../env/resolve.ts';
import {
  retainClientAssets,
  verifyClientAssetCache,
} from '../client-asset-cache.ts';
import { parseClientCacheArguments } from '../client-cache-command.ts';

const oldUrl = 'index-OldHash1.js';
const newUrl = 'nested/index-NewHash2.js';

async function fixture(
  run: (paths: {
    root: string;
    source: string;
    next: string;
    cache: string;
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'studio-client-asset-cache-'));
  const source = join(root, 'source');
  const next = join(root, 'next');
  const cache = join(root, 'cache');
  await mkdir(source);
  await mkdir(next);
  await writeFile(join(source, oldUrl), 'old editor module');
  await mkdir(join(next, dirname(newUrl)));
  await writeFile(join(next, newUrl), 'new editor module');
  try {
    await run({ root, source, next, cache });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it('retains old hashed URLs across image changes and binds readers to immutable complete generations', async () => {
  await fixture(async ({ source, next, cache }) => {
    const before = await retainClientAssets(source, cache);
    const after = await retainClientAssets(next, cache);
    expect(after.generation).not.toBe(before.generation);
    expect(await readFile(join(after.root, 'assets', oldUrl), 'utf8')).toBe(
      'old editor module',
    );
    expect(await readFile(join(after.root, 'assets', newUrl), 'utf8')).toBe(
      'new editor module',
    );
    expect(await readFile(join(before.root, 'assets', oldUrl), 'utf8')).toBe(
      'old editor module',
    );
    expect(await readdir(join(before.root, 'assets'))).toEqual([oldUrl]);
    expect((await stat(join(before.root, 'assets', oldUrl))).ino).toBe(
      (await stat(join(after.root, 'assets', oldUrl))).ino,
    );
    expect(await verifyClientAssetCache(cache, source)).toEqual(after);
    expect(await verifyClientAssetCache(cache, next)).toEqual(after);
    expect(Object.isFrozen(after)).toBe(true);
    expect(await retainClientAssets(next, cache)).toEqual(after);
    expect(await readdir(join(cache, 'generations'))).toHaveLength(2);
  });
});

it('refuses a same-URL collision before replacing any admitted bytes or pointer', async () => {
  await fixture(async ({ source, next, cache }) => {
    const before = await retainClientAssets(source, cache);
    await writeFile(join(next, oldUrl), 'different bytes under the old URL');
    await expect(retainClientAssets(next, cache)).rejects.toThrow(
      'different bytes',
    );
    expect(await readlink(join(cache, 'current'))).toBe(before.generation);
    expect(await readFile(join(before.root, 'assets', oldUrl), 'utf8')).toBe(
      'old editor module',
    );
    expect(await readdir(join(cache, 'generations'))).toEqual([
      before.generation.split('/')[1],
    ]);
  });
});

it('refuses admission when the selected image is missing from the retained generation', async () => {
  await fixture(async ({ source, next, cache }) => {
    await retainClientAssets(source, cache);
    await expect(verifyClientAssetCache(cache, next)).rejects.toThrow(
      'invalid',
    );
    await retainClientAssets(next, cache);
    expect((await verifyClientAssetCache(cache, next)).files).toBe(2);
  });
});

it.each(['bytes', 'manifest', 'extra-file', 'symlink'] as const)(
  'refuses %s damage before serving, extending or archiving a generation',
  async (damage) => {
    await fixture(async ({ source, next, cache }) => {
      const before = await retainClientAssets(source, cache);
      if (damage === 'bytes')
        await writeFile(join(before.root, 'assets', oldUrl), 'tampered bytes');
      if (damage === 'manifest')
        await writeFile(
          join(before.root, 'manifest.json'),
          '{"version":1,"files":[]}\n',
        );
      if (damage === 'extra-file')
        await writeFile(
          join(before.root, 'unexpected-secret.txt'),
          'not inventoried',
        );
      if (damage === 'symlink') {
        await unlink(join(before.root, 'assets', oldUrl));
        await symlink(
          join(source, oldUrl),
          join(before.root, 'assets', oldUrl),
        );
      }
      await expect(verifyClientAssetCache(cache)).rejects.toThrow('invalid');
      await expect(retainClientAssets(next, cache)).rejects.toThrow('invalid');
      expect(await readlink(join(cache, 'current'))).toBe(before.generation);
    });
  },
);

it('recovers a completed first publication whose process died before committing its pointer', async () => {
  await fixture(async ({ source, cache }) => {
    const completed = await retainClientAssets(source, cache);
    await unlink(join(cache, 'current'));
    await mkdir(join(cache, 'generations', '.pending-abandoned'));
    await writeFile(
      join(cache, 'generations', '.pending-abandoned', 'incomplete'),
      'partial bytes',
    );
    expect(await retainClientAssets(source, cache)).toEqual(completed);
    expect((await verifyClientAssetCache(cache, source)).files).toBe(1);
  });
});

it('never blesses or replaces a damaged complete generation left by an interrupted first publication', async () => {
  await fixture(async ({ source, cache }) => {
    const completed = await retainClientAssets(source, cache);
    await unlink(join(cache, 'current'));
    await rm(completed.root, { recursive: true });
    await mkdir(completed.root);
    await expect(retainClientAssets(source, cache)).rejects.toThrow('invalid');
    await expect(readlink(join(cache, 'current'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readdir(completed.root)).toEqual([]);
  });
});

it.each(['index.html', 'unhashed.js', 'hidden/.private-Abcdefgh.js'])(
  'refuses an unhashed or unsafe source path %s before creating the cache',
  async (path) => {
    await fixture(async ({ source, cache }) => {
      await mkdir(dirname(join(source, path)), { recursive: true });
      await writeFile(
        join(source, path),
        'must not become retained application code',
      );
      await expect(retainClientAssets(source, cache)).rejects.toThrow(
        'invalid',
      );
      await expect(stat(cache)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  },
);

it.each(['root', 'generations', 'current'] as const)(
  'refuses a %s symlink that escapes the selected cache',
  async (location) => {
    await fixture(async ({ root, source, cache }) => {
      const foreign = join(root, 'foreign');
      await mkdir(foreign);
      if (location === 'root') await symlink(foreign, cache);
      else {
        await mkdir(cache);
        await symlink(foreign, join(cache, location));
      }
      await expect(retainClientAssets(source, cache)).rejects.toThrow(
        'invalid',
      );
      expect(await readdir(foreign)).toEqual([]);
    });
  },
);

it('serves a held old URL and new modules from the verified generation while the selected image owns the shell', async () => {
  await fixture(async ({ root, source, next, cache }) => {
    await retainClientAssets(source, cache);
    const retained = await retainClientAssets(next, cache);
    const client = join(root, 'selected-client');
    await mkdir(client);
    const shell = '<!doctype html><title>Selected new image</title>';
    await writeFile(join(client, 'index.html'), shell);
    const app = new Hono<PrincipalVariables>();
    // mountClient receives the already-verified startup descriptor; this
    // in-process fixture substitutes only the selected image shell directory.
    mountClient(app, resolve({ CLIENT_DIST: client }), undefined, retained);
    for (const [path, body] of [
      [oldUrl, 'old editor module'],
      [newUrl, 'new editor module'],
    ]) {
      const response = await app.request(`/assets/${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=31536000, immutable',
      );
    }
    for (const path of ['/', '/editor', '/index.html']) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(shell);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    for (const path of [
      '/assets/missing-Abcdefgh.js',
      '/assets/index.html',
      '/assets/%2e%2e%2fmanifest.json',
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(shell);
    }
  });
});

it('requires the image-owned client when the retained cache is configured', () => {
  expect(
    resolve({ STUDIO_CLIENT_ASSET_CACHE: '/retained-assets' }).clientAssetCache,
  ).toBe('/retained-assets');
  expect(() =>
    resolve({
      STUDIO_CLIENT_ASSET_CACHE: '/retained-assets',
      CLIENT_DIST: '/replacement',
    }),
  ).toThrow('image-owned');
  for (const path of ['relative', '/', '/cache/../other'])
    expect(() => resolve({ STUDIO_CLIENT_ASSET_CACHE: path })).toThrow(
      'absolute',
    );
});

it('accepts only the bounded public command before any filesystem operation', () => {
  for (const action of ['retain', 'verify', 'archive'])
    expect(
      parseClientCacheArguments([action, '--directory', '/retained-assets']),
    ).toEqual({ action, directory: '/retained-assets' });
  for (const args of [
    ['retain', '--directory', '/'],
    ['retain', '--directory', 'relative'],
    ['retain', '--directory', '/cache/../other'],
    ['retain', '--source', '/replacement'],
    ['retain', '--directory', '/cache', '--source', '/replacement'],
    ['unknown', '--directory', '/cache'],
  ])
    expect(() => parseClientCacheArguments(args)).toThrow();
});
