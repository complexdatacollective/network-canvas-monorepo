import { inspect } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import {
  createBase64RootKeyLoader,
  KeyConfigurationError,
  type KeysetConfiguration,
  loadEncryptionKeys,
} from '../keys.ts';
import { configuration, loadTestKeys, rootOne } from './fixtures.ts';

describe('key configuration and loader boundary', () => {
  it('loads each root once and keeps namespace selectors independent', async () => {
    const config = configuration();
    config.pii.current = 'v2';
    const loader = vi.fn(async () => rootOne);
    const keys = await loadEncryptionKeys(config, loader);
    expect(loader.mock.calls).toHaveLength(2);
    expect(keys.currentId('pii-enc')).toBe('v2');
    expect(keys.currentId('integration-enc')).toBe('v1');
    expect(keys.currentId('pii-index')).toBe('index-1');
    expect(keys.has('pii-enc', 'v1')).toBe(true);
    expect(keys.has('pii-enc', 'missing')).toBe(false);
    expect(keys.has('integration-enc', 'index-1')).toBe(false);
  });

  const invalidConfigurations: [
    string,
    (config: KeysetConfiguration) => unknown,
  ][] = [
    ['absent configuration', () => undefined],
    ['empty roots', (config) => ({ ...config, roots: [] })],
    [
      'duplicate root id',
      (config) => ({ ...config, roots: [...config.roots, config.roots[0]] }),
    ],
    [
      'missing current key',
      (config) => ({ ...config, pii: { ...config.pii, current: 'absent' } }),
    ],
    [
      'duplicate key id',
      (config) => ({
        ...config,
        pii: { ...config.pii, keys: [...config.pii.keys, config.pii.keys[0]] },
      }),
    ],
    [
      'unknown root reference',
      (config) => ({
        ...config,
        integration: { current: 'v1', keys: [{ id: 'v1', rootId: 'absent' }] },
      }),
    ],
    [
      'empty index keyset',
      (config) => ({
        ...config,
        blindIndex: { ...config.blindIndex, keys: [] },
      }),
    ],
    [
      'missing namespace',
      (config) => ({
        roots: config.roots,
        pii: config.pii,
        integration: config.integration,
      }),
    ],
    [
      'invalid key id',
      (config) => ({ ...config, pii: { ...config.pii, current: 'bad key' } }),
    ],
    [
      'empty key reference',
      (config) => ({ ...config, roots: [{ id: 'root-1', reference: ' ' }] }),
    ],
    [
      'unexpected property',
      (config) => ({ ...config, secret: 'must-not-be-accepted' }),
    ],
  ];

  it('has malformed configuration probes', () => {
    expect(invalidConfigurations.length).toBeGreaterThan(0);
  });

  it.each(invalidConfigurations)(
    'rejects %s before loading secrets',
    async (_name, invalid) => {
      const loader = vi.fn(async () => rootOne);
      await expect(
        loadEncryptionKeys(invalid(configuration()), loader),
      ).rejects.toThrow(KeyConfigurationError);
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it.each([0, 16, 31, 33, 64])('rejects a %i-byte root', async (length) => {
    await expect(
      loadEncryptionKeys(configuration(), async () => Buffer.alloc(length)),
    ).rejects.toThrow(KeyConfigurationError);
  });

  it('sanitizes loader failures without attaching a secret-bearing cause', async () => {
    const secret = 'synthetic-secret-in-provider-error';
    const error = await loadEncryptionKeys(configuration(), async () => {
      throw new Error(secret);
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(KeyConfigurationError);
    expect(inspect(error)).not.toContain(secret);
    expect(error).not.toHaveProperty('cause');
  });

  it('copies caller-owned material and configuration before later mutations', async () => {
    const config = configuration();
    const material = Buffer.from(rootOne);
    const keys = await loadEncryptionKeys(config, async () => material);
    const before = keys.derive('pii-enc', 'v1', ['team', 'team-1']).export();
    material.fill(0);
    config.pii.current = 'v2';
    config.pii.keys.length = 0;
    expect(keys.currentId('pii-enc')).toBe('v1');
    expect(keys.derive('pii-enc', 'v1', ['team', 'team-1']).export()).toEqual(
      before,
    );
    expect(JSON.stringify(keys)).toBe('{}');
    expect(inspect(keys)).not.toContain(rootOne.toString('base64'));
  });

  it('separates purposes, key ids, team scopes, and tuple boundaries', async () => {
    const keys = await loadTestKeys();
    const derive = (
      purpose: 'pii-enc' | 'integration-enc',
      id: string,
      scope: string[],
    ) => keys.derive(purpose, id, scope).export();
    const participant = derive('pii-enc', 'v1', ['team', 'one']);
    expect(participant).toHaveLength(32);
    expect(participant).not.toEqual(rootOne);
    expect(derive('integration-enc', 'v1', ['team', 'one'])).not.toEqual(
      participant,
    );
    expect(derive('pii-enc', 'same-root-new-id', ['team', 'one'])).not.toEqual(
      participant,
    );
    expect(derive('pii-enc', 'v1', ['team', 'two'])).not.toEqual(participant);
    expect(derive('pii-enc', 'v1', ['team|one', 'two'])).not.toEqual(
      derive('pii-enc', 'v1', ['team', 'one|two']),
    );
    expect(() => keys.derive('pii-enc', 'absent', ['team', 'one'])).toThrow(
      KeyConfigurationError,
    );
  });
});

describe('canonical base64 root adapter', () => {
  it('loads a 32-byte root through the injected reference reader', async () => {
    const read = vi.fn(() => rootOne.toString('base64'));
    expect(await createBase64RootKeyLoader(read)('ROOT_REFERENCE')).toEqual(
      rootOne,
    );
    expect(read).toHaveBeenCalledExactlyOnceWith('ROOT_REFERENCE');
  });

  it.each([
    undefined,
    '',
    Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'),
    `${rootOne.toString('base64')}\n`,
    rootOne.toString('base64').slice(0, -1),
    `${'A'.repeat(42)}B=`, // Same decoded bytes as A...A=, noncanonical pad bits.
    'this-is-not-a-base64-encoded-root',
  ])('rejects malformed or noncanonical base64 case %#', async (value) => {
    await expect(
      createBase64RootKeyLoader(() => value)('ROOT_REFERENCE'),
    ).rejects.toThrow(KeyConfigurationError);
  });
});
