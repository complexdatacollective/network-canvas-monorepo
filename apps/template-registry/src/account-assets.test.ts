import { symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createAccountAssetsFixture } from './__tests__/account-assets-fixture.ts';
import { createRegistryFixture } from './__tests__/fixtures.ts';
import { loadRegistryAccountAssets } from './account-assets.ts';
import { createRegistryApp } from './app.ts';

let fixture: Awaited<ReturnType<typeof createAccountAssetsFixture>>;
beforeEach(async () => {
  fixture = await createAccountAssetsFixture();
});
afterEach(async () => {
  await fixture.dispose();
});

it('serves only compiled inventory bytes with page CSP and preserves API sandboxing', async () => {
  const accountAssets = await loadRegistryAccountAssets(fixture.directory);
  const api = await createRegistryFixture();
  try {
    const app = createRegistryApp({
      ...api,
      accountAssets,
      accepting: () => true,
      ready: async () => true,
      onDiagnostic: () => {
        throw new Error('Unexpected diagnostic');
      },
    });
    const document = await app.request('https://registry.test/account/');
    expect(document.status).toBe(200);
    expect(await document.text()).toContain(
      '/account/assets/account-abcdef.js',
    );
    expect(document.headers.get('Cache-Control')).toBe('no-store');
    expect(document.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self'",
    );
    expect(document.headers.get('Content-Security-Policy')).not.toContain(
      'sandbox',
    );
    const asset = await app.request(
      'https://registry.test/account/assets/account-abcdef.js',
    );
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain('account fixture');
    expect(asset.headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(asset.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(asset.headers.get('ETag')).toMatch(/^"[0-9a-f]{64}"$/);
    const head = await app.request(
      'https://registry.test/account/assets/account-abcdef.js',
      { method: 'HEAD' },
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    for (const path of [
      '.vite/manifest.json',
      '../package.json',
      '%2e%2e/package.json',
      'assets/missing.js',
      'assets/%2e%2e%2findex.html',
    ]) {
      const response = await app.request(
        `https://registry.test/account/${path}`,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Security-Policy')).toContain(
        'sandbox',
      );
    }
    expect(
      (await app.request('https://registry.test/api/v1/entries')).headers.get(
        'Content-Security-Policy',
      ),
    ).toBe("default-src 'none'; frame-ancestors 'none'; sandbox");
    const copy = accountAssets.get('/account/assets/account-abcdef.js');
    expect(copy).toBeDefined();
    copy!.body().fill(0);
    expect(
      new TextDecoder().decode(
        accountAssets.get('/account/assets/account-abcdef.js')?.body(),
      ),
    ).toContain('account fixture');
  } finally {
    await api.dispose();
  }
});

it.each([
  'missing',
  'traversal',
  'absolute',
  'symlink',
  'unresolved-import',
  'missing-entry',
  'oversized',
] as const)(
  'refuses %s account assets with a fixed error',
  async (condition) => {
    if (condition === 'missing')
      await unlink(join(fixture.directory, 'assets/account-abcdef.js'));
    if (condition === 'traversal' || condition === 'absolute')
      await writeFile(
        join(fixture.directory, '.vite/manifest.json'),
        JSON.stringify({
          'index.html': {
            file: condition === 'traversal' ? '../private.js' : '/private.js',
            isEntry: true,
          },
        }),
      );
    if (condition === 'symlink') {
      await unlink(join(fixture.directory, 'assets/account-abcdef.js'));
      await symlink(
        join(fixture.directory, 'index.html'),
        join(fixture.directory, 'assets/account-abcdef.js'),
      );
    }
    if (condition === 'unresolved-import')
      await writeFile(
        join(fixture.directory, '.vite/manifest.json'),
        JSON.stringify({
          'index.html': {
            file: 'assets/account-abcdef.js',
            isEntry: true,
            imports: ['missing.js'],
          },
        }),
      );
    if (condition === 'missing-entry')
      await writeFile(join(fixture.directory, '.vite/manifest.json'), '{}');
    if (condition === 'oversized')
      await writeFile(
        join(fixture.directory, 'assets/account-abcdef.js'),
        new Uint8Array(8 * 1024 * 1024 + 1),
      );
    await expect(loadRegistryAccountAssets(fixture.directory)).rejects.toEqual(
      new Error('REGISTRY_ACCOUNT_ASSETS_INVALID'),
    );
  },
);

it('holds a bounded account bundle budget until bytes are consumed or cancelled', async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024).fill(32);
  await writeFile(join(fixture.directory, 'assets/account-abcdef.js'), bytes);
  const accountAssets = await loadRegistryAccountAssets(fixture.directory);
  const api = await createRegistryFixture();
  const responses: Response[] = [];
  try {
    const app = createRegistryApp({
      ...api,
      accountAssets,
      accepting: () => true,
      ready: async () => true,
      onDiagnostic: () => {
        throw new Error('Unexpected diagnostic');
      },
    });
    const get = () =>
      app.request('https://registry.test/account/assets/account-abcdef.js');
    responses.push(await get(), await get());
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const refused = await get();
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(refused.headers.get('Retry-After')).toBe('1');
    expect((await app.request('https://registry.test/healthz')).status).toBe(
      200,
    );
    expect(
      (
        await app.request(
          'https://registry.test/account/assets/account-abcdef.js',
          { method: 'HEAD' },
        )
      ).status,
    ).toBe(200);
    expect(new Uint8Array(await responses[0]!.arrayBuffer())).toEqual(bytes);
    responses.push(await get());
    expect(responses[2]!.status).toBe(200);
    await responses[1]!.body?.cancel();
    responses.push(await get());
    expect(responses[3]!.status).toBe(200);
  } finally {
    for (const response of responses)
      if (!response.bodyUsed) await response.body?.cancel();
    await api.dispose();
  }
});
