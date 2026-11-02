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
  // Filed under the resource it describes, so a picker never shows the
  // previous resource's name over the newly chosen one: an inspection of any
  // other resource is simply not the answer for this one.
  const [inspected, setInspected] = useState<
    Readonly<{ resourceId: string; inspection: ResourceInspection }> | undefined
  >(undefined);
  const inspection =
    inspected !== undefined && inspected.resourceId === resourceId
      ? inspected.inspection
      : undefined;

  const reload = useCallback(() => {
    if (resourceId === undefined) {
      // Nothing to show: the inspection kept is filed under another resource,
      // so it is not read for this one.
      clear();
      return;
    }
    run(
      () => resources.inspect(resourceId),
      (data) => setInspected({ resourceId, inspection: data }),
    );
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
