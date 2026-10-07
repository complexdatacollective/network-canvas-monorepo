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
import { type NcNetwork, type NcNode } from '@codaco/shared-consts';

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
const NO_VARIABLES: Record<string, Variable> = {};

const isReferenceRule = (rule: string) =>
  VARIABLE_REFERENCE_VALIDATIONS.some((reference) => reference === rule);

/**
 * The variables stored encrypted (see `isAttributeEncrypted`) whose values the
 * rules of these variables compare with: `unique` reads every other person's
 * value for its own variable, and each rule that names another variable
 * (`sameAs`, `differentFrom` and the comparisons) falls back to that
 * variable's stored value.
 */
function getComparedEncryptedVariables(
  variables: Record<string, Variable>,
  variableIds: readonly string[],
  encryptionEnabled: boolean,
): string[] {
  const isEncrypted = (id: string) =>
    isAttributeEncrypted(encryptionEnabled, variables, id);
  const compared = new Set<string>();
  for (const variableId of variableIds) {
    const variable = variables[variableId];
    if (!variable || !('validation' in variable) || !variable.validation) {
      continue;
    }
    const { validation } = variable;
    if (
      'unique' in validation &&
      validation.unique &&
      isEncrypted(variableId)
    ) {
      compared.add(variableId);
    }
    for (const [rule, target] of Object.entries(validation)) {
      if (
        isReferenceRule(rule) &&
        typeof target === 'string' &&
        isEncrypted(target)
      ) {
        compared.add(target);
      }
    }
  }
  return [...compared].toSorted();
}

/** The network with its nodes of `type` replaced by `subjectNodes`. */
const withSubjectNodes = (
  network: NcNetwork,
  type: string,
  subjectNodes: NcNode[],
): NcNetwork => ({
  ...network,
  nodes: [
    ...network.nodes.filter((node) => node.type !== type),
    ...subjectNodes,
  ],
});

const unavailable = (message: string) => () =>
  Promise.reject(new Error(message));

/**
 * The network that the validation rules of these variables' fields compare
 * against, to spread into their validation context. When a rule compares with
 * values stored encrypted, the subject's nodes come back with those values
 * decrypted, and the passphrase is asked for if it is not known yet. Only the
 * compared values are decrypted; the subject's other encrypted values are left
 * out. Until they are decrypted, `resolveNetwork` stands in: a validation run
 * waits for the decryption, or fails with the reason when no working
 * passphrase is in force, so a value is never checked against ciphertext. For
 * every other form it is the network as stored.
 */
export function useValidationNetwork(
  { codebook, network }: { codebook: Codebook; network: NcNetwork },
  subject: StageSubject | null,
  variableIds: readonly string[],
): Pick<ValidationContext, 'network' | 'resolveNetwork'> {
  // Only node variables can be encrypted.
  const subjectType = subject?.entity === 'node' ? subject.type : undefined;
  const variables =
    (subjectType !== undefined
      ? codebook.node?.[subjectType]?.variables
      : undefined) ?? NO_VARIABLES;
  const { isEnabled } = usePassphrase();
  // A key rather than the array, so callers may pass a fresh `variableIds`
  // on every render without restarting the decryption. Variable ids cannot
  // contain a space (`VariableNameSchema`).
  const comparedKey = getComparedEncryptedVariables(
    variables,
    variableIds,
    isEnabled,
  ).join(' ');
  const compared = useMemo(
    () => (comparedKey === '' ? [] : comparedKey.split(' ')),
    [comparedKey],
  );

  const comparedNodes = useMemo(() => {
    if (compared.length === 0 || subjectType === undefined) return NO_NODES;
    return network.nodes.filter((node) => node.type === subjectType);
  }, [compared, subjectType, network.nodes]);

  const decrypted = useDecryptedNodes(comparedNodes, compared);
  const comparesEncrypted = comparedNodes !== NO_NODES;
  const status = comparesEncrypted ? decrypted.status : 'ready';
  const decryptedNodes =
    comparesEncrypted && decrypted.status === 'ready'
      ? decrypted.nodes
      : undefined;

  const scope = useDecryptionScope();
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );

  return useMemo(() => {
    if (status === 'ready') {
      return {
        network:
          decryptedNodes && subjectType !== undefined
            ? withSubjectNodes(network, subjectType, decryptedNodes)
            : network,
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
          comparedNodes,
          compared,
          scope,
          getCodebookVariablesForNodeType,
          isEnabled,
        ).catch(() => {
          throw new Error(createMessageError(runtimeMessages.decryptRetry));
        });
        return subjectType === undefined
          ? network
          : withSubjectNodes(network, subjectType, plaintextNodes);
      },
    };
  }, [
    status,
    network,
    decryptedNodes,
    comparedNodes,
    compared,
    subjectType,
    scope,
    getCodebookVariablesForNodeType,
    isEnabled,
  ]);
}
