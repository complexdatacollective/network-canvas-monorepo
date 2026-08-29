// Holders of participant data that can only be written while the session DEK
// is live, and the bounded window `lock()` gives them to write it.
//
// Clearing the DEK is a point of no return: `recordCrypto` fails closed for a
// secured vault with no key, so any write that lands afterwards is refused and
// whatever it carried is gone. The mounted interview is the holder that matters
// — the engine's autosave keeps recent answers in a 3s trailing debounce, and a
// tab frozen inside that window locks on idle the moment it comes back, before
// anything has written them. Registrants hand back a flush that empties their
// buffer synchronously enough to run first; see AuthContext's `lock`.
//
// Module scope, alongside `sessionKey`'s DEK holder that this guards, so a
// registrant does not have to sit under a particular provider to reach it.

const flushers = new Set<() => Promise<void>>();

/**
 * Register a flush to run before the session DEK is cleared. Returns a
 * disposer; call it when the registrant tears down.
 */
export function registerPreLockFlush(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

// A flush that never settles must not hold the vault open past its idle
// deadline, so the wait is bounded and the lock proceeds either way. Two
// seconds is far more than an IndexedDB write of an interview network needs,
// and is nothing against the shortest idle timeout the app offers (one minute).
// Giving up is safe rather than destructive: a write that has already passed
// its encrypt step completes against the key it captured, so the bound decides
// only how long we wait — never whether an in-progress write survives.
export const PRE_LOCK_FLUSH_TIMEOUT_MS = 2_000;

/**
 * Run every registered flush, giving up after `PRE_LOCK_FLUSH_TIMEOUT_MS`.
 * Never rejects: locking must not depend on a flush succeeding.
 */
export async function runPreLockFlush(): Promise<void> {
  if (flushers.size === 0) return;

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = setTimeout(resolve, PRE_LOCK_FLUSH_TIMEOUT_MS);
  });

  // One registrant failing must neither strand its siblings nor leave the
  // vault unlocked, so each failure is reported and stepped over.
  const allFlushed = Promise.all(
    [...flushers].map(async (flush) => {
      try {
        await flush();
      } catch (error) {
        console.error(
          'A pre-lock flush failed; data it was holding may be lost',
          error,
        );
      }
    }),
  );

  try {
    await Promise.race([allFlushed, deadline]);
  } finally {
    clearTimeout(deadlineTimer);
  }
}
