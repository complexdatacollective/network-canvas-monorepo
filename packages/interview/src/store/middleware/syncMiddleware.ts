'use client';

import type { Middleware } from '@reduxjs/toolkit';
import { isEqual, omit } from 'es-toolkit';

import { ensureError } from '@codaco/shared-consts';

import type {
  SessionPayload,
  SyncHandler,
  SyncOptions,
} from '../../contract/types';

type SyncMiddlewareState = { session: SessionPayload };

const sessionChanged = (a: SessionPayload, b: SessionPayload) =>
  !isEqual(omit(a, ['promptIndex']), omit(b, ['promptIndex']));

// How many times `flush` will write again when the session keeps moving under
// it. Bounded because the caller is entitled to proceed: someone answering
// continuously must not be able to hold an interview exit open. Two extra
// passes is far more than a settled interview ever needs.
const FLUSH_MAX_PASSES = 3;

const ORDINARY: SyncOptions = { immediate: false, unloading: false };

/**
 * Reports session changes to the host, and guarantees that everything reported
 * has been written before the interview hands control back.
 *
 * The engine deliberately does NOT batch, and does not coalesce: every change
 * is offered to the host as it happens. Batching is a cost decision, and only
 * the host knows what one write costs — so both hosts wrap their handler in
 * `createDebouncedSyncHandler`, at intervals as far apart as their costs are.
 *
 * Coalescing here would defeat that rather than help it. Suppressing a change
 * because an earlier write has not resolved hides it from the host, which then
 * writes a snapshot that was already stale when its window closed. What the
 * engine keeps is only what a host cannot know for itself: which changes matter
 * (see `sessionChanged`), which writes have actually landed, and the moments
 * where deferring is not allowed.
 *
 * Hosts must not run their own writes concurrently — a slow earlier write
 * landing after a newer one would persist stale answers. `createDebouncedSyncHandler`
 * guarantees this; a host writing its own handler owns it.
 */
export const createSyncMiddleware = ({
  onSync,
}: {
  onSync: SyncHandler;
}): {
  middleware: Middleware<Record<string, never>, SyncMiddlewareState>;
  flush: (options?: { unloading?: boolean }) => Promise<void>;
} => {
  let lastSyncedState = {} as SessionPayload;
  let storeRef: { getState: () => SyncMiddlewareState } | null = null;
  // Several offers can be outstanding at once, and a host that coalesces them
  // resolves them together. An earlier one must not then report its older
  // snapshot as the newest state. Ordering, not timing, decides the high-water
  // mark.
  let nextSequence = 0;
  let syncedSequence = -1;
  // The most recent snapshot handed to the host, landed or not. Distinct from
  // `lastSyncedState`, which is the newest one known to be durable — the gap
  // between them is what stops a completing write from re-offering state some
  // other write already has in hand.
  let lastOfferedState = {} as SessionPayload;

  const write = (options: SyncOptions): Promise<void> => {
    if (!storeRef) return Promise.resolve();
    const session = storeRef.getState().session;
    // Nothing outstanding. A failed write leaves the high-water mark behind, so
    // its snapshot still reads as changed here and is written again.
    if (!sessionChanged(session, lastSyncedState)) return Promise.resolve();
    const sequence = nextSequence;
    nextSequence += 1;
    lastOfferedState = session;

    return onSync(session.id, session, options)
      .then(() => {
        // Only advance the high-water mark once the write actually resolves,
        // so a failed write is not treated as synced, and only if nothing
        // newer has already landed.
        if (sequence <= syncedSequence) return;
        syncedSequence = sequence;
        lastSyncedState = session;

        // Advancing the mark can strand the live session. Eligibility above is
        // measured against the last snapshot that LANDED, so a value edited and
        // then reverted while this write was on the wire read as unchanged and
        // was never offered — and now that the mark has moved to the transient
        // value, the reverted one differs from it with nothing scheduled to
        // write it. Re-check here rather than in `catch` as well: a failed write
        // leaves the mark behind, so re-checking there would retry in a loop as
        // tight as the microtask queue.
        const live = storeRef?.getState().session;
        if (
          live &&
          sessionChanged(live, lastSyncedState) &&
          live !== lastOfferedState
        ) {
          void write(ORDINARY);
        }
      })
      .catch((e) => {
        const error = ensureError(e);
        // eslint-disable-next-line no-console
        console.error('❌ Error syncing data:', error);
      });
  };

  /**
   * Write everything outstanding now. Callers that end the session — finishing,
   * exiting, the document being hidden — must await this before handing control
   * on, because a write attempted afterwards may be refused or never run at all.
   */
  const flush = async ({ unloading = false } = {}): Promise<void> => {
    const options: SyncOptions = { immediate: true, unloading };
    for (let pass = 0; pass < FLUSH_MAX_PASSES; pass += 1) {
      const before = storeRef?.getState().session;

      // A host holding changes back only learns it must stop when it sees
      // `immediate`, and it queues this behind whatever it is already writing —
      // so awaiting this one write is both the fastest way to cancel its delay
      // and enough to know everything before it has landed.
      await write(options);

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
    lastOfferedState = lastSyncedState;
    nextSequence = 0;
    syncedSequence = -1;

    return (next) => (action: unknown) => {
      const result = next(action);
      const state = store.getState();
      if (!sessionChanged(state.session, lastSyncedState)) return result;
      void write(ORDINARY);
      return result;
    };
  };

  return { middleware, flush };
};
