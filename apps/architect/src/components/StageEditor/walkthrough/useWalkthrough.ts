import { useEffect, useSyncExternalStore } from 'react';

import {
  hasWalkthrough,
  loadWalkthrough,
  type Walkthrough,
} from './parseWalkthrough';

/** Each stage type's walkthrough once loaded; `null` if it could not be. */
const loaded = new Map<string, Walkthrough | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function request(type: string) {
  if (loaded.has(type) || loading.has(type) || !hasWalkthrough(type)) return;
  loading.add(type);
  void loadWalkthrough(type)
    // A walkthrough that fails to load is not offered; the content tests are
    // what keep that from happening.
    .then(
      (walkthrough) => loaded.set(type, walkthrough ?? null),
      () => loaded.set(type, null),
    )
    .finally(() => {
      loading.delete(type);
      for (const listener of listeners) listener();
    });
}

/**
 * The walkthrough for stage type `type`, loaded the first time it is asked
 * for; `undefined` until then, or if the stage type has none.
 */
export function useWalkthrough(
  type: string | undefined,
): Walkthrough | undefined {
  useEffect(() => {
    if (type !== undefined) request(type);
  }, [type]);
  const getSnapshot = () =>
    type === undefined ? undefined : (loaded.get(type) ?? undefined);
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
