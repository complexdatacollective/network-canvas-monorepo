import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A getter for the latest value rendered, for code that runs later than the
 * render that built it: a validation rule a field registered on its first
 * render, a callback handed to a store, a handler held by a long-lived
 * subscription.
 *
 * The value is stored after each commit, in a layout effect, so the getter
 * must be called from a handler, an effect or a rule's run, never while
 * rendering, where it would return the previous commit's value. The getter's
 * identity never changes, so it is safe to close over in a memoised object
 * whose identity is part of what a field registers with.
 *
 * `useEffectEvent` is the right tool when the callback is only called from an
 * effect in the same component; it cannot be passed to another component or
 * held in a registration, which is what this is for.
 */
export function useLatest<T>(value: T): () => T {
  const held = useRef(value);
  useLayoutEffect(() => {
    held.current = value;
  });
  return useCallback(() => held.current, []);
}
