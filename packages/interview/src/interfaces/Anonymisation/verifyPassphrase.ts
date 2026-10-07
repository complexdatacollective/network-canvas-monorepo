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

/**
 * Whether `candidate` is the passphrase this interview's data was encrypted
 * with: it must decrypt at least one stored value. With nothing encrypted yet,
 * including while encryption is not in effect, there is nothing to check
 * against, so any passphrase is accepted.
 */
export async function passphraseUnlocksNetwork(
  nodes: readonly NcNode[],
  codebook: Codebook,
  candidate: string,
  encryptionEnabled: boolean,
): Promise<boolean> {
  const values = encryptedValuesIn(nodes, codebook, encryptionEnabled);
  if (values.length === 0) return true;

  try {
    await Promise.any(values.map((value) => decryptData(value, candidate)));
    return true;
  } catch {
    return false;
  }
}
