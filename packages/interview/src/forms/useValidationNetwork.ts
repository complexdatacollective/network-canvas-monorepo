'use client';

import { useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  type Codebook,
  type StageSubject,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { readEncryptedAttribute } from '../interfaces/Anonymisation/decryptionScope';
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
 * Whether validating this variable compares with values stored encrypted, of
 * the stored answers its rules read: `unique` reads every other person's value
 * for it, and a rule that names another variable falls back to that
 * variable's value stored on the person being edited, so for a new person
 * (`currentEntityId` undefined) it reads none. Each stored value is read as
 * its node records it, so a value stored encrypted under a variable the
 * codebook no longer encrypts counts, and one the codebook encrypts but that
 * was stored in the clear does not.
 */
function comparesEncryptedValues(
  variables: Record<string, Variable>,
  variableId: string,
  nodes: readonly NcNode[],
  currentEntityId: string | undefined,
): boolean {
  const variable = variables[variableId];
  if (!variable || !('validation' in variable) || !variable.validation) {
    return false;
  }
  const storedEncrypted = (target: string, readNodes: readonly NcNode[]) =>
    readNodes.some(
      (node) => readEncryptedAttribute(node, target, variables) !== undefined,
    );
  const isCurrent = (node: NcNode) =>
    currentEntityId !== undefined &&
    node[entityPrimaryKeyProperty] === currentEntityId;
  const { validation } = variable;
  if (
    'unique' in validation &&
    validation.unique &&
    storedEncrypted(
      variableId,
      nodes.filter((node) => !isCurrent(node)),
    )
  ) {
    return true;
  }
  const currentNodes = nodes.filter(isCurrent);
  return Object.entries(validation).some(
    ([rule, target]) =>
      namesAnotherVariable(rule) &&
      typeof target === 'string' &&
      storedEncrypted(target, currentNodes),
  );
}

/**
 * The network that the validation rules of these variables' fields compare
 * against, as `context`, to spread into their validation context, for the
 * person `currentEntityId` names, or a new person when it is undefined. When
 * a rule compares with values stored encrypted, the nodes come back with
 * those values decrypted, and the passphrase is asked for if it is not known
 * yet. Until they are decrypted the network leaves them out: while they are
 * being decrypted, `resolveNetwork` makes a validation run wait for them, and
 * while the key is not in force it fails the run with an error asking for the
 * passphrase, so a value is never checked against ciphertext. That is when
 * `passphraseNeeded` is true, for a modal form to offer the passphrase that
 * the navigation cannot while the modal is open. A stored value its key
 * cannot read is left out, as if unanswered, and so is every encrypted value
 * under an encryption header no passphrase can open: no rule then waits for a
 * passphrase that could not be entered, and each comparison with a protected
 * answer is skipped as it is for an unanswered one. A run that waited
 * compares with the network as it is once the wait is over, since people can
 * be added or changed elsewhere on the stage meanwhile. For every other form
 * it is the network as stored.
 */
export function useValidationNetwork(
  { codebook, network }: { codebook: Codebook; network: NcNetwork },
  subject: StageSubject | null,
  variableIds: readonly string[],
  currentEntityId: string | undefined,
): {
  context: Pick<ValidationContext, 'network' | 'resolveNetwork'>;
  passphraseNeeded: boolean;
} {
  // Only node variables can be encrypted, and a rule compares with nodes of
  // the subject's own type.
  const nodeType = subject?.entity === 'node' ? subject.type : undefined;
  const variables =
    nodeType === undefined ? {} : (codebook.node?.[nodeType]?.variables ?? {});
  const comparesEncrypted = useMemo(() => {
    const nodesOfType = network.nodes.filter((node) => node.type === nodeType);
    return variableIds.some((variableId) =>
      comparesEncryptedValues(
        variables,
        variableId,
        nodesOfType,
        currentEntityId,
      ),
    );
  }, [network.nodes, nodeType, variables, variableIds, currentEntityId]);

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

  const latestNetwork = useRef(network);
  latestNetwork.current = network;

  const context = useMemo(() => {
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
              createMessageError(runtimeMessages.protectedAnswersNotSaved),
            ),
          ),
      };
    }
    // Values already decrypted come back from the scope's cache, so going
    // round again after a change costs only the values that changed.
    const resolveLatest = async (): Promise<NcNetwork> => {
      const checkedAgainst = latestNetwork.current;
      const nodes = await decryptNodes(
        checkedAgainst.nodes,
        scope,
        getCodebookVariablesForNodeType,
      );
      if (latestNetwork.current !== checkedAgainst) return resolveLatest();
      return { ...checkedAgainst, nodes };
    };
    return { network: withoutCiphertext, resolveNetwork: resolveLatest };
  }, [
    network,
    status,
    comparesEncrypted,
    readyNodes,
    scope,
    getCodebookVariablesForNodeType,
  ]);

  return { context, passphraseNeeded: status === 'locked' };
}
