'use client';

import type { Middleware } from '@reduxjs/toolkit';
import { isEqual, omit } from 'es-toolkit';

import { ensureError } from '@codaco/shared-consts';

import type { SessionPayload, SyncHandler } from '../../contract/types';

type SyncMiddlewareState = { session: SessionPayload };

const sessionChanged = (a: SessionPayload, b: SessionPayload) =>
  !isEqual(omit(a, ['promptIndex']), omit(b, ['promptIndex']));

// How many times `flush` will write again when the session keeps moving under
// it. Bounded because the caller is entitled to proceed: someone answering
// continuously must not be able to hold an interview exit open. Two extra
// passes is far more than a settled interview ever needs.
const FLUSH_MAX_PASSES = 3;

/**
 * Reports session changes to the host and guarantees that everything reported
 * has been written before the interview hands control back.
 *
 * The engine deliberately does NOT batch: every change is offered to the host
 * as it happens. Batching is a cost decision, and only the host knows the cost
 * of one write — the Interviewer writes to a local database and takes them all,
 * while a host posting over the network wraps its handler in
 * `createDebouncedSyncHandler`. What the engine keeps is the part a host cannot
 * do for itself: it never runs two writes at once, it re-writes when the
 * session moved during a write, it retries a write that failed, and it knows
 * the moments where deferring is not allowed.
 */
export const createSyncMiddleware = ({
  onSync,
}: {
  onSync: SyncHandler;
}): {
  middleware: Middleware<Record<string, never>, SyncMiddlewareState>;
  flush: () => Promise<void>;
} => {
  let lastSyncedState = {} as SessionPayload;
  // The background write, or null when idle. Held as a promise (rather than a
  // boolean) so callers can await a write that is already on the wire.
  let inFlight: Promise<void> | null = null;
  let storeRef: { getState: () => SyncMiddlewareState } | null = null;
  // Writes can overlap once a flush is involved (see `flush`), and a slower
  // earlier write must not be allowed to report itself as the newest state
  // when it lands. Ordering, not timing, decides the high-water mark.
  let nextSequence = 0;
  let syncedSequence = -1;

  const write = (immediate: boolean): Promise<void> => {
    if (!storeRef) return Promise.resolve();
    const session = storeRef.getState().session;
    // Nothing outstanding. A failed write leaves the high-water mark behind, so
    // its snapshot still reads as changed here and is written again.
    if (!sessionChanged(session, lastSyncedState)) return Promise.resolve();
    const sequence = nextSequence;
    nextSequence += 1;

    return onSync(session.id, session, { immediate })
      .then(() => {
        // Only advance the high-water mark once the write actually resolves,
        // so a failed write is not treated as synced, and only if nothing
        // newer has already landed.
        if (sequence > syncedSequence) {
          syncedSequence = sequence;
          lastSyncedState = session;
        }
      })
      .catch((e) => {
        const error = ensureError(e);
        // eslint-disable-next-line no-console
        console.error('❌ Error syncing data:', error);
      });
  };

  // The background path: one write at a time, and another straight after if the
  // session moved while that one was on the wire. A burst of answers therefore
  // costs two writes rather than one per answer, without any timer.
  const syncPendingChanges = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (!storeRef) return Promise.resolve();
    const before = storeRef.getState().session;

    const pending = write(false).finally(() => {
      inFlight = null;
      // Chase this write only if the session actually moved while it was on the
      // wire — reference equality asks exactly that. Asking instead whether the
      // store still differs from lastSyncedState would also be true after a
      // *failed* write, and retrying a failure here would spin: this layer owns
      // no timer to space attempts out, so the loop would be as tight as the
      // microtask queue. A failed snapshot stays marked unsynced and is picked
      // up by the next change or the next flush.
      if (storeRef && storeRef.getState().session !== before) {
        void syncPendingChanges();
      }
    });

    inFlight = pending;
    return pending;
  };

  /**
   * Write everything outstanding now. Callers that end the session — finishing,
   * exiting, the document being hidden — must await this before handing control
   * on, because a write attempted afterwards may be refused or never run at all.
   */
  const flush = async (): Promise<void> => {
    for (let pass = 0; pass < FLUSH_MAX_PASSES; pass += 1) {
      const before = storeRef?.getState().session;

      // Ask for the immediate write BEFORE awaiting anything already on the
      // wire. A host that is holding changes back only learns it must stop when
      // it sees `immediate`, so awaiting first would mean waiting out the very
      // delay this call exists to cancel. That can briefly overlap a background
      // write; the sequence guard in `write` keeps the high-water mark honest,
      // and a batching host coalesces the two into one.
      await Promise.all([write(true), inFlight]);

      // Nothing moved while we wrote, so there is nothing another pass could
      // add. Reference equality asks exactly that question — comparing against
      // lastSyncedState would also be true after a *failed* write and would
      // burn the remaining passes re-failing.
      const after = storeRef?.getState().session;
      if (!before || !after || before === after) return;
    }
  };

  const middleware: Middleware<Record<string, never>, SyncMiddlewareState> = (
    store,
  ) => {
    storeRef = store;
    lastSyncedState = store.getState().session;
    inFlight = null;
    nextSequence = 0;
    syncedSequence = -1;

    return (next) => (action: unknown) => {
      const result = next(action);
      const state = store.getState();
      if (!sessionChanged(state.session, lastSyncedState)) return result;
      void syncPendingChanges();
      return result;
    };
  };

  return { middleware, flush };
};
