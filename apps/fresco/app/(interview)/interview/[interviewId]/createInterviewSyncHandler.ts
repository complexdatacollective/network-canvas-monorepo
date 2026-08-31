import {
  createDebouncedSyncHandler,
  type SyncHandler,
} from '@codaco/interview/contract';

// Matches the interval the interview engine used to apply on every host's
// behalf, so a participant's answers reach the server at the same rate as
// before batching became this host's decision.
const SYNC_DEBOUNCE_MS = 3000;

// The fetch spec caps the combined body size of all in-flight keepalive
// requests at 64KB and fails the request rather than truncating it. Stay under
// it with room to spare.
const KEEPALIVE_MAX_BYTES = 60_000;

type Args = {
  interviewId: string;
  /**
   * The `syncRevision` the interview row already holds, read when the page was
   * rendered. Numbering continues from here rather than from zero: a reloaded
   * tab that started again at one would have every write it made discarded as
   * older than what is stored.
   */
  initialSyncRevision: number;
  /** Reads the host's current step at the moment a write is put on the wire. */
  getCurrentStep: () => number;
};

/**
 * Build the sync handler Fresco hands to `<Shell>`.
 *
 * Every sync posts the whole network, so this host batches: the engine offers a
 * write per change, and taking all of them would put a request on the wire for
 * every answer. The wrapper still writes the first change straight away and
 * stops batching whenever the engine says the write cannot wait — the
 * participant exiting or finishing, or the tab being hidden.
 *
 * One handler belongs to one interview, because the wrapper holds a single
 * pending snapshot: a handler reused across two would let the second replace
 * the first while both sets of waiters were attached, resolving the first's
 * promise with a write that discarded its state.
 */
export function createInterviewSyncHandler({
  interviewId,
  initialSyncRevision,
  getCurrentStep,
}: Args): SyncHandler {
  let inFlight: AbortController | null = null;
  // Numbers the writes this browser issues, so the server can tell which of two
  // it is holding at once is the newer one: a write issued later always carries
  // a higher number than one issued before it, whatever order they then land in.
  let revision = initialSyncRevision;

  return createDebouncedSyncHandler(
    async (id, session, { unloading }) => {
      if (id !== interviewId) {
        throw new Error(
          `Sync for interview ${id} reached the handler for ${interviewId}`,
        );
      }

      // Cancel any request still running. Ordinary writes are queued one
      // behind another, so the only thing that can still be here is an
      // unloading write — those are issued rather than queued, precisely so
      // they cannot be trapped behind a request dying with the document.
      // That leaves it able to outlive a newer write. The endpoint discards a
      // write older than the one it already has, so this is no longer what
      // stops the rollback; it just saves the server the work of receiving a
      // request whose result is already decided. Cancelling unconditionally
      // covers both orders: a newer unloading write superseding an ordinary
      // one, and — when a hidden tab is reopened before its keepalive POST
      // resolves — an ordinary write superseding the unloading one.
      inFlight?.abort();

      const controller = new AbortController();
      inFlight = controller;
      // Assigned synchronously, before anything can await: this is what ties
      // the numbering to issue order. The route requires it on every write.
      revision += 1;
      const body = JSON.stringify({
        ...session,
        currentStep: getCurrentStep(),
        syncRevision: revision,
      });

      try {
        const response = await fetch(`/interview/${id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
          // An unloading write is the last thing that happens before the
          // document goes away, and a normal request dies with the page.
          // keepalive lets it outlive the document, but the browser caps all
          // keepalive bodies at 64KB and rejects anything larger outright,
          // which a large network exceeds. Ask for it only when the body
          // fits; a larger one falls back to an ordinary request, which still
          // survives the far more common case of the tab merely being
          // backgrounded rather than closed.
          keepalive: unloading && new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
        });
        if (!response.ok) throw new Error('Sync failed');

        // Resume numbering from whatever the row actually holds. Ordinarily
        // that is the number just sent, but it is higher when another tab is
        // open on the same interview: that tab has been writing since this one
        // loaded, so without this every write from this tab would be older than
        // what is stored and would be discarded — turning a guard against one
        // stale write into permanent, silent data loss for a whole tab. Reading
        // the body must never fail the write, which the server has by now
        // already applied.
        try {
          const result: unknown = await response.json();
          const stored =
            typeof result === 'object' &&
            result !== null &&
            'syncRevision' in result
              ? result.syncRevision
              : undefined;
          if (typeof stored === 'number' && stored > revision) {
            revision = stored;
          }
        } catch {
          // No usable body. The counter keeps climbing on its own, which is
          // correct for the only case that matters — this tab writing alone.
        }
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    },
    { waitMs: SYNC_DEBOUNCE_MS },
  );
}
