import { useEffect, useState } from 'react';

/**
 * How long a value has to stand unchanged before it counts as an answer worth
 * saying aloud. Long enough to ride out the pending-then-answered flicker of a
 * re-check and a collaborator's burst of edits, short enough that a researcher
 * who has just done something hears its result while it is still relevant.
 */
export const SETTLE_MS = 600;

/**
 * `value`, once it has stopped changing for `delayMs`.
 *
 * A live region that spoke every intermediate value would talk over the
 * researcher for as long as anything was moving; this is how announcements are
 * limited to settled changes. The first value is returned at once, so there is
 * nothing to wait for on mount.
 */
export function useSettledValue<T>(value: T, delayMs: number = SETTLE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
