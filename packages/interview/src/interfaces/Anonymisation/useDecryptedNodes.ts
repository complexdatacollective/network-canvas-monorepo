'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
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
  decryptInScope,
  type EncryptedValue,
  getEncryptedValue,
  isNumberArray,
  readCachedPlaintext,
} from './decryptionScope';
import { isAttributeEncrypted } from './isAttributeEncrypted';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';

export type DecryptedNodes =
  | { status: 'ready'; nodes: NcNode[] }
  | { status: 'locked' }
  | { status: 'pending' }
  | { status: 'failed' };

type ProtectedNode = {
  node: NcNode;
  encrypted: { variable: string; value: EncryptedValue }[];
  /** Ciphertext with no metadata to decrypt it, which can never be shown. */
  unreadable: string[];
};

function describeNode(
  node: NcNode,
  variables: Record<string, Variable>,
  encryptionEnabled: boolean,
): ProtectedNode {
  const encrypted: ProtectedNode['encrypted'] = [];
  const unreadable: string[] = [];
  for (const [variable, data] of Object.entries(
    node[entityAttributesProperty],
  )) {
    if (!isAttributeEncrypted(encryptionEnabled, variables, variable)) continue;
    const value = getEncryptedValue(
      node,
      variable,
      variables,
      encryptionEnabled,
    );
    if (value) encrypted.push({ variable, value });
    else if (isNumberArray(data)) unreadable.push(variable);
  }
  return { node, encrypted, unreadable };
}

function readPlaintextNode(
  { node, encrypted, unreadable }: ProtectedNode,
  scope: DecryptionScope | undefined,
): NcNode {
  if (encrypted.length === 0 && unreadable.length === 0) return node;

  const attributes: Record<string, VariableValue> = {
    ...node[entityAttributesProperty],
  };
  const secureAttributes = { ...node[entitySecureAttributesMeta] };
  for (const variable of unreadable) delete attributes[variable];
  for (const { variable, value } of encrypted) {
    const plaintext = scope ? readCachedPlaintext(scope, value) : undefined;
    if (plaintext === undefined) delete attributes[variable];
    else attributes[variable] = plaintext;
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
 * Decrypts the encrypted attribute values of a list of nodes for display or
 * editing, through the decryption scope of the passphrase in force. Nodes
 * without encrypted values pass through untouched, so a list with none, or
 * any list while encryption is not in effect (see `isAttributeEncrypted`), is
 * ready immediately and needs no passphrase. Pass a memoized list: a new array
 * on every render restarts the work.
 *
 * Without a passphrase the result is `locked` and the passphrase is
 * requested. The plaintext is read from the scope rather than kept here, so it
 * is gone from the result as soon as the passphrase is.
 */
export function useDecryptedNodes(nodes: NcNode[]): DecryptedNodes {
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );
  const scope = useDecryptionScope();
  const { requirePassphrase, setPassphraseInvalid, isEnabled } =
    usePassphrase();
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [failedFor, setFailedFor] = useState<{
    scope: DecryptionScope;
    values: EncryptedValue[];
  }>();

  const protectedNodes = useMemo(
    () =>
      nodes.map((node) =>
        describeNode(
          node,
          getCodebookVariablesForNodeType(node.type),
          isEnabled,
        ),
      ),
    [nodes, getCodebookVariablesForNodeType, isEnabled],
  );
  const values = useMemo(
    () =>
      protectedNodes.flatMap(({ encrypted }) =>
        encrypted.map(({ value }) => value),
      ),
    [protectedNodes],
  );

  const decrypted =
    values.length === 0 ||
    (scope !== undefined &&
      values.every((value) => readCachedPlaintext(scope, value) !== undefined));

  const plaintextNodes = useMemo(() => {
    if (!decrypted) return undefined;
    const resolved = protectedNodes.map((entry) =>
      readPlaintextNode(entry, scope),
    );
    return resolved.every((node, index) => node === nodes[index])
      ? nodes
      : resolved;
  }, [decrypted, protectedNodes, scope, nodes]);

  useEffect(() => {
    if (values.length > 0 && !scope) requirePassphrase();
  }, [values, scope, requirePassphrase]);

  useEffect(() => {
    if (!scope || decrypted) return undefined;

    let current = true;
    Promise.all(values.map((value) => decryptInScope(scope, value))).then(
      () => {
        if (current) rerender();
      },
      () => {
        if (!current) return;
        setFailedFor({ scope, values });
        setPassphraseInvalid(true);
      },
    );
    return () => {
      current = false;
    };
  }, [scope, decrypted, values, setPassphraseInvalid]);

  if (plaintextNodes) return { status: 'ready', nodes: plaintextNodes };
  if (!scope) return { status: 'locked' };
  if (failedFor?.scope === scope && failedFor.values === values) {
    return { status: 'failed' };
  }
  return { status: 'pending' };
}
