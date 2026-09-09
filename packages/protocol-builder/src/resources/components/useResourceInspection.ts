import { useCallback, useEffect, useState } from 'react';

import { useResourceInspect } from '../context.tsx';
import type { ResourceInspection } from '../gateway.ts';
import {
  useResourceAttempt,
  type ResourceAttempt,
} from './useResourceAttempt.ts';

export type ResourceInspectionState = Readonly<{
  /** Absent while loading, when nothing is selected, or after a failure. */
  inspection?: ResourceInspection;
  busy: boolean;
  failure?: ResourceAttempt['failure'];
  retry?: ResourceAttempt['retry'];
  reload: () => void;
}>;

/**
 * What the editor knows about the resource a field currently holds.
 *
 * `inspect` is asked rather than the list, because it answers both questions a
 * picker has at once: the descriptor it needs for the resource's name, kind
 * and staged/committed status, and the content facts a data file's summary is
 * made of. It is also the honest answer when a field references a resource
 * that is no longer there — a `not-found` failure the researcher can read,
 * rather than a blank card.
 */
export function useResourceInspection(
  resourceId: string | undefined,
): ResourceInspectionState {
  // Shared, so the five controls a roster stage asks from — the picker, and
  // every section naming one of the file's columns — are one question rather
  // than five parses of the same file. Each keeps its own busy state and its
  // own failure; see `useSharedInspect`.
  const { inspect, refresh, subscribe } = useResourceInspect();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [inspection, setInspection] = useState<ResourceInspection | undefined>(
    undefined,
  );

  const load = useCallback(() => {
    if (resourceId === undefined) {
      setInspection(undefined);
      clear();
      return;
    }
    run(() => inspect(resourceId), setInspection);
  }, [clear, inspect, resourceId, run]);

  useEffect(() => {
    // Dropped before the new one is asked for, so a picker never shows the
    // previous resource's name over the newly chosen one.
    setInspection(undefined);
    load();
  }, [load]);

  // Asked again whenever anything else reading the same resource asks again.
  // Registered rather than left to the effect above: the answer this hook
  // holds is its own, so nothing about another consumer's successful retry
  // reaches it unless it is told.
  useEffect(() => {
    if (resourceId === undefined) return undefined;
    return subscribe(resourceId, load);
  }, [load, resourceId, subscribe]);

  /**
   * Reads the resource again, here and everywhere else reading it.
   *
   * A retry is offered on one control and the file it re-reads is the same
   * file every other consumer is describing, so refreshing this hook alone
   * would answer the researcher's "try again" with a summary that recovered
   * and four column lists that stayed empty. The call is identical either way
   * — `inspect` is a read, and the consumers all make it in this same tick, so
   * they join as one — and the state each of them is holding is replaced by
   * what it answers.
   */
  const reload = useCallback(() => {
    if (resourceId === undefined) {
      load();
      return;
    }
    refresh(resourceId);
  }, [load, refresh, resourceId]);

  return {
    ...(inspection === undefined ? {} : { inspection }),
    busy,
    ...(failure === undefined ? {} : { failure }),
    // Offered exactly when the attempt says repeating the call may still
    // succeed, and doing the same read — but on everyone's behalf.
    ...(retry === undefined ? {} : { retry: reload }),
    reload,
  };
}
