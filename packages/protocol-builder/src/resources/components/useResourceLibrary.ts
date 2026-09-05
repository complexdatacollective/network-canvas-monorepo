import { useCallback, useEffect, useRef, useState } from 'react';

import { useResourceGateway } from '../context.tsx';
import type {
  ResourceDescriptor,
  ResourceKind,
  ResourceResult,
} from '../gateway.ts';
import { callGateway } from '../gatewayCall.ts';
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
  /**
   * The library as of now, answered rather than rendered.
   *
   * {@link resources} is what was there when this hook last read the gateway,
   * which is what a list on screen has to be. A decision made against the
   * library — whether a name is already taken — cannot be made against that:
   * it has to be true at the moment it is acted on, and anything else in the
   * session may have added a resource since. What comes back is rendered too,
   * so the list the researcher is looking at catches up with what they were
   * just told about it.
   */
  read: () => Promise<ResourceResult<readonly ResourceDescriptor[]>>;
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

  const list = useCallback(
    () => gateway.list({ kinds: latestKinds.current }),
    [gateway, key],
  );

  const reload = useCallback(() => {
    run(list, setResources);
  }, [list, run]);

  const read = useCallback(async () => {
    // Outside the attempt state on purpose: this read belongs to whatever
    // asked for it, and the caller shows its own progress and its own
    // failure. Taking `busy` here would disable the list's own retry while a
    // form beside it was submitting.
    const result = await callGateway(list);
    if (result.status === 'ok') setResources(result.data);
    return result;
  }, [list]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    resources,
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    reload,
    read,
  };
}
