import type { SessionPayload, SyncHandler } from './types';

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
 * - Only one write is ever on the wire; writes run in order.
 * - Every returned promise resolves when a write covering that change lands,
 *   so the engine can await a flush and know the answers are stored. This is
 *   why it is not `es-toolkit`'s `debounce`, whose `flush()` returns void and
 *   cannot be awaited.
 * - A failed write rejects the promises waiting on it, so the engine's own
 *   retry still applies.
 */
export function createDebouncedSyncHandler(
  write: SyncHandler,
  { waitMs }: { waitMs: number },
): SyncHandler {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void };
  type Pending = { id: string; session: SessionPayload; immediate: boolean };

  let pending: Pending | null = null;
  let waiters: Waiter[] = [];
  // Set while we are inside `waitMs` of the last write. Its presence is what
  // makes a change wait; its absence is what lets one through immediately.
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (!pending) return;
    closeWindow();

    const { id, session, immediate } = pending;
    const settling = waiters;
    pending = null;
    waiters = [];

    try {
      await write(id, session, { immediate });
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
    queue = queue.then(runWrite);
  };

  return (id, session, options) => {
    const immediate = options.immediate || (pending?.immediate ?? false);
    pending = { id, session, immediate };
    const settled = new Promise<void>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

    // Write now when told to, and when no window is open — the latter is the
    // leading edge, and also every change that arrives after a quiet spell.
    if (options.immediate || windowTimer === undefined) enqueueWrite();

    return settled;
  };
}
