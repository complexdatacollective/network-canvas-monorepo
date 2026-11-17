'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { NcNode } from '@codaco/shared-consts';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  useDynamicNodeLabel,
  useDynamicNodeLabeller,
} from '../../nodeLabels/useDynamicNodeLabel';
import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import {
  decryptInScope,
  type OutcomeOf,
  readCachedOutcome,
} from './decryptionScope';
import { nodeLabelText, readNodeLabelSource } from './nodeLabel';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';
import { useReportUnreadable } from './useReportUnreadable';

/**
 * A function giving the label a node shows, reading its encrypted answers'
 * outcomes with `outcomeOf`. Everything that shows or matches a node by its
 * label reads it here, so they never disagree. `source` saves reading the
 * node's label source again when the caller already has it.
 *
 * A node whose type has a label of its own shows that (see
 * `useDynamicNodeLabeller`), which may in turn show the label the interview
 * would otherwise have chosen.
 */
export function useNodeLabeller(outcomeOf: OutcomeOf) {
  const defaultLabel = useDefaultNodeLabeller(outcomeOf);
  const dynamicLabel = useDynamicNodeLabeller();
  return useCallback(
    (node: NcNode, source?: Parameters<typeof defaultLabel>[1]) =>
      dynamicLabel(node, defaultLabel(node, source)),
    [defaultLabel, dynamicLabel],
  );
}

/**
 * The label the interview chooses for a node by its own rules: its name, or
 * another of its answers, or else "Unnamed".
 */
function useDefaultNodeLabeller(outcomeOf: OutcomeOf) {
  const intl = useAppIntl();
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const unnamed = intl.formatMessage(runtimeMessages.unnamed);
  const unavailable = intl.formatMessage(runtimeMessages.answerUnavailable);

  return useCallback(
    (
      node: NcNode,
      source = readNodeLabelSource(
        node,
        getCodebookForNodeType(node.type)?.variables ?? {},
      ),
    ) => {
      return nodeLabelText(source, { unnamed, unavailable, outcomeOf });
    },
    [getCodebookForNodeType, unnamed, unavailable, outcomeOf],
  );
}

export function useNodeLabel(node: NcNode | undefined) {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const scope = useDecryptionScope();
  const { requirePassphrase } = usePassphrase();
  const reportUnreadable = useReportUnreadable();

  // Read synchronously, so every label that needs no decrypting is available
  // on the FIRST committed render. Resolving plain labels through the async
  // effect below left a window where a node's accessible name was still the
  // type fallback; under a starved event loop (loaded CI) that window
  // stretched long enough for name-based queries and assistive tech to see
  // the wrong name.
  const source = useMemo(
    () =>
      node ? readNodeLabelSource(node, codebook?.variables ?? {}) : undefined,
    [node, codebook],
  );
  const encrypted = source?.status === 'encrypted' ? source.value : undefined;

  // Runs again when the outcome is recorded, since that replaces the scope.
  useEffect(() => {
    if (source?.status === 'unreadable') {
      reportUnreadable(source.reason);
      return undefined;
    }
    if (!encrypted) return undefined;

    if (!scope) {
      requirePassphrase();
      return undefined;
    }

    const cached = readCachedOutcome(scope, encrypted);
    if (cached) {
      if (!cached.readable) reportUnreadable('decryption-failed');
      return undefined;
    }

    void decryptInScope(scope, encrypted);
    return undefined;
  }, [source, encrypted, scope, requirePassphrase, reportUnreadable]);

  // Plaintext is read from the key's decryption scope on every render rather
  // than copied into component state, so it disappears from the label the
  // moment that key stops being in force.
  const outcomeOf = useCallback<OutcomeOf>(
    (value) => (scope ? readCachedOutcome(scope, value) : undefined),
    [scope],
  );
  const labelNode = useDefaultNodeLabeller(outcomeOf);

  // Read for this node alone, rather than through `useNodeLabeller`: the
  // node then redraws when its own label changes, not whenever the network
  // does.
  return useDynamicNodeLabel(
    node,
    node && source ? labelNode(node, source) : undefined,
  );
}
