import { useEffect, useState } from 'react';

/**
 * The current time in milliseconds, read once when the component mounts and
 * again every `intervalMs` afterwards.
 *
 * `Date.now()` cannot be called while rendering (a render must give the same
 * answer each time it runs), so a screen that compares a stored expiry with
 * "now" takes the time from here. The interval is how a deadline that passes
 * while the screen is open takes effect without a reload.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
