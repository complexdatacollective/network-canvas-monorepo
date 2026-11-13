'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import { useNodeLabelStore } from '../../nodeLabelWorker/nodeLabelStoreContext';
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

const subscribeToNothing = () => () => undefined;
const noWorkerLabels = () => undefined;

/**
 * A function giving the label a node shows, reading its encrypted answers'
 * outcomes with `outcomeOf`. Everything that shows or matches a node by its
 * label reads it here, so they never disagree. `source` saves reading the
 * node's label source again when the caller already has it.
 *
 * A protocol's node label worker, when it has one, decides the label of every
 * node whose standard label is not an encrypted answer. Its answer arrives
 * after the node does, so the standard label is given until then, and the
 * function is replaced when an answer arrives, for callers to label again.
 */
export function useNodeLabeller(outcomeOf: OutcomeOf) {
  const intl = useAppIntl();
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const unnamed = intl.formatMessage(runtimeMessages.unnamed);
  const unavailable = intl.formatMessage(runtimeMessages.answerUnavailable);
  const workerLabels = useNodeLabelStore();
  const labelled = useSyncExternalStore(
    workerLabels?.subscribe ?? subscribeToNothing,
    workerLabels?.getLabels ?? noWorkerLabels,
    noWorkerLabels,
  );

  return useCallback(
    (
      node: NcNode,
      source = readNodeLabelSource(
        node,
        getCodebookForNodeType(node.type)?.variables ?? {},
      ),
    ) => {
      if (source.status === 'plain') workerLabels?.request(node);
      const workerLabel =
        source.status === 'plain'
          ? labelled?.get(node[entityPrimaryKeyProperty])
          : undefined;
      return (
        workerLabel ??
        nodeLabelText(source, { unnamed, unavailable, outcomeOf })
      );
    },
    [
      getCodebookForNodeType,
      unnamed,
      unavailable,
      outcomeOf,
      workerLabels,
      labelled,
    ],
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

  const workerLabels = useNodeLabelStore();
  const workerLabelled = source?.status === 'plain' ? node : undefined;
  useEffect(
    () =>
      workerLabels && workerLabelled
        ? workerLabels.watch(workerLabelled)
        : undefined,
    [workerLabels, workerLabelled],
  );

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
  const labelNode = useNodeLabeller(outcomeOf);

  if (!node || !source) return undefined;
  return labelNode(node, source);
}
