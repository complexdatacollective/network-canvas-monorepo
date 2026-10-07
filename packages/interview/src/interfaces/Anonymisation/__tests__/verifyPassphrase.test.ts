import { describe, expect, it } from 'vitest';

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

describe('passphraseUnlocksNetwork', () => {
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
});
