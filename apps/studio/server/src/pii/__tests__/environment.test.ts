import { describe, expect, it } from 'vitest';

import { resolveEncryptionEnv } from '../../env/encryption.ts';
import { KeyConfigurationError, loadEncryptionKeys } from '../keys.ts';
import { configuration, rootOne } from './fixtures.ts';

describe('operator encryption environment', () => {
  it('loads only explicit namespaced references and snapshots their values', async () => {
    const config = configuration();
    config.roots = config.roots.map((root) => ({
      ...root,
      reference: `STUDIO_ENCRYPTION_ROOT_${root.reference}`,
    }));
    const source = {
      STUDIO_ENCRYPTION_KEYSET: JSON.stringify(config),
      STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE: rootOne.toString('base64'),
      STUDIO_ENCRYPTION_ROOT_TEST_ROOT_TWO: rootOne.toString('base64'),
    };
    const resolved = resolveEncryptionEnv(source);
    source.STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE = 'changed-after-resolution';
    await expect(
      loadEncryptionKeys(resolved.configuration, resolved.loadRootKey),
    ).resolves.toBeDefined();
  });

  it('does not choose public defaults without explicit local development evidence', async () => {
    const cases = [
      undefined,
      { devDefaults: false, db: { url: 'postgres://localhost/studio' } },
      { devDefaults: true, db: undefined },
      {
        devDefaults: true,
        db: { url: 'postgres://remote.example.org/studio' },
      },
      {
        devDefaults: true,
        db: { url: 'postgres://localhost/studio?host=remote.example.org' },
      },
    ];
    for (const context of cases)
      expect(() =>
        resolveEncryptionEnv({ NODE_ENV: 'development' }, context),
      ).toThrow(KeyConfigurationError);
    const development = resolveEncryptionEnv(
      {},
      { devDefaults: true, db: { url: 'postgres://localhost/studio' } },
    );
    expect(
      (
        await loadEncryptionKeys(
          development.configuration,
          development.loadRootKey,
        )
      ).currentId('pii-enc'),
    ).toBe('development-v1');
  });

  it('rejects malformed configuration and unrelated environment references without returning their content', async () => {
    const config = configuration();
    for (const source of [
      { STUDIO_ENCRYPTION_KEYSET: 'synthetic-secret-invalid-json' },
      { STUDIO_ENCRYPTION_KEYSET: JSON.stringify(config) },
    ]) {
      expect(() => resolveEncryptionEnv(source)).toThrow(
        'Studio encryption key configuration is invalid or unavailable.',
      );
    }
    config.roots = config.roots.map((root) => ({
      ...root,
      reference: `STUDIO_ENCRYPTION_ROOT_${root.reference}`,
    }));
    const missing = resolveEncryptionEnv({
      STUDIO_ENCRYPTION_KEYSET: JSON.stringify(config),
    });
    await expect(
      loadEncryptionKeys(missing.configuration, missing.loadRootKey),
    ).rejects.toThrow(KeyConfigurationError);
  });
});
