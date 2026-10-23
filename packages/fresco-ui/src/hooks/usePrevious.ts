'use client';

import { useState } from 'react';

/**
 * The value `value` held before it last changed, or `undefined` until it has
 * changed once. Changes are compared with `Object.is`.
 *
 * Re-renders that leave `value` as it is keep reporting the same previous
 * value; it moves on only when `value` changes again. Tracked by adjusting
 * state while rendering, so the answer is settled in the render that sees the
 * change rather than read from a ref a commit later.
 */
export default function usePrevious<T>(value: T): T | undefined {
  const [tracked, setTracked] = useState<{
    current: T;
    previous: T | undefined;
  }>({ current: value, previous: undefined });

  if (!Object.is(tracked.current, value)) {
    setTracked({ current: value, previous: tracked.current });
    return tracked.current;
  }

  return tracked.previous;
}
