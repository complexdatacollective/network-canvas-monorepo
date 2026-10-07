import type { Codebook } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { type EncryptedValue, getEncryptedValue } from './decryptionScope';
import { decryptData } from './utils';

function encryptedValuesIn(
  nodes: readonly NcNode[],
  codebook: Codebook,
): EncryptedValue[] {
  return nodes.flatMap((node) => {
    const variables = codebook.node?.[node.type]?.variables ?? {};
    return Object.keys(node[entityAttributesProperty]).flatMap(
      (attributeId) => getEncryptedValue(node, attributeId, variables) ?? [],
    );
  });
}

/**
 * Whether `candidate` is the passphrase this interview's data was encrypted
 * with: it must decrypt at least one stored value. With nothing encrypted yet
 * there is nothing to check against, so any passphrase is accepted.
 */
export async function passphraseUnlocksNetwork(
  nodes: readonly NcNode[],
  codebook: Codebook,
  candidate: string,
): Promise<boolean> {
  const values = encryptedValuesIn(nodes, codebook);
  if (values.length === 0) return true;

  try {
    await Promise.any(values.map((value) => decryptData(value, candidate)));
    return true;
  } catch {
    return false;
  }
}
