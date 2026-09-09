import { useRef, type RefObject } from 'react';

import { useResourceClient, type ResourceClient } from '../client.tsx';

/**
 * The resource client, read at the moment a call is made rather than captured
 * when an effect was set up.
 *
 * The client carries facts about the open edit as well as the host's
 * procedures — which resources it has staged, and where this host puts a
 * promoted secret — so it is a new object whenever any of those change. An
 * effect that calls the host is not about any of them: a preview is about the
 * resource it is showing, an inspection about the resource a field holds, a
 * library about the kinds it offers. Keyed on the client's identity, each of
 * those would run again every time any field on the stage imported or
 * discarded anything, and twice on open — once for the client the edit starts
 * with and once for the one it has after the host has said where secrets go.
 */
export function useResourceClientRef(): RefObject<ResourceClient> {
  const resources = useResourceClient();
  const latest = useRef(resources);
  latest.current = resources;
  return latest;
}
