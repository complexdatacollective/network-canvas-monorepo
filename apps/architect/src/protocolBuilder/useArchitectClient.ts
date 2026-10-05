import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ArchitectStore } from './architectStore.ts';
import { createArchitectClient, type ArchitectClient } from './client.ts';

type Held = Readonly<{
  store: ArchitectStore;
  client: ArchitectClient;
}>;

const holders = new WeakMap<ArchitectClient, number>();

/**
 * One client per store. The client's handlers own the resource staging of
 * every open edit, so a new client would strand what an editor has imported;
 * the other-tab label follows the researcher's language through a ref the
 * handlers read when they report a lock holder, not a rebuild.
 *
 * Disposal waits a microtask so StrictMode's unmount-and-remount re-takes the
 * client before it goes.
 */
export function useArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ArchitectClient {
  const otherTabNameRef = useRef(otherTabName);
  useLayoutEffect(() => {
    otherTabNameRef.current = otherTabName;
  }, [otherTabName]);

  const [held, setHeld] = useState<Held>(() => ({
    store,
    client: createArchitectClient(store, () => otherTabNameRef.current),
  }));
  let current = held;
  if (held.store !== store) {
    current = {
      store,
      client: createArchitectClient(store, () => otherTabNameRef.current),
    };
    setHeld(current);
  }
  const { client } = current;

  useEffect(() => {
    holders.set(client, (holders.get(client) ?? 0) + 1);
    return () => {
      holders.set(client, (holders.get(client) ?? 1) - 1);
      queueMicrotask(() => {
        if (holders.get(client) !== 0) return;
        holders.delete(client);
        void client.runtime.dispose();
      });
    };
  }, [client]);

  return client;
}
