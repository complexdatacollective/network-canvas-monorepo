'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { makeGetCodebookVariablesForNodeType } from '../../selectors/protocol';
import { usePassphrase } from './usePassphrase';
import {
  decryptNodeAttributes,
  hasEncryptedAttributes,
  isNumberArray,
} from './utils';

export type DecryptedNodes =
  | { status: 'ready'; nodes: NcNode[] }
  | { status: 'locked' }
  | { status: 'pending' }
  | { status: 'failed' };

type Decryption = { stored: NcNode; plain: NcNode };

type Decryptions = {
  passphrase: string;
  /** The latest decryption of each node, keyed by node id. */
  byId: ReadonlyMap<string, Decryption>;
  /** The most recently completed result. */
  nodes: NcNode[];
};

/**
 * Redux keeps unchanged values by reference, so when an edit leaves a node's
 * encrypted values and their metadata untouched, the earlier plaintext still
 * applies and only the other attributes need refreshing. Any new ciphertext
 * means the node has to be decrypted again.
 */
function reuseDecryption(
  node: NcNode,
  { stored, plain }: Decryption,
): NcNode | null {
  if (node === stored) return plain;

  const storedMeta = stored[entitySecureAttributesMeta] ?? {};
  const meta = node[entitySecureAttributesMeta] ?? {};
  const secureKeys = Object.keys(meta);
  if (secureKeys.length !== Object.keys(storedMeta).length) return null;

  const storedAttributes = stored[entityAttributesProperty];
  const attributes: Record<string, VariableValue> = {};
  for (const [key, value] of Object.entries(node[entityAttributesProperty])) {
    if (value !== storedAttributes[key] && isNumberArray(value)) return null;
    attributes[key] = value;
  }

  for (const key of secureKeys) {
    const plainValue = plain[entityAttributesProperty][key];
    if (
      meta[key] !== storedMeta[key] ||
      attributes[key] !== storedAttributes[key] ||
      plainValue === undefined
    ) {
      return null;
    }
    attributes[key] = plainValue;
  }

  const { [entitySecureAttributesMeta]: _decrypted, ...rest } = node;
  return { ...rest, [entityAttributesProperty]: attributes };
}

function resolve(
  nodes: NcNode[],
  byId: ReadonlyMap<string, Decryption>,
  isEncrypted: (node: NcNode) => boolean,
): NcNode[] | null {
  const resolved: NcNode[] = [];
  for (const node of nodes) {
    if (!isEncrypted(node)) {
      resolved.push(node);
      continue;
    }
    const known = byId.get(node._uid);
    const plain = known ? reuseDecryption(node, known) : null;
    if (!plain) return null;
    resolved.push(plain);
  }
  return resolved;
}

/**
 * Decrypts the encrypted attribute values of a list of nodes for display or
 * editing. Nodes without encrypted values pass through untouched, so a list
 * with none, or any list while encryption is not in effect (see
 * `isAttributeEncrypted`), is ready immediately and needs no passphrase. Pass
 * a memoized list: a new array on every render restarts the work.
 *
 * Without a passphrase the result is `locked` and the passphrase is
 * requested. While a changed list is being decrypted the previous result for
 * the same passphrase stays available (still `ready`), so callers should look
 * nodes up by id rather than by position.
 */
export function useDecryptedNodes(nodes: NcNode[]): DecryptedNodes {
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );
  const { passphrase, requirePassphrase, setPassphraseInvalid, isEnabled } =
    usePassphrase();

  const [decryptions, setDecryptions] = useState<Decryptions | null>(null);
  const [failure, setFailure] = useState<{
    passphrase: string;
    nodes: NcNode[];
  } | null>(null);

  const isEncrypted = useCallback(
    (node: NcNode) =>
      hasEncryptedAttributes(
        node,
        getCodebookVariablesForNodeType(node.type),
        isEnabled,
      ),
    [getCodebookVariablesForNodeType, isEnabled],
  );
  const needsDecryption = nodes.some(isEncrypted);
  const current =
    passphrase && decryptions?.passphrase === passphrase ? decryptions : null;
  const resolved = useMemo(
    () => (current ? resolve(nodes, current.byId, isEncrypted) : null),
    [nodes, current, isEncrypted],
  );

  useEffect(() => {
    if (needsDecryption && !passphrase) requirePassphrase();
  }, [needsDecryption, passphrase, requirePassphrase]);

  useEffect(() => {
    if (!needsDecryption || !passphrase || resolved) return undefined;

    let cancelled = false;
    const known = current?.byId ?? new Map<string, Decryption>();

    async function decryptAll(key: string) {
      try {
        const decrypted = await Promise.all(
          nodes.map(async (node): Promise<Decryption> => {
            if (!isEncrypted(node)) {
              return { stored: node, plain: node };
            }
            const previous = known.get(node._uid);
            const plain =
              (previous ? reuseDecryption(node, previous) : null) ??
              (await decryptNodeAttributes(
                node,
                getCodebookVariablesForNodeType(node.type),
                key,
                isEnabled,
              ));
            return { stored: node, plain };
          }),
        );
        if (cancelled) return;
        setDecryptions({
          passphrase: key,
          byId: new Map(decrypted.map((entry) => [entry.stored._uid, entry])),
          nodes: decrypted.map(({ plain }) => plain),
        });
      } catch {
        if (cancelled) return;
        setFailure({ passphrase: key, nodes });
        setPassphraseInvalid(true);
      }
    }

    void decryptAll(passphrase);

    return () => {
      cancelled = true;
    };
  }, [
    nodes,
    needsDecryption,
    passphrase,
    current,
    resolved,
    isEncrypted,
    getCodebookVariablesForNodeType,
    isEnabled,
    setPassphraseInvalid,
  ]);

  if (!needsDecryption) return { status: 'ready', nodes };
  if (!passphrase) return { status: 'locked' };
  if (resolved) return { status: 'ready', nodes: resolved };

  if (failure?.passphrase === passphrase && failure.nodes === nodes) {
    return { status: 'failed' };
  }
  if (current) return { status: 'ready', nodes: current.nodes };
  return { status: 'pending' };
}
