'use client';

import type { Middleware } from '@reduxjs/toolkit';
import { debounce, isEqual, omit } from 'es-toolkit';

import { ensureError } from '@codaco/shared-consts';

import type { SessionPayload, SyncHandler } from '../../contract/types';

type SyncMiddlewareState = { session: SessionPayload };

const sessionChanged = (a: SessionPayload, b: SessionPayload) =>
  !isEqual(omit(a, ['promptIndex']), omit(b, ['promptIndex']));

export const createSyncMiddleware = ({
  onSync,
}: {
  onSync: SyncHandler;
}): {
  middleware: Middleware<Record<string, never>, SyncMiddlewareState>;
  flush: () => Promise<void>;
} => {
  let lastSyncedState = {} as SessionPayload;
  // The in-flight write, or null when idle. Held as a promise (rather than a
  // boolean) so `flush` can await a sync that is already on the wire.
  let inFlight: Promise<void> | null = null;
  let storeRef: { getState: () => SyncMiddlewareState } | null = null;

  const doSync = (): Promise<void> => {
    // Never run two writes concurrently: hand back the one already running so
    // callers can await it.
    if (inFlight) return inFlight;
    if (!storeRef) return Promise.resolve();

    const session = storeRef.getState().session;
    if (!sessionChanged(session, lastSyncedState)) return Promise.resolve();

    const pending = onSync(session.id, session)
      .then(() => {
        // Only advance the high-water mark once the write actually resolves,
        // so a failed autosave is not treated as synced and re-tried below.
        lastSyncedState = session;
      })
      .catch((e) => {
        const error = ensureError(e);
        // eslint-disable-next-line no-console
        console.error('❌ Error syncing data:', error);
      })
      .finally(() => {
        inFlight = null;
        // A rejected sync leaves lastSyncedState unchanged, so this diff still
        // holds and the failed snapshot is retried on the debounce window even
        // when no further state changes have been made.
        if (
          storeRef &&
          sessionChanged(storeRef.getState().session, lastSyncedState)
        ) {
          debouncedSync();
        }
      });

    inFlight = pending;
    return pending;
  };

  const debouncedSync = debounce(doSync, 3000, {
    edges: ['leading', 'trailing'],
  });

  // Write any pending session state right now instead of waiting out the
  // debounce window. Callers that end the session (finishing an interview)
  // must await this before telling the host, because hosts may refuse writes
  // once an interview is complete — a trailing-edge sync that lands afterwards
  // would be rejected and the participant's last answers lost.
  const flush = async (): Promise<void> => {
    debouncedSync.cancel();

    // Wait for a write already on the wire first: it may be carrying an older
    // snapshot, and doSync refuses to start a second concurrent write.
    if (inFlight) await inFlight;

    // The `catch` above already swallows and logs failures, so this never
    // rejects. A failed final sync must not block the participant from
    // finishing — they cannot act on the error, and blocking would strand
    // them on the interview.
    await doSync();
  };

  const middleware: Middleware<Record<string, never>, SyncMiddlewareState> = (
    store,
  ) => {
    storeRef = store;
    lastSyncedState = store.getState().session;
    inFlight = null;
    debouncedSync.cancel();

    return (next) => (action: unknown) => {
      const result = next(action);
      const state = store.getState();
      if (!sessionChanged(state.session, lastSyncedState)) return result;
      debouncedSync();
      return result;
    };
  };

  return { middleware, flush };
};
