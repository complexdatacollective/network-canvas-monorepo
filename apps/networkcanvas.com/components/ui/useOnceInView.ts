'use client';

import { inView, type Transition } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

/** The ease the homepage's one-shot entrances settle with. */
export const entranceEase = [0.22, 1, 0.36, 1] as const;

/** A curve that overshoots a little before settling: a node popping on. */
export const popEase = [0.34, 1.56, 0.64, 1] as const;

/** How far up from the bottom of the viewport the entrance line sits. */
const ENTRANCE_LINE = 0.2;

/**
 * Where an entrance starts: once any part of the element rises above a line a
 * fifth of the way up from the bottom of the viewport. The line is measured on
 * the viewport, not the element, so a section taller than the window (a short
 * window, or a page zoomed in) still reaches it; a threshold given as a
 * fraction of the element would not. The inset is in px, from the viewport's
 * height, as in `SectionHeading`: a percentage would be resolved against its
 * width, and on a wide, short window put the line near the top.
 */
export function entranceMargin(viewportHeight: number) {
  return `0px 0px ${-Math.round(viewportHeight * ENTRANCE_LINE)}px 0px` as const;
}

/**
 * Plays an entrance once, when the element on `ref` first rises past the
 * entrance line; it then stays. Under reduced motion `play` is true as soon as
 * the page has hydrated, and `timing` collapses every transition to an instant
 * one. The server and the first client render agree on the entrance's starting
 * state whatever the preference, so it never causes a hydration mismatch.
 */
export function useOnceInView<T extends Element>() {
  const ref = useRef<T>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduce = useHasHydrated() && prefersReducedMotion === true;
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    // Re-observe on resize so the line follows the viewport's height.
    let stop = () => {};
    const observe = () => {
      stop();
      stop = inView(
        element,
        () => {
          setSeen(true);
          stop();
          window.removeEventListener('resize', observe);
        },
        { margin: entranceMargin(window.innerHeight), amount: 'some' },
      );
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      stop();
      window.removeEventListener('resize', observe);
    };
  }, []);

  const timing = (transition: Transition): Transition =>
    reduce ? { duration: 0, delay: 0 } : transition;

  return { ref, play: seen || reduce, timing };
}
