'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  type Codebook,
  type StageSubject,
  VARIABLE_REFERENCE_VALIDATIONS,
  type Variable,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode } from '@codaco/shared-consts';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { isAttributeEncrypted } from '../interfaces/Anonymisation/isAttributeEncrypted';
import {
  decryptNodes,
  useDecryptedNodes,
} from '../interfaces/Anonymisation/useDecryptedNodes';
import { useDecryptionScope } from '../interfaces/Anonymisation/useDecryptionScope';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import { makeGetCodebookVariablesForNodeType } from '../selectors/protocol';

const NO_NODES: NcNode[] = [];

const isReferenceRule = (rule: string) =>
  VARIABLE_REFERENCE_VALIDATIONS.some((reference) => reference === rule);

/**
 * Whether validating this variable compares with values stored encrypted (see
 * `isAttributeEncrypted`): `unique` reads every other person's value for it,
 * and each rule that names another variable (`sameAs`, `differentFrom` and the
 * comparisons) falls back to that variable's stored value.
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
  return Object.entries(validation).some(
    ([rule, target]) =>
      isReferenceRule(rule) &&
      typeof target === 'string' &&
      isEncrypted(target),
  );
}

const unavailable = (message: string) => () =>
  Promise.reject(new Error(message));

/**
 * The network that the validation rules of these variables' fields compare
 * against, to spread into their validation context. When a rule compares with
 * values stored encrypted, the nodes come back with those values decrypted,
 * and the passphrase is asked for if it is not known yet. Until they are
 * decrypted, `resolveNetwork` stands in: a validation run waits for the
 * decryption, or fails with the reason when no working passphrase is in force,
 * so a value is never checked against ciphertext. For every other form it is
 * the network as stored.
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
  const status = comparesEncrypted ? decrypted.status : 'ready';
  const nodes =
    comparesEncrypted && decrypted.status === 'ready'
      ? decrypted.nodes
      : network.nodes;

  const scope = useDecryptionScope();
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );

  return useMemo(() => {
    if (status === 'ready') {
      return {
        network: nodes === network.nodes ? network : { ...network, nodes },
      };
    }
    if (status === 'locked' || !scope) {
      return {
        network,
        resolveNetwork: unavailable(
          createMessageError(runtimeMessages.protectedAnswersNotSaved),
        ),
      };
    }
    if (status === 'failed') {
      return {
        network,
        resolveNetwork: unavailable(
          createMessageError(runtimeMessages.decryptRetry),
        ),
      };
    }
    return {
      network,
      resolveNetwork: async () => {
        const plaintextNodes = await decryptNodes(
          network.nodes,
          scope,
          getCodebookVariablesForNodeType,
          isEnabled,
        ).catch(() => {
          throw new Error(createMessageError(runtimeMessages.decryptRetry));
        });
        return { ...network, nodes: plaintextNodes };
      },
    };
  }, [
    status,
    network,
    nodes,
    scope,
    getCodebookVariablesForNodeType,
    isEnabled,
  ]);
}
