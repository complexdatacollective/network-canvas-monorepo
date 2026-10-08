'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  type DecryptionScope,
  decryptInScope,
  getEncryptedValue,
  readCachedPlaintext,
} from './decryptionScope';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';

const LOCKED_LABEL = '🔒';
const FAILED_LABEL = '⚠️';

type FailedDecryption = { scope: DecryptionScope; data: number[] };

export function useNodeLabel(node: NcNode | undefined) {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const scope = useDecryptionScope();
  const { requirePassphrase, setPassphraseInvalid, isEnabled } =
    usePassphrase();

  const labelAttributeId = getNodeLabelAttribute(
    codebook?.variables ?? {},
    node?.[entityAttributesProperty] ?? {},
  );

  const encrypted = useMemo(
    () =>
      node && labelAttributeId
        ? getEncryptedValue(
            node,
            labelAttributeId,
            codebook?.variables ?? {},
            isEnabled,
          )
        : undefined,
    [node, labelAttributeId, codebook, isEnabled],
  );

  // Synchronous label for every non-decrypt case, available on the FIRST
  // committed render. Resolving plain labels through the async effect below
  // left a window where a node's accessible name was still the type fallback;
  // under a starved event loop (loaded CI) that window stretched long enough
  // for name-based queries and assistive tech to see the wrong name.
  const syncLabel = useMemo(() => {
    if (!node) return undefined;
    if (encrypted) return undefined;
    const fallback = codebook?.name ?? node[entityPrimaryKeyProperty];
    if (!labelAttributeId) return fallback;
    const value = node[entityAttributesProperty]?.[labelAttributeId];
    // getNodeLabelAttribute only nominates text/number-valued attributes;
    // anything else (stale codebook, ciphertext arrays) falls back.
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : fallback;
  }, [node, encrypted, codebook, labelAttributeId]);

  // Plaintext is read from the passphrase's decryption scope on every render
  // rather than copied into component state, so it disappears from the label
  // the moment that passphrase stops being in force.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [failure, setFailure] = useState<FailedDecryption>();

  const decryptedLabel =
    encrypted && scope ? readCachedPlaintext(scope, encrypted) : undefined;
  const lockedLabel = encrypted && !scope ? LOCKED_LABEL : undefined;
  const failedLabel =
    encrypted &&
    scope &&
    failure?.scope === scope &&
    failure.data === encrypted.data
      ? FAILED_LABEL
      : undefined;

  useEffect(() => {
    if (!encrypted) return;

    if (!scope) {
      requirePassphrase();
      return;
    }

    if (readCachedPlaintext(scope, encrypted) !== undefined) return;

    let current = true;
    decryptInScope(scope, encrypted).then(
      () => {
        if (current) rerender();
      },
      () => {
        if (!current) return;
        setFailure({ scope, data: encrypted.data });
        setPassphraseInvalid(true);
      },
    );
    return () => {
      current = false;
    };
  }, [encrypted, scope, requirePassphrase, setPassphraseInvalid]);

  return syncLabel ?? lockedLabel ?? decryptedLabel ?? failedLabel;
}
