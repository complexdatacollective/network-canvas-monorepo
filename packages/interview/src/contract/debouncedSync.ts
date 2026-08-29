import type { SessionPayload, SyncHandler, SyncOptions } from './types';

/**
 * Wrap a `SyncHandler` so ordinary changes are batched instead of written one
 * for one, while the moments that must not be deferred still are not.
 *
 * The engine offers every change to its host as it happens, because only the
 * host knows what one write costs. A local database write is cheap enough to
 * take them all; a network request is not, and that host wraps its handler in
 * this. Batching is therefore a host decision, expressed here rather than fixed
 * inside the engine.
 *
 * Behaviour, in the order it matters:
 *
 * - The first change writes straight away, so a participant's first answer is
 *   never sitting in a timer.
 * - After a write, changes are held for `waitMs` and then written once,
 *   together. Sustained answering therefore costs one write per `waitMs`
 *   carrying the newest state — a rate limit, not a true debounce, because a
 *   debounce would starve writes entirely while a participant kept working,
 *   which is the opposite of what autosave is for.
 * - `immediate` cancels the wait and writes now. The engine sends it when the
 *   participant is exiting or finishing, or when the document is being hidden
 *   and may never run script again.
 * - Only one write is on the wire at a time, and writes run in order — so a
 *   caller awaiting a flush knows everything before it has landed too. The
 *   single exception is an `unloading` write, which is issued straight away
 *   rather than queued: the request in front of it is about to die with the
 *   document, and a continuation waiting behind it would never run at all. A
 *   host whose writes can then land out of order should make the newest one
 *   win (Fresco cancels the request it supersedes).
 * - Every returned promise resolves when a write covering that change lands,
 *   so the engine can await a flush and know the answers are stored. This is
 *   why it is not `es-toolkit`'s `debounce`, whose `flush()` returns void and
 *   cannot be awaited.
 * - A failed write rejects the promises waiting on it, so the engine's own
 *   retry still applies.
 *
 * One handler batches for one interview. It holds a single pending snapshot,
 * so a handler shared between two would let the second replace the first while
 * both sets of waiters were still attached — resolving the first interview's
 * promise with a write that discarded its state. Create one per interview.
 */
export function createDebouncedSyncHandler(
  write: SyncHandler,
  { waitMs }: { waitMs: number },
): SyncHandler {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void };
  type Pending = {
    id: string;
    session: SessionPayload;
    options: SyncOptions;
  };

  let pending: Pending | null = null;
  let waiters: Waiter[] = [];
  // Set while we are inside `waitMs` of the last write. Its presence is what
  // makes a change wait; its absence is what lets one through immediately.
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
  // Writes on the queue that have not finished. Counted from the moment one is
  // scheduled, not from the moment it starts: `runWrite` only begins a
  // microtask later, and a change arriving in that gap would otherwise see a
  // quiet handler and schedule a write of its own. Every such extra survives to
  // drain whatever has accumulated the instant the write in front of it lands,
  // so one gesture's worth of changes — an automatic-layout settle dispatches
  // several in a single tick — buys that many writes at request latency, which
  // is the rate limit defeated in the situation it exists for. Scheduled or
  // running, a queued write will pick up `pending`, so there is nothing for a
  // new change to do but wait.
  //
  // Unloading writes are deliberately NOT counted. They are issued outside the
  // queue because the document may die before a queued one could run, which
  // equally means they may never settle — a keepalive request outlives the page
  // and can hang. Letting one gate this would strand every answer given after a
  // tab came back, waiting on a request nobody is left to care about.
  let queuedWrites = 0;
  // Writes are appended here rather than started directly, which is what keeps
  // them ordered and stops two being on the wire at once.
  let queue: Promise<void> = Promise.resolve();

  const closeWindow = () => {
    if (windowTimer !== undefined) {
      clearTimeout(windowTimer);
      windowTimer = undefined;
    }
  };

  const openWindow = () => {
    closeWindow();
    windowTimer = setTimeout(() => {
      windowTimer = undefined;
      if (pending) enqueueWrite();
    }, waitMs);
  };

  const runWrite = async (): Promise<void> => {
    // Superseded: a slot ahead of this one already wrote the snapshot.
    if (!pending) return;
    closeWindow();

    const { id, session, options } = pending;
    const settling = waiters;
    pending = null;
    waiters = [];

    try {
      await write(id, session, options);
      for (const waiter of settling) waiter.resolve();
    } catch (error) {
      // Hand the failure to whoever was waiting on this snapshot; the engine
      // treats a rejected sync as unsynced and offers the state again.
      for (const waiter of settling) waiter.reject(error);
    } finally {
      // Rate-limit from the write that just landed, and pick up anything that
      // arrived while it was on the wire once that window closes.
      openWindow();
    }
  };

  const enqueueWrite = () => {
    queuedWrites += 1;
    queue = queue.then(async () => {
      try {
        await runWrite();
      } finally {
        queuedWrites -= 1;
      }
    });
  };

  return (id, session, options) => {
    // Urgency accumulates: a change swept up by a later flush is written under
    // that flush's terms, never demoted back to an ordinary write.
    const merged: SyncOptions = {
      immediate: options.immediate || (pending?.options.immediate ?? false),
      unloading: options.unloading || (pending?.options.unloading ?? false),
    };
    pending = { id, session, options: merged };
    const settled = new Promise<void>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

    if (options.unloading) {
      // Deliberately not queued. This is the document's last chance to write
      // anything, and a continuation waiting behind a request that dies with
      // the page never runs at all. Overlapping is never worse than that: at
      // worst the two land out of order and the server keeps the older
      // snapshot, which is exactly what queueing would have left it with.
      void runWrite();
    } else if (
      options.immediate ||
      (queuedWrites === 0 && windowTimer === undefined)
    ) {
      // The leading edge, and every change arriving after a quiet spell.
      enqueueWrite();
    }

    return settled;
  };
}
