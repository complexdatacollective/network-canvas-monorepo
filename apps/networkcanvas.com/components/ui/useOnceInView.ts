'use client';

import { inView, type Transition } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

/** The ease the homepage's one-shot entrances settle with. */
export const entranceEase = [0.22, 1, 0.36, 1] as const;

/** A curve that overshoots a little before settling: a node popping on. */
export const popEase = [0.34, 1.56, 0.64, 1] as const;

/**
 * Plays an entrance once, when the element on `ref` first comes `amount` of
 * the way into view; it then stays. Under reduced motion `play` is true
 * as soon as the page has hydrated, and `timing` collapses every transition to
 * an instant one. The server and the first client render agree on the
 * entrance's starting state whatever the preference, so it never causes a
 * hydration mismatch.
 */
export function useOnceInView<T extends Element>(amount: number) {
  const ref = useRef<T>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduce = useHasHydrated() && prefersReducedMotion === true;
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return inView(
      element,
      () => {
        setSeen(true);
      },
      { amount },
    );
  }, [amount]);

  const timing = (transition: Transition): Transition =>
    reduce ? { duration: 0, delay: 0 } : transition;

  return { ref, play: seen || reduce, timing };
}
