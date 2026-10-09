'use client';

import type { Middleware } from '@reduxjs/toolkit';
import { isEqual, omit } from 'es-toolkit';

import { ensureError } from '@codaco/shared-consts';

import type {
  SessionSnapshot,
  SyncHandler,
  SyncOptions,
} from '../../contract/types';

type SyncMiddlewareState = { session: SessionSnapshot };

// The locale fields are persisted through `ProtocolLocaleChangeHandler`
// (see `localeChangeMiddleware`), so a change to them alone is not a write for
// this route.
const NOT_SYNCED = ['promptIndex', 'locale', 'localePreference'] as const;

const sessionChanged = (a: SessionSnapshot, b: SessionSnapshot) =>
  !isEqual(omit(a, NOT_SYNCED), omit(b, NOT_SYNCED));

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
  flush: (options?: { unloading?: boolean }) => Promise<boolean>;
} => {
  let lastSyncedState = {} as SessionSnapshot;
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
  let lastOfferedState = {} as SessionSnapshot;

  // Being durable is not enough on its own to skip a write: a write already on
  // the wire may be carrying something else, and when it lands it overwrites
  // this. That is the revert case — an answer changed and changed back while
  // the first write was in flight — where the live session momentarily equals
  // what is stored and is about to stop equalling it. So there is work to do
  // whenever the live session differs from what is durable OR from what was
  // last handed to the host.
  const needsWrite = (session: SessionSnapshot) =>
    sessionChanged(session, lastSyncedState) ||
    sessionChanged(session, lastOfferedState);

  // Resolves to whether the session it was asked to write is stored: written
  // now, already durable, or overtaken by a newer write that landed.
  const write = (options: SyncOptions): Promise<boolean> => {
    if (!storeRef) return Promise.resolve(true);
    const session = storeRef.getState().session;
    // A failed write leaves the high-water mark behind, so its snapshot still
    // reads as needing a write here and is written again.
    if (!needsWrite(session)) return Promise.resolve(true);
    const sequence = nextSequence;
    nextSequence += 1;
    lastOfferedState = session;

    return onSync(session.id, session, options)
      .then(() => {
        // Only advance the high-water mark once the write actually resolves,
        // so a failed write is not treated as synced, and only if nothing
        // newer has already landed.
        if (sequence <= syncedSequence) return true;
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
        if (live && sessionChanged(live, lastOfferedState)) {
          void write(ORDINARY);
        }
        return true;
      })
      .catch((e) => {
        const error = ensureError(e);
        // eslint-disable-next-line no-console
        console.error('❌ Error syncing data:', error);
        return false;
      });
  };

  /**
   * Write everything outstanding now. Callers that end the session — finishing,
   * exiting, the document being hidden — must await this before handing control
   * on, because a write attempted afterwards may be refused or never run at all.
   *
   * Resolves to whether the session as it stood for the last write has been
   * stored. A refused write is logged rather than thrown, so this is how the
   * caller learns of it and can stay rather than hand over answers the host
   * never received.
   */
  const flush = async ({ unloading = false } = {}): Promise<boolean> => {
    const options: SyncOptions = { immediate: true, unloading };
    let stored = true;
    for (let pass = 0; pass < FLUSH_MAX_PASSES; pass += 1) {
      const before = storeRef?.getState().session;

      // A host holding changes back only learns it must stop when it sees
      // `immediate`, and it queues this behind whatever it is already writing —
      // so awaiting this one write is both the fastest way to cancel its delay
      // and enough to know everything before it has landed. Each pass writes
      // the whole session, so the last one decides what is stored.
      stored = await write(options);

      // Nothing moved while we wrote, so there is nothing another pass could
      // add. Reference equality asks exactly that question — comparing against
      // lastSyncedState would also be true after a *failed* write and would
      // burn the remaining passes re-failing.
      const after = storeRef?.getState().session;
      if (!before || !after || before === after) return stored;
    }
    return stored;
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
      if (!needsWrite(store.getState().session)) return result;
      void write(ORDINARY);
      return result;
    };
  };

  return { middleware, flush };
};
