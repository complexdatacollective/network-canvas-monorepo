'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import type {
  Codebook,
  StageSubject,
  Variable,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { isAttributeEncrypted } from '../interfaces/Anonymisation/isAttributeEncrypted';
import {
  decryptNodes,
  useDecryptedNodes,
} from '../interfaces/Anonymisation/useDecryptedNodes';
import { useDecryptionScope } from '../interfaces/Anonymisation/useDecryptionScope';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import { makeGetCodebookVariablesForNodeType } from '../selectors/protocol';

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
 * against, to spread into their validation context. When a rule compares with
 * values stored encrypted, the nodes come back with those values decrypted,
 * and the passphrase is asked for if it is not known yet. While they are being
 * decrypted, `resolveNetwork` makes a validation run wait for them, so a value
 * is never checked against ciphertext. For every other form it is the network
 * as stored.
 */
export function useValidationNetwork(
  { codebook, network }: { codebook: Codebook; network: NcNetwork },
  subject: StageSubject | null,
  variableIds: readonly string[],
): Pick<ValidationContext, 'network' | 'resolveNetwork'> {
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
  const pending = comparesEncrypted && decrypted.status === 'pending';

  const scope = useDecryptionScope();
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );

  return useMemo(() => {
    const comparedNetwork =
      nodes === network.nodes ? network : { ...network, nodes };
    if (!pending || !scope) return { network: comparedNetwork };
    return {
      network: comparedNetwork,
      resolveNetwork: async () => ({
        ...network,
        nodes: await decryptNodes(
          network.nodes,
          scope,
          getCodebookVariablesForNodeType,
          isEnabled,
        ),
      }),
    };
  }, [
    network,
    nodes,
    pending,
    scope,
    getCodebookVariablesForNodeType,
    isEnabled,
  ]);
}
