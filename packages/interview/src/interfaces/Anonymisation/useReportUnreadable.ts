'use client';

import { useCallback } from 'react';
import { useStore } from 'react-redux';

import { useCaptureException } from '../../analytics/useTrack';
import type { UnreadableReason } from './decryptionScope';

const reported = new WeakMap<object, Set<UnreadableReason>>();

/**
 * Reports an encrypted value that can never be shown, once per interview and
 * reason. Only the reason is sent: never the value, its node or its variable.
 */
export function useReportUnreadable() {
  const store = useStore();
  const captureException = useCaptureException();

  return useCallback(
    (reason: UnreadableReason) => {
      const reasons = reported.get(store) ?? new Set<UnreadableReason>();
      if (reasons.has(reason)) return;
      reasons.add(reason);
      reported.set(store, reasons);
      captureException(
        new Error(`An encrypted answer could not be read (${reason})`),
        { feature: 'encrypted-attributes', reason },
      );
    },
    [store, captureException],
  );
}
