import { useCallback, useEffect, useRef, useState } from 'react';

import { useResourceClient } from '../client.tsx';
import {
  resourceOk,
  type ResourceDescriptor,
  type ResourceKind,
  type ResourceResult,
} from '../types.ts';
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
   * {@link resources} is what was there when this hook last asked the host,
   * which is what a list on screen has to be. A decision made against the
   * library — whether a name is already taken — cannot be made against that:
   * it has to be true at the moment it is acted on, and anything else in the
   * edit may have added a resource since. What comes back is rendered too, so
   * the list the researcher is looking at catches up with what they were just
   * told about it.
   */
  read: () => Promise<ResourceResult<readonly ResourceDescriptor[]>>;
}>;

/**
 * The resources a picker may offer, read from the host and nowhere else.
 *
 * Staged resources are listed beside committed ones because a researcher who
 * has just imported a file is entitled to see it in the library they are
 * choosing from — the host is what knows the difference, and says so on each
 * descriptor.
 */
export function useResourceLibrary(
  kinds: readonly ResourceKind[],
): ResourceLibrary {
  const resources = useResourceClient();
  const { busy, failure, retry, run } = useResourceAttempt();
  const [offered, setOffered] =
    useState<readonly ResourceDescriptor[]>(NO_RESOURCES);

  // The kinds themselves are the dependency, not the array carrying them: a
  // call site spelling its list inline hands over a new array every render.
  const key = kinds.join(',');
  const latestKinds = useRef(kinds);
  latestKinds.current = kinds;

  // Asked for, and then held to. `kinds` is a request a host serves; which
  // resources a field may hold is the editor's own rule, and a picker that
  // offered what its field cannot take would be inviting a choice it goes on
  // to refuse. One seam, so every caller — the list on screen and the name
  // check beside it — sees the same library.
  const list = useCallback(async () => {
    const listed = await resources.list({ kinds: latestKinds.current });
    if (listed.status !== 'ok') return listed;
    const accepted = new Set<ResourceKind>(latestKinds.current);
    const allowed = listed.data.filter((descriptor) =>
      accepted.has(descriptor.kind),
    );
    return allowed.length === listed.data.length ? listed : resourceOk(allowed);
  }, [key, resources]);

  const reload = useCallback(() => {
    run(list, setOffered);
  }, [list, run]);

  const read = useCallback(async () => {
    // Outside the attempt state on purpose: this read belongs to whatever
    // asked for it, and the caller shows its own progress and its own
    // failure. Taking `busy` here would disable the list's own retry while a
    // form beside it was submitting.
    const result = await list();
    if (result.status === 'ok') setOffered(result.data);
    return result;
  }, [list]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    resources: offered,
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    reload,
    read,
  };
}
