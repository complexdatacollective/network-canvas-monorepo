import { useCallback, useRef } from 'react';

/**
 * Wraps an async operation so that at most one call is ever in flight: while
 * one is running, another is refused outright.
 *
 * The `disabled` prop of the control that invokes it is NOT this guard, and no
 * operation that writes anything durable should be left resting on it:
 *
 * - It is React state rendered from the operation itself, so between the first
 *   call and the re-render that sets it there is a window in which the control
 *   is still live. Two clicks in one tick both land.
 * - It belongs to one button. The same handler is reachable from a keyboard
 *   activation, a second control, or a caller that never touched the UI, and
 *   none of those consult it.
 * - Each call's own `finally` clears the shared "busy" flag, so the first to
 *   settle re-enables the control while the second is still running.
 *
 * The latch is a ref rather than state, deliberately: it has to be true for a
 * second call raised in the same tick as the first, before React has
 * re-rendered anything.
 *
 * The wrapper's identity follows `operation`, so a caller that already
 * memoises its handler keeps the memoisation it had.
 */
export const useSingleFlight = <TArgs extends unknown[]>(
  operation: (...args: TArgs) => Promise<unknown>,
): ((...args: TArgs) => Promise<void>) => {
  const inFlight = useRef(false);

  return useCallback(
    async (...args: TArgs) => {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        await operation(...args);
      } finally {
        inFlight.current = false;
      }
    },
    [operation],
  );
};
