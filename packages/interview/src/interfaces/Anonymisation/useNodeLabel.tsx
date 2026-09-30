'use client';

import { hash as objectHash } from 'ohash';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import usePrevious from '@codaco/fresco-ui/hooks/usePrevious';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import { useNodeAttributes } from './useNodeAttributes';
import { usePassphrase } from './usePassphrase';
import { UnauthorizedError } from './utils';

// Will speed up if the same node is rendered in multiple places.
const labelCache = new Map<string, string>();

export function useNodeLabel(node: NcNode | undefined) {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const { passphrase, isEnabled } = usePassphrase();
  const prevPassphrase = usePrevious(passphrase);
  const prevNode = usePrevious(node);

  const cacheKey = useMemo(() => (node ? objectHash(node) : ''), [node]);

  const labelAttributeId = getNodeLabelAttribute(
    codebook?.variables ?? {},
    node?.[entityAttributesProperty] ?? {},
  );

  // Decryption is the ONLY genuinely asynchronous label source: it applies
  // when anonymisation is enabled, the label attribute is marked encrypted,
  // AND the node carries secure-attribute metadata for it (mirrors the gate
  // in useNodeAttributes.getById — nodes without the metadata still hold
  // plaintext).
  const needsAsyncDecrypt = Boolean(
    node &&
    labelAttributeId &&
    isEnabled &&
    codebook?.variables?.[labelAttributeId]?.encrypted &&
    node[entitySecureAttributesMeta]?.[labelAttributeId],
  );

  // Synchronous label for every non-decrypt case, available on the FIRST
  // committed render. Resolving plain labels through the async effect below
  // left a window where a node's accessible name was still the type fallback;
  // under a starved event loop (loaded CI) that window stretched long enough
  // for name-based queries and assistive tech to see the wrong name.
  const syncLabel = useMemo(() => {
    if (!node) return undefined;
    if (needsAsyncDecrypt) return undefined;
    const fallback = codebook?.name ?? node[entityPrimaryKeyProperty];
    if (!labelAttributeId) return fallback;
    const value = node[entityAttributesProperty]?.[labelAttributeId];
    // getNodeLabelAttribute only nominates text/number-valued attributes;
    // anything else (stale codebook, ciphertext arrays) falls back.
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : fallback;
  }, [node, needsAsyncDecrypt, codebook, labelAttributeId]);

  const getById = useNodeAttributes(node);
  const [label, setLabel] = useState<string | undefined>(undefined);

  // A label already decrypted for this exact node is a synchronous read from
  // the module cache, so it is taken during render rather than assigned by the
  // effect below. The cache is keyed on a hash of the whole node, so an entry
  // can only ever be this node's own plaintext.
  //
  // Gated on the same condition the effect uses to consult the cache. A
  // changed passphrase means the entry has not been checked against the key
  // now in force: reading it anyway would keep a name on screen that this
  // participant may no longer be allowed to see, and would mask the 🔒 the
  // revalidation below sets when the decrypt is refused.
  const cachedLabel =
    needsAsyncDecrypt &&
    labelAttributeId &&
    prevPassphrase === passphrase &&
    prevNode === node
      ? labelCache.get(cacheKey)
      : undefined;

  useEffect(() => {
    if (!node) return;
    if (!needsAsyncDecrypt || !labelAttributeId) return;

    // Only check the cache if the passphrase is the same, to allow revalidating
    // Also skip the cache if the node attributes changed
    if (prevPassphrase === passphrase && prevNode === node) {
      if (labelCache.has(cacheKey)) {
        return;
      }
    }

    const fallback = codebook?.name ?? node[entityPrimaryKeyProperty];

    void (async () => {
      try {
        const value = await getById<string | number>(labelAttributeId);
        const stringValue = String(value ?? fallback);
        labelCache.set(cacheKey, stringValue);
        setLabel(stringValue);
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          setLabel('🔒');
          return;
        }
      }
    })();
  }, [
    needsAsyncDecrypt,
    labelAttributeId,
    codebook,
    node,
    getById,
    cacheKey,
    passphrase,
    prevPassphrase,
    prevNode,
  ]);

  return syncLabel ?? cachedLabel ?? label;
}
