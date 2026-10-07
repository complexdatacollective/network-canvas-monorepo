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
  /**
   * Ciphertext left out of the result: values the caller does not read, which
   * are never decrypted, and values with no metadata to decrypt them, which
   * can never be shown.
   */
  omitted: string[];
};

function describeNode(
  node: NcNode,
  variables: Record<string, Variable>,
  encryptionEnabled: boolean,
  reads: ReadonlySet<string>,
): ProtectedNode {
  const encrypted: ProtectedNode['encrypted'] = [];
  const omitted: string[] = [];
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
    if (value && reads.has(variable)) encrypted.push({ variable, value });
    else if (value || isNumberArray(data)) omitted.push(variable);
  }
  return { node, encrypted, omitted };
}

function readPlaintextNode(
  { node, encrypted, omitted }: ProtectedNode,
  plaintextOf: (value: EncryptedValue) => string | undefined,
): NcNode {
  if (encrypted.length === 0 && omitted.length === 0) return node;

  const attributes: Record<string, VariableValue> = {
    ...node[entityAttributesProperty],
  };
  const secureAttributes = { ...node[entitySecureAttributesMeta] };
  for (const variable of omitted) {
    delete attributes[variable];
    delete secureAttributes[variable];
  }
  for (const { variable, value } of encrypted) {
    const plaintext = plaintextOf(value);
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
 * The nodes with the encrypted values of the variables in `reads` decrypted
 * through `scope`, as `useDecryptedNodes` makes them ready, for a caller that
 * needs them now rather than on a later render. Only values encrypted in this
 * interview (see `isAttributeEncrypted`) are decrypted, and other encrypted
 * values are left out. Rejects if any value read fails to decrypt.
 */
export async function decryptNodes(
  nodes: NcNode[],
  reads: readonly string[],
  scope: DecryptionScope,
  getVariables: (type: string) => Record<string, Variable>,
  encryptionEnabled: boolean,
): Promise<NcNode[]> {
  const readSet = new Set(reads);
  const protectedNodes = nodes.map((node) =>
    describeNode(node, getVariables(node.type), encryptionEnabled, readSet),
  );
  const plaintexts = new Map<EncryptedValue, string>();
  await Promise.all(
    protectedNodes.flatMap(({ encrypted }) =>
      encrypted.map(async ({ value }) => {
        plaintexts.set(value, await decryptInScope(scope, value));
      }),
    ),
  );
  return protectedNodes.map((entry) =>
    readPlaintextNode(entry, (value) => plaintexts.get(value)),
  );
}

/**
 * Decrypts the encrypted values of the variables in `reads` on a list of nodes
 * for display or editing, through the decryption scope of the passphrase in
 * force. `reads` names the variables the caller shows or uses. Encrypted
 * values of any other variable are left out of the result and never
 * decrypted, so a value the caller does not read can neither fail the result
 * nor flag the passphrase. Nodes without encrypted values pass through
 * untouched, so a list with none, or any list while encryption is not in
 * effect (see `isAttributeEncrypted`), is ready immediately and needs no
 * passphrase. Pass a memoized list of nodes: a new array on every render
 * restarts the work.
 *
 * Without a passphrase the result is `locked` and the passphrase is
 * requested. The plaintext is read from the scope rather than kept here, so it
 * is gone from the result as soon as the passphrase is.
 */
export function useDecryptedNodes(
  nodes: NcNode[],
  reads: readonly string[],
): DecryptedNodes {
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

  // A key rather than the array, so callers may pass a fresh `reads` on every
  // render without restarting the work. Variable ids cannot contain a space
  // (`VariableNameSchema`).
  const readsKey = [...new Set(reads)].toSorted().join(' ');
  const protectedNodes = useMemo(() => {
    const readSet = new Set(readsKey.split(' '));
    return nodes.map((node) =>
      describeNode(
        node,
        getCodebookVariablesForNodeType(node.type),
        isEnabled,
        readSet,
      ),
    );
  }, [nodes, readsKey, getCodebookVariablesForNodeType, isEnabled]);
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
      readPlaintextNode(entry, (value) =>
        scope ? readCachedPlaintext(scope, value) : undefined,
      ),
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
