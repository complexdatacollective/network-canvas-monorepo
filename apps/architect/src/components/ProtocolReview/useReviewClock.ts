import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Whether the browser reports a network connection, following its `online`
 * and `offline` events.
 *
 * The same as `@codaco/interview`'s `useOnline`, which is exported only from
 * that package's root: its root module is marked as having side effects, so
 * importing the hook from it would put the whole interview runtime in the
 * editor's bundle for twenty lines.
 */
export const useOnline = (): boolean => {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
};

/** The longest delay `setTimeout` honours. */
const MAX_DELAY = 2 ** 31 - 1;

/**
 * The time, as of the last render that needed it: refreshed when any of
 * `deadlines` (epoch milliseconds) passes, so a limit that lifts or a reset
 * that arrives shows without anything else changing.
 */
export const useNowUntil = (deadlines: readonly (number | null)[]) => {
  const [now, setNow] = useState(Date.now);
  const next = deadlines.reduce<number | null>(
    (soonest, deadline) =>
      deadline !== null &&
      deadline > now &&
      (soonest === null || deadline < soonest)
        ? deadline
        : soonest,
    null,
  );
  useEffect(() => {
    if (next === null) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(next - Date.now() + 50, MAX_DELAY),
    );
    return () => clearTimeout(timer);
  }, [next]);
  return now;
};
