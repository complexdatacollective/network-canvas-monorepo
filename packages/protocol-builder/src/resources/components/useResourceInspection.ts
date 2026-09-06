import { useCallback, useEffect, useState } from 'react';

import { useResourceGateway } from '../context.tsx';
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
  const gateway = useResourceGateway();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [inspection, setInspection] = useState<ResourceInspection | undefined>(
    undefined,
  );

  const reload = useCallback(() => {
    if (resourceId === undefined) {
      setInspection(undefined);
      clear();
      return;
    }
    run(() => gateway.inspect(resourceId), setInspection);
  }, [clear, gateway, resourceId, run]);

  useEffect(() => {
    // Dropped before the new one is asked for, so a picker never shows the
    // previous resource's name over the newly chosen one.
    setInspection(undefined);
    reload();
  }, [reload]);

  return {
    ...(inspection === undefined ? {} : { inspection }),
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    reload,
  };
}
