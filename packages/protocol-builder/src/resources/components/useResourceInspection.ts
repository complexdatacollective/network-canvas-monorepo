import { useCallback, useEffect, useState } from 'react';

import { useResourceClient } from '../client.tsx';
import type { ResourceInspection } from '../types.ts';
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
  const resources = useResourceClient();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [inspection, setInspection] = useState<ResourceInspection | undefined>(
    undefined,
  );
  // What the inspection was asked about. A different resource, a different
  // client, or the selection passing through none and coming back, drops the
  // inspection kept: a picker never shows the previous resource's name over a
  // newly chosen one, and an inspection from before a selection was left does
  // not return to be shown when the same resource is chosen again, nor outlive
  // a request for it that fails. Adjusted during the render that sees the
  // change, so no frame draws the stale one.
  const [asked, setAsked] = useState({ resourceId, resources });
  if (asked.resourceId !== resourceId || asked.resources !== resources) {
    setAsked({ resourceId, resources });
    setInspection(undefined);
  }

  const reload = useCallback(() => {
    if (resourceId === undefined) {
      clear();
      return;
    }
    run(() => resources.inspect(resourceId), setInspection);
  }, [clear, resourceId, resources, run]);

  useEffect(() => {
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
