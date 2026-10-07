'use client';

import { useMemo } from 'react';

import type {
  Codebook,
  StageSubject,
  Variable,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { isAttributeEncrypted } from '../interfaces/Anonymisation/isAttributeEncrypted';
import { useDecryptedNodes } from '../interfaces/Anonymisation/useDecryptedNodes';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';

const NO_NODES: NcNode[] = [];

/**
 * Whether validating this variable compares with values stored encrypted (see
 * `isAttributeEncrypted`): `unique` reads every other person's value for it,
 * and `sameAs` and `differentFrom` fall back to the stored value of the
 * variable they name.
 */
function comparesEncryptedValues(
  variables: Record<string, Variable>,
  variableId: string,
  encryptionEnabled: boolean,
): boolean {
  const variable = variables[variableId];
  if (!variable || !('validation' in variable) || !variable.validation) {
    return false;
  }
  const isEncrypted = (id: string) =>
    isAttributeEncrypted(encryptionEnabled, variables, id);
  const { validation } = variable;
  if ('unique' in validation && validation.unique && isEncrypted(variableId)) {
    return true;
  }
  const targets = [
    'sameAs' in validation ? validation.sameAs : undefined,
    'differentFrom' in validation ? validation.differentFrom : undefined,
  ];
  return targets.some((target) => target !== undefined && isEncrypted(target));
}

/**
 * The network that the validation rules of these variables' fields compare
 * against. When a rule compares with values stored encrypted, the nodes come
 * back with those values decrypted, and the passphrase is asked for if it is
 * not known yet. Until the values are decrypted, and for every other form, it
 * is the network as stored.
 */
export function useValidationNetwork(
  { codebook, network }: { codebook: Codebook; network: NcNetwork },
  subject: StageSubject | null,
  variableIds: readonly string[],
): NcNetwork {
  // Only node variables can be encrypted.
  const variables =
    subject?.entity === 'node'
      ? (codebook.node?.[subject.type]?.variables ?? {})
      : {};
  const { isEnabled } = usePassphrase();
  const comparesEncrypted = variableIds.some((variableId) =>
    comparesEncryptedValues(variables, variableId, isEnabled),
  );

  const decrypted = useDecryptedNodes(
    comparesEncrypted ? network.nodes : NO_NODES,
  );
  const nodes =
    comparesEncrypted && decrypted.status === 'ready'
      ? decrypted.nodes
      : network.nodes;

  return useMemo(
    () => (nodes === network.nodes ? network : { ...network, nodes }),
    [network, nodes],
  );
}
