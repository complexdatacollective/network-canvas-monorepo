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
 * The variables stored encrypted (see `isAttributeEncrypted`) that the rules
 * of these variables read from the network, by whose values they read:
 * `unique` reads its own variable on every other person (`others`), and each
 * rule that names another variable (`sameAs`, `differentFrom` and the
 * comparisons) reads that variable on the person being edited (`current`),
 * when the form does not hold it.
 */
function getComparedEncryptedVariables(
  variables: Record<string, Variable>,
  variableIds: readonly string[],
  encryptionEnabled: boolean,
): { others: string[]; current: string[] } {
  const isEncrypted = (id: string) =>
    isAttributeEncrypted(encryptionEnabled, variables, id);
  const others = new Set<string>();
  const current = new Set<string>();
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
      others.add(variableId);
    }
    for (const [rule, target] of Object.entries(validation)) {
      if (
        isReferenceRule(rule) &&
        typeof target === 'string' &&
        isEncrypted(target)
      ) {
        current.add(target);
      }
    }
  }
  return { others: [...others].toSorted(), current: [...current].toSorted() };
}

// A key rather than the array, so callers may pass a fresh `variableIds` on
// every render without restarting the decryption. Variable ids cannot contain
// a space (`VariableNameSchema`).
const fromKey = (key: string) => (key === '' ? [] : key.split(' '));

/** The network with each of `plaintextNodes` in place of the node it reads. */
const withPlaintextNodes = (
  network: NcNetwork,
  plaintextNodes: NcNode[],
): NcNetwork => {
  if (plaintextNodes.length === 0) return network;
  const byId = new Map(plaintextNodes.map((node) => [node._uid, node]));
  return {
    ...network,
    nodes: network.nodes.map((node) => byId.get(node._uid) ?? node),
  };
};

type DecryptionStatus = ReturnType<typeof useDecryptedNodes>['status'];

const combinedStatus = (statuses: DecryptionStatus[]): DecryptionStatus => {
  if (statuses.includes('locked')) return 'locked';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('pending')) return 'pending';
  return 'ready';
};

const unavailable = (message: string) => () =>
  Promise.reject(new Error(message));

/**
 * The network that the validation rules of these variables' fields compare
 * against, to spread into their validation context alongside
 * `currentEntityId`, the person being edited (none for a new one). When a rule
 * compares with values stored encrypted, those values come back decrypted,
 * and the passphrase is asked for if it is not known yet. Only the values the
 * rules read are decrypted: `unique` on every other person, and the variables
 * the other rules name on the person being edited. Everything else stays as
 * stored, so an answer no rule reads, saved under another passphrase, can
 * neither block validation nor flag the passphrase. Until they are decrypted,
 * `resolveNetwork` stands in: a validation run waits for the decryption, or
 * fails with the reason when no working passphrase is in force, so a value is
 * never checked against ciphertext. For every other form it is the network as
 * stored.
 */
export function useValidationNetwork(
  { codebook, network }: { codebook: Codebook; network: NcNetwork },
  subject: StageSubject | null,
  variableIds: readonly string[],
  currentEntityId: string | undefined,
): Pick<ValidationContext, 'network' | 'resolveNetwork'> {
  // Only node variables can be encrypted.
  const subjectType = subject?.entity === 'node' ? subject.type : undefined;
  const variables =
    (subjectType !== undefined
      ? codebook.node?.[subjectType]?.variables
      : undefined) ?? NO_VARIABLES;
  const { isEnabled } = usePassphrase();
  const compared = getComparedEncryptedVariables(
    variables,
    variableIds,
    isEnabled,
  );
  const othersKey = compared.others.join(' ');
  const currentKey = compared.current.join(' ');
  const othersRead = useMemo(() => fromKey(othersKey), [othersKey]);
  const currentRead = useMemo(() => fromKey(currentKey), [currentKey]);

  const otherNodes = useMemo(() => {
    if (othersRead.length === 0 || subjectType === undefined) return NO_NODES;
    return network.nodes.filter(
      (node) => node.type === subjectType && node._uid !== currentEntityId,
    );
  }, [othersRead, subjectType, currentEntityId, network.nodes]);
  const currentNodes = useMemo(() => {
    if (currentRead.length === 0 || currentEntityId === undefined) {
      return NO_NODES;
    }
    return network.nodes.filter(
      (node) => node.type === subjectType && node._uid === currentEntityId,
    );
  }, [currentRead, subjectType, currentEntityId, network.nodes]);

  const decryptedOthers = useDecryptedNodes(otherNodes, othersRead);
  const decryptedCurrent = useDecryptedNodes(currentNodes, currentRead);
  const status = combinedStatus([
    decryptedOthers.status,
    decryptedCurrent.status,
  ]);
  const plaintextOthers =
    decryptedOthers.status === 'ready' ? decryptedOthers.nodes : NO_NODES;
  const plaintextCurrent =
    decryptedCurrent.status === 'ready' ? decryptedCurrent.nodes : NO_NODES;

  const scope = useDecryptionScope();
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );

  return useMemo(() => {
    if (status === 'ready') {
      return {
        network: withPlaintextNodes(network, [
          ...plaintextOthers,
          ...plaintextCurrent,
        ]),
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
        const decrypt = (nodes: NcNode[], reads: string[]) =>
          decryptNodes(
            nodes,
            reads,
            scope,
            getCodebookVariablesForNodeType,
            isEnabled,
          );
        const plaintextNodes = await Promise.all([
          decrypt(otherNodes, othersRead),
          decrypt(currentNodes, currentRead),
        ]).catch(() => {
          throw new Error(createMessageError(runtimeMessages.decryptRetry));
        });
        return withPlaintextNodes(network, plaintextNodes.flat());
      },
    };
  }, [
    status,
    network,
    plaintextOthers,
    plaintextCurrent,
    otherNodes,
    othersRead,
    currentNodes,
    currentRead,
    scope,
    getCodebookVariablesForNodeType,
    isEnabled,
  ]);
}
