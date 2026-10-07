'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  type Codebook,
  type StageSubject,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { runtimeMessages } from '../i18n/runtimeMessages';
import {
  decryptNodes,
  omitEncryptedValues,
  useDecryptedNodes,
} from '../interfaces/Anonymisation/useDecryptedNodes';
import { useDecryptionScope } from '../interfaces/Anonymisation/useDecryptionScope';
import { makeGetCodebookVariablesForNodeType } from '../selectors/protocol';

const NO_NODES: NcNode[] = [];

const namesAnotherVariable = (rule: string) =>
  VARIABLE_REFERENCE_VALIDATIONS.some((reference) => reference === rule);

/**
 * Whether validating this variable compares with values stored encrypted:
 * `unique` reads every other person's value for it, and every rule that names
 * another variable falls back to that variable's stored value.
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
  return Object.entries(validation).some(
    ([rule, target]) =>
      namesAnotherVariable(rule) &&
      typeof target === 'string' &&
      !!variables[target]?.encrypted,
  );
}

/**
 * The network that the validation rules of these variables' fields compare
 * against, to spread into their validation context. When a rule compares with
 * values stored encrypted, the nodes come back with those values decrypted,
 * and the passphrase is asked for if it is not known yet. Until they are
 * decrypted the network leaves them out: while they are being decrypted,
 * `resolveNetwork` makes a validation run wait for them, and while the key is
 * not in force it fails the run with an error asking for the passphrase, so a
 * value is never checked against ciphertext. A stored value its key cannot
 * read is left out, as if unanswered, and so is every encrypted value under
 * an encryption header no passphrase can open: no rule then waits for a
 * passphrase that could not be entered, and each comparison with a protected
 * answer is skipped as it is for an unanswered one. For every other form it
 * is the network as stored.
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
  const comparesEncrypted = variableIds.some((variableId) =>
    comparesEncryptedValues(variables, variableId),
  );

  const decrypted = useDecryptedNodes(
    comparesEncrypted ? network.nodes : NO_NODES,
  );
  const status = comparesEncrypted ? decrypted.status : 'ready';
  const readyNodes =
    decrypted.status === 'ready' ? decrypted.nodes : network.nodes;

  const scope = useDecryptionScope();
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );

  return useMemo(() => {
    if (status === 'ready') {
      const nodes = comparesEncrypted ? readyNodes : network.nodes;
      return {
        network: nodes === network.nodes ? network : { ...network, nodes },
      };
    }

    const withoutCiphertext = {
      ...network,
      nodes: omitEncryptedValues(
        network.nodes,
        getCodebookVariablesForNodeType,
      ),
    };
    if (status === 'locked' || !scope) {
      return {
        network: withoutCiphertext,
        resolveNetwork: () =>
          Promise.reject(
            new Error(
              createMessageError(runtimeMessages.protectedAnswersNotChecked),
            ),
          ),
      };
    }
    return {
      network: withoutCiphertext,
      resolveNetwork: async () => ({
        ...network,
        nodes: await decryptNodes(
          network.nodes,
          scope,
          getCodebookVariablesForNodeType,
        ),
      }),
    };
  }, [
    network,
    status,
    comparesEncrypted,
    readyNodes,
    scope,
    getCodebookVariablesForNodeType,
  ]);
}
