'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import type { NcNode } from '@codaco/shared-consts';

import { makeGetCodebookVariablesForNodeType } from '../../selectors/protocol';
import { usePassphrase } from './usePassphrase';
import { decryptNodeAttributes, hasEncryptedAttributes } from './utils';

export type DecryptedNodes =
  | { status: 'ready'; nodes: NcNode[] }
  | { status: 'locked' }
  | { status: 'pending' }
  | { status: 'failed' };

type Decryptions = {
  passphrase: string;
  /** Plaintext copy of each stored node decrypted so far, keyed by the node. */
  byNode: ReadonlyMap<NcNode, NcNode>;
  /** The most recently completed result. */
  nodes: NcNode[];
};

// Redux replaces a node object whenever the node changes, so an unchanged node
// object can reuse its earlier decryption.
function resolve(
  nodes: NcNode[],
  byNode: ReadonlyMap<NcNode, NcNode>,
  isEncrypted: (node: NcNode) => boolean,
): NcNode[] | null {
  const resolved: NcNode[] = [];
  for (const node of nodes) {
    const plain = isEncrypted(node) ? byNode.get(node) : node;
    if (!plain) return null;
    resolved.push(plain);
  }
  return resolved;
}

/**
 * Decrypts the encrypted attribute values of a list of nodes for display or
 * editing. Nodes without encrypted values pass through untouched, so a list
 * with none, or any list while encryption is not in effect (see
 * `isAttributeEncrypted`), is ready immediately and needs no passphrase.
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

  useEffect(() => {
    if (needsDecryption && !passphrase) requirePassphrase();
  }, [needsDecryption, passphrase, requirePassphrase]);

  useEffect(() => {
    if (!needsDecryption || !passphrase) return undefined;
    if (current && resolve(nodes, current.byNode, isEncrypted)) {
      return undefined;
    }

    let cancelled = false;
    const known = current?.byNode ?? new Map<NcNode, NcNode>();

    async function decryptAll(key: string) {
      try {
        const pairs = await Promise.all(
          nodes.map(async (node): Promise<[NcNode, NcNode]> => {
            if (!isEncrypted(node)) return [node, node];
            const plain =
              known.get(node) ??
              (await decryptNodeAttributes(
                node,
                getCodebookVariablesForNodeType(node.type),
                key,
                isEnabled,
              ));
            return [node, plain];
          }),
        );
        if (cancelled) return;
        setDecryptions({
          passphrase: key,
          byNode: new Map(pairs),
          nodes: pairs.map(([, plain]) => plain),
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
    isEncrypted,
    getCodebookVariablesForNodeType,
    isEnabled,
    setPassphraseInvalid,
  ]);

  if (!needsDecryption) return { status: 'ready', nodes };
  if (!passphrase) return { status: 'locked' };

  const resolved = current ? resolve(nodes, current.byNode, isEncrypted) : null;
  if (resolved) return { status: 'ready', nodes: resolved };

  if (failure?.passphrase === passphrase && failure.nodes === nodes) {
    return { status: 'failed' };
  }
  if (current) return { status: 'ready', nodes: current.nodes };
  return { status: 'pending' };
}
