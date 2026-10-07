'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { useSelector } from 'react-redux';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { makeGetCodebookVariablesForNodeType } from '../../selectors/protocol';
import {
  type DecryptionScope,
  type DecryptOutcome,
  decryptInScope,
  type EncryptedValue,
  readCachedOutcome,
  readEncryptedAttribute,
  type UnreadableReason,
} from './decryptionScope';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';
import { useReportUnreadable } from './useReportUnreadable';

export type DecryptedNodes =
  | { status: 'ready'; nodes: NcNode[] }
  | { status: 'locked' }
  | { status: 'pending' };

type ProtectedNode = {
  node: NcNode;
  encrypted: { variable: string; value: EncryptedValue }[];
  /** Stored ciphertext that can never be shown, and why. */
  unreadable: { variable: string; reason: UnreadableReason }[];
};

function describeNode(
  node: NcNode,
  variables: Record<string, Variable>,
): ProtectedNode {
  const encrypted: ProtectedNode['encrypted'] = [];
  const unreadable: ProtectedNode['unreadable'] = [];
  for (const variable of Object.keys(node[entityAttributesProperty])) {
    const stored = readEncryptedAttribute(node, variable, variables);
    if (stored?.status === 'encrypted') {
      encrypted.push({ variable, value: stored.value });
    } else if (stored?.status === 'unreadable') {
      unreadable.push({ variable, reason: stored.reason });
    }
  }
  return { node, encrypted, unreadable };
}

/**
 * The node with each encrypted value replaced by its plaintext. A value that
 * can never be read is left out, as if unanswered, so that its ciphertext is
 * never shown, compared or saved as though it were an answer.
 */
function readPlaintextNode(
  { node, encrypted, unreadable }: ProtectedNode,
  outcomeOf: (value: EncryptedValue) => DecryptOutcome | undefined,
): NcNode {
  if (encrypted.length === 0 && unreadable.length === 0) return node;

  const attributes: Record<string, VariableValue> = {
    ...node[entityAttributesProperty],
  };
  const secureAttributes = { ...node[entitySecureAttributesMeta] };
  for (const { variable } of unreadable) {
    delete attributes[variable];
    delete secureAttributes[variable];
  }
  for (const { variable, value } of encrypted) {
    const outcome = outcomeOf(value);
    if (outcome?.readable) attributes[variable] = outcome.plaintext;
    else delete attributes[variable];
    delete secureAttributes[variable];
  }

  const { [entitySecureAttributesMeta]: _stored, ...rest } = node;
  return {
    ...rest,
    [entityAttributesProperty]: attributes,
    ...(Object.keys(secureAttributes).length > 0
      ? { [entitySecureAttributesMeta]: secureAttributes }
      : {}),
  };
}

/**
 * The nodes with every encrypted value left out, for a caller that must not
 * see ciphertext while the values cannot be decrypted yet.
 */
export function omitEncryptedValues(
  nodes: NcNode[],
  getVariables: (type: string) => Record<string, Variable>,
): NcNode[] {
  return nodes.map((node) =>
    readPlaintextNode(
      describeNode(node, getVariables(node.type)),
      () => undefined,
    ),
  );
}

/**
 * The nodes with their encrypted values decrypted through `scope`, as
 * `useDecryptedNodes` makes them ready, for a caller that needs them now
 * rather than on a later render.
 */
export async function decryptNodes(
  nodes: NcNode[],
  scope: DecryptionScope,
  getVariables: (type: string) => Record<string, Variable>,
): Promise<NcNode[]> {
  const protectedNodes = nodes.map((node) =>
    describeNode(node, getVariables(node.type)),
  );
  const outcomes = new Map<EncryptedValue, DecryptOutcome>();
  await Promise.all(
    protectedNodes.flatMap(({ encrypted }) =>
      encrypted.map(async ({ value }) => {
        outcomes.set(value, await decryptInScope(scope, value));
      }),
    ),
  );
  return protectedNodes.map((entry) =>
    readPlaintextNode(entry, (value) => outcomes.get(value)),
  );
}

/**
 * Decrypts the encrypted attribute values of a list of nodes for display or
 * editing, with the interview's key. Nodes without encrypted values pass
 * through untouched, so a list with none is ready immediately and needs no
 * passphrase. Pass a memoized list: a new array on every render restarts the
 * work.
 *
 * Without the key the result is `locked` and the passphrase is requested.
 * The plaintext is read from the key's decryption scope rather than kept here,
 * so it is gone from the result as soon as the key is. Values that can never
 * be read are left out of the nodes and reported.
 */
export function useDecryptedNodes(nodes: NcNode[]): DecryptedNodes {
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );
  const scope = useDecryptionScope();
  const { requirePassphrase, encryptionUnavailable } = usePassphrase();
  const reportUnreadable = useReportUnreadable();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const protectedNodes = useMemo(
    () =>
      nodes.map((node) =>
        describeNode(node, getCodebookVariablesForNodeType(node.type)),
      ),
    [nodes, getCodebookVariablesForNodeType],
  );
  const values = useMemo(
    () =>
      protectedNodes.flatMap(({ encrypted }) =>
        encrypted.map(({ value }) => value),
      ),
    [protectedNodes],
  );
  const storedUnreadable = useMemo(
    () =>
      new Set(
        protectedNodes.flatMap(({ unreadable }) =>
          unreadable.map(({ reason }) => reason),
        ),
      ),
    [protectedNodes],
  );

  // No key is ever derived under a refused header, so its values are as
  // unreadable as those that could never be decrypted.
  const decrypted =
    values.length === 0 ||
    encryptionUnavailable ||
    (scope !== undefined &&
      values.every((value) => readCachedOutcome(scope, value) !== undefined));
  const decryptionFailed =
    decrypted &&
    scope !== undefined &&
    values.some((value) => readCachedOutcome(scope, value)?.readable === false);

  const plaintextNodes = useMemo(() => {
    if (!decrypted) return undefined;
    const resolved = protectedNodes.map((entry) =>
      readPlaintextNode(entry, (value) =>
        scope ? readCachedOutcome(scope, value) : undefined,
      ),
    );
    return resolved.every((node, index) => node === nodes[index])
      ? nodes
      : resolved;
  }, [decrypted, protectedNodes, scope, nodes]);

  useEffect(() => {
    for (const reason of storedUnreadable) reportUnreadable(reason);
    if (decryptionFailed) reportUnreadable('decryption-failed');
  }, [storedUnreadable, decryptionFailed, reportUnreadable]);

  useEffect(() => {
    if (values.length > 0 && !scope) requirePassphrase();
  }, [values, scope, requirePassphrase]);

  useEffect(() => {
    if (!scope || decrypted) return undefined;

    let current = true;
    void Promise.all(values.map((value) => decryptInScope(scope, value))).then(
      () => {
        if (current) rerender();
      },
    );
    return () => {
      current = false;
    };
  }, [scope, decrypted, values]);

  if (plaintextNodes) return { status: 'ready', nodes: plaintextNodes };
  if (!scope) return { status: 'locked' };
  return { status: 'pending' };
}
