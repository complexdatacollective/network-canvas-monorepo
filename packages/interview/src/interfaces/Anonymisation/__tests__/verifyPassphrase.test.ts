import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { passphraseUnlocksNetwork } from '../verifyPassphrase';
import {
  makeEncryptedPerson,
  NODE_TYPE,
  personDefinition,
} from './encryptionFixtures';

const codebook: Codebook = {
  node: { [NODE_TYPE]: personDefinition },
};

function people(count: number, passphrase: string) {
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      makeEncryptedPerson(`n${index}`, `Person ${index}`, passphrase),
    ),
  );
}

/** Counts key derivations, and the most that were running at once. */
function watchKeyDerivations() {
  const deriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
  const watched = { started: 0, running: 0, mostAtOnce: 0 };
  vi.spyOn(crypto.subtle, 'deriveKey').mockImplementation(
    async (algorithm, baseKey, derivedKeyType, extractable, keyUsages) => {
      watched.started += 1;
      watched.running += 1;
      watched.mostAtOnce = Math.max(watched.mostAtOnce, watched.running);
      try {
        return await deriveKey(
          algorithm,
          baseKey,
          derivedKeyType,
          extractable,
          keyUsages,
        );
      } finally {
        watched.running -= 1;
      }
    },
  );
  return watched;
}

describe('passphraseUnlocksNetwork', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts any passphrase while nothing is encrypted', async () => {
    const plain = {
      [entityPrimaryKeyProperty]: 'n1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { name: 'Alice' },
    };

    await expect(
      passphraseUnlocksNetwork([plain], codebook, 'anything', true),
    ).resolves.toBe(true);
  });

  it('accepts the passphrase the saved values were encrypted with', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    await expect(
      passphraseUnlocksNetwork([node], codebook, 'pw', true),
    ).resolves.toBe(true);
  });

  it('rejects a passphrase that decrypts none of the saved values', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    await expect(
      passphraseUnlocksNetwork([node], codebook, 'wrong', true),
    ).resolves.toBe(false);
  });

  it('accepts a passphrase that decrypts at least one saved value', async () => {
    const nodes = [
      await makeEncryptedPerson('n1', 'Alice', 'other'),
      await makeEncryptedPerson('n2', 'Bea', 'pw'),
    ];

    await expect(
      passphraseUnlocksNetwork(nodes, codebook, 'pw', true),
    ).resolves.toBe(true);
  });

  it('treats nothing as encrypted, so accepts any passphrase, while the experiment is off', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    await expect(
      passphraseUnlocksNetwork([node], codebook, 'wrong', false),
    ).resolves.toBe(true);
  });

  it('stops trying saved values once one has been decrypted', async () => {
    const nodes = await people(12, 'pw');
    const derivations = watchKeyDerivations();

    await expect(
      passphraseUnlocksNetwork(nodes, codebook, 'pw', true),
    ).resolves.toBe(true);
    expect(derivations.started).toBeLessThanOrEqual(4);
  });

  it('tries only a few saved values at a time', async () => {
    const nodes = await people(12, 'pw');
    const derivations = watchKeyDerivations();

    await expect(
      passphraseUnlocksNetwork(nodes, codebook, 'wrong', true),
    ).resolves.toBe(false);
    expect(derivations.started).toBe(12);
    expect(derivations.mostAtOnce).toBeLessThanOrEqual(4);
  });
});
