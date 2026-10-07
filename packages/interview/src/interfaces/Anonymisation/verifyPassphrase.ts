import type { Codebook } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { type EncryptedValue, getEncryptedValue } from './decryptionScope';
import { decryptData } from './utils';

function encryptedValuesIn(
  nodes: readonly NcNode[],
  codebook: Codebook,
  encryptionEnabled: boolean,
): EncryptedValue[] {
  return nodes.flatMap((node) => {
    const variables = codebook.node?.[node.type]?.variables ?? {};
    return Object.keys(node[entityAttributesProperty]).flatMap(
      (attributeId) =>
        getEncryptedValue(node, attributeId, variables, encryptionEnabled) ??
        [],
    );
  });
}

const CONCURRENT_ATTEMPTS = 4;

/**
 * Whether `candidate` is the passphrase this interview's data was encrypted
 * with: it must decrypt at least one stored value. With nothing encrypted yet,
 * including while encryption is not in effect, there is nothing to check
 * against, so any passphrase is accepted.
 *
 * Every value has its own salt, so each attempt is a full key derivation. Only
 * a few run at once, and none is started after one has succeeded.
 */
export async function passphraseUnlocksNetwork(
  nodes: readonly NcNode[],
  codebook: Codebook,
  candidate: string,
  encryptionEnabled: boolean,
): Promise<boolean> {
  const values = encryptedValuesIn(nodes, codebook, encryptionEnabled);
  if (values.length === 0) return true;

  let unlocked = false;
  let next = 0;
  const tryRemaining = async () => {
    while (!unlocked && next < values.length) {
      const value = values[next];
      next += 1;
      if (!value) return;
      const decrypted = await decryptData(value, candidate).then(
        () => true,
        () => false,
      );
      if (decrypted) unlocked = true;
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENT_ATTEMPTS, values.length) },
      tryRemaining,
    ),
  );
  return unlocked;
}
