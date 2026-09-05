import { useCallback, useEffect, useRef, useState } from 'react';

import { useResourceGateway } from '../context.tsx';
import type { ResourceDescriptor, ResourceKind } from '../gateway.ts';
import {
  useResourceAttempt,
  type ResourceAttempt,
} from './useResourceAttempt.ts';

const NO_RESOURCES: readonly ResourceDescriptor[] = Object.freeze([]);

export type ResourceLibrary = Readonly<{
  /** Committed and staged resources of the requested kinds. */
  resources: readonly ResourceDescriptor[];
  busy: boolean;
  failure?: ResourceAttempt['failure'];
  retry?: ResourceAttempt['retry'];
  reload: () => void;
}>;

/**
 * The resources a picker may offer, read from the gateway and nowhere else.
 *
 * Staged resources are listed beside committed ones because a researcher who
 * has just imported a file is entitled to see it in the library they are
 * choosing from — the gateway is what knows the difference, and says so on
 * each descriptor.
 */
export function useResourceLibrary(
  kinds: readonly ResourceKind[],
): ResourceLibrary {
  const gateway = useResourceGateway();
  const { busy, failure, retry, run } = useResourceAttempt();
  const [resources, setResources] =
    useState<readonly ResourceDescriptor[]>(NO_RESOURCES);

  // The kinds themselves are the dependency, not the array carrying them: a
  // call site spelling its list inline hands over a new array every render.
  const key = kinds.join(',');
  const latestKinds = useRef(kinds);
  latestKinds.current = kinds;

  const reload = useCallback(() => {
    run(() => gateway.list({ kinds: latestKinds.current }), setResources);
  }, [gateway, key, run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    resources,
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    reload,
  };
}
