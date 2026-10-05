import { useEffect, useState } from 'react';

import type { ArchitectStore } from './architectStore.ts';
import { createArchitectClient, type ArchitectClient } from './client.ts';

type Held = Readonly<{
  store: ArchitectStore;
  otherTabName: string;
  client: ArchitectClient;
}>;

const holders = new WeakMap<ArchitectClient, number>();

/**
 * Disposal waits a microtask so StrictMode's unmount-and-remount re-takes the
 * client before it goes.
 */
export function useArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ArchitectClient {
  const [held, setHeld] = useState<Held>(() => ({
    store,
    otherTabName,
    client: createArchitectClient(store, otherTabName),
  }));
  let current = held;
  if (held.store !== store || held.otherTabName !== otherTabName) {
    current = {
      store,
      otherTabName,
      client: createArchitectClient(store, otherTabName),
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
