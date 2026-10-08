import { useSyncExternalStore } from 'react';

import type { FailedStoredProtocolMigration } from '~/lib/db/migrateStoredProtocols';

/**
 * Why the launch sweep left each stored protocol below the runtime's schema
 * version, by protocol hash, from the sweep's latest result.
 *
 * Held in memory rather than stored: the sweep runs on every launch and on
 * every unlock, before any route renders, and tries every such protocol again,
 * so its latest result is always the current answer. A protocol absent from
 * the map but still below the runtime's version has not been looked at in this
 * session (the sweep has not yet settled), which the routes never see.
 */
export type StoredProtocolMigrationFailureKind =
  FailedStoredProtocolMigration['kind'];

let failures: ReadonlyMap<string, StoredProtocolMigrationFailureKind> =
  new Map();
const listeners = new Set<() => void>();

export function recordStoredProtocolMigrationFailures(
  failed: readonly FailedStoredProtocolMigration[],
): void {
  failures = new Map(failed.map((entry) => [entry.hash, entry.kind]));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Why the protocol stored under `hash` could not be updated in the latest
 * sweep: `'protocol'` when the protocol itself could not be, `'sessions'` when
 * some of its interviews could not be (so nothing was changed), or `undefined`
 * when the sweep reported no failure for it.
 */
export function useStoredProtocolMigrationFailure(
  hash: string,
): StoredProtocolMigrationFailureKind | undefined {
  return useSyncExternalStore(
    subscribe,
    () => failures.get(hash),
    () => failures.get(hash),
  );
}
