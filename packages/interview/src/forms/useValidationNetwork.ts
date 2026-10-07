'use client';

import { useMemo } from 'react';

import type {
  Codebook,
  StageSubject,
  Variable,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { useDecryptedNodes } from '../interfaces/Anonymisation/useDecryptedNodes';

const NO_NODES: NcNode[] = [];

/**
 * Whether validating this variable compares with values stored encrypted:
 * `unique` reads every other person's value for it, and `sameAs` and
 * `differentFrom` fall back to the stored value of the variable they name.
 */
function comparesEncryptedValues(
  variables: Record<string, Variable>,
  variableId: string,
): boolean {
  const variable = variables[variableId];
  if (!variable || !('validation' in variable) || !variable.validation) {
    return false;
  }
  const { validation } = variable;
  if ('unique' in validation && validation.unique && variable.encrypted) {
    return true;
  }
  const targets = [
    'sameAs' in validation ? validation.sameAs : undefined,
    'differentFrom' in validation ? validation.differentFrom : undefined,
  ];
  return targets.some(
    (target) => target !== undefined && !!variables[target]?.encrypted,
  );
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
  const comparesEncrypted = variableIds.some((variableId) =>
    comparesEncryptedValues(variables, variableId),
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
