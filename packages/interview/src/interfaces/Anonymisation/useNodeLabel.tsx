'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useSelector } from 'react-redux';

import type { NcNode } from '@codaco/shared-consts';

import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import { getShouldEncryptNames } from '../../store/modules/protocol';
import {
  decryptInScope,
  type OutcomeOf,
  readCachedOutcome,
} from './decryptionScope';
import { nodeLabelText, readNodeLabelSource } from './nodeLabel';
import { useCachedOutcomes, useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';

/**
 * A function giving the label a node shows, reading its encrypted answers'
 * outcomes with `outcomeOf`. Everything that shows, announces or matches a
 * node by its label reads it here, so they never disagree. `source` saves
 * reading the node's label source again when the caller already has it.
 */
export function useNodeLabeller(outcomeOf: OutcomeOf) {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const encryptionEnabled = useSelector(getShouldEncryptNames);
  const resolve = useResolveLocalizedString();
  // The type's label in the protocol's language; a node of a type with no
  // label falls back to its id.
  const typeLabelOf = useCallback(
    (codebook: ReturnType<typeof getCodebookForNodeType>) => {
      const text = codebook ? resolve(codebook.label).text : '';
      return text.trim() === '' ? undefined : text;
    },
    [resolve],
  );

  return useCallback(
    (
      node: NcNode,
      source = readNodeLabelSource(
        node,
        getCodebookForNodeType(node.type)?.variables ?? {},
        encryptionEnabled,
      ),
    ) =>
      nodeLabelText(node, source, {
        typeLabel: typeLabelOf(getCodebookForNodeType(node.type)),
        outcomeOf,
      }),
    [getCodebookForNodeType, encryptionEnabled, outcomeOf, typeLabelOf],
  );
}

export function useNodeLabel(node: NcNode | undefined) {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const scope = useDecryptionScope();
  const { requirePassphrase, setPassphraseInvalid, isEnabled } =
    usePassphrase();

  // Read synchronously, so every label that needs no decrypting is available
  // on the FIRST committed render. Resolving plain labels through the async
  // effect below left a window where a node's accessible name was still the
  // type fallback; under a starved event loop (loaded CI) that window
  // stretched long enough for name-based queries and assistive tech to see
  // the wrong name.
  const source = useMemo(
    () =>
      node
        ? readNodeLabelSource(node, codebook?.variables ?? {}, isEnabled)
        : undefined,
    [node, codebook, isEnabled],
  );
  const encrypted = source?.status === 'encrypted' ? source.value : undefined;

  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!encrypted) return;

    if (!scope) {
      requirePassphrase();
      return;
    }

    const cached = readCachedOutcome(scope, encrypted);
    if (cached) {
      if (!cached.readable) setPassphraseInvalid(true);
      return;
    }

    let current = true;
    decryptInScope(scope, encrypted).then(
      () => {
        if (current) rerender();
      },
      () => {
        if (!current) return;
        setPassphraseInvalid(true);
        rerender();
      },
    );
    return () => {
      current = false;
    };
  }, [encrypted, scope, requirePassphrase, setPassphraseInvalid]);

  // Plaintext is read from the passphrase's decryption scope on every render
  // rather than copied into component state, so it disappears from the label
  // the moment that passphrase stops being in force.
  const labelNode = useNodeLabeller(useCachedOutcomes());

  if (!node || !source) return undefined;
  return labelNode(node, source);
}
