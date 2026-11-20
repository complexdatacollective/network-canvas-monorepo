'use client';

import { useAnimationFrame, useInView } from 'motion/react';
import { useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

export const outline = 'stroke-navy-taupe';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const segment = (t: number, start: number, duration: number) =>
  clamp((t - start) / duration);

export const backOut = (x: number) => {
  if (x <= 0) return 0;
  const c = 1.8;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

// SVG `scale(0)` collapses a group's transform; keep it just above zero.
export const grow = (k: number) => Math.max(0.001, k);

// Each tick of the clock re-renders a whole illustration, so the clock ticks
// at the rate of drawn animation, 30 frames a second, rather than of the
// display. A frame arrives a little early as often as late, hence the
// allowance: without it a 60Hz display would tick at 20.
const TICK = 1000 / 30 - 2;

// The longest step the clock takes in one tick, in milliseconds. A tab left
// in the background stops ticking; when it comes back, the illustration
// carries on from where it was instead of jumping ahead by the time away.
const LONGEST_STEP = 100;

// Seconds of illustration time, advancing while the drawing is in view.
// Looping scenes start at `stillTime` and take it modulo their loop; a scene
// that plays once passes `from: 0`. With reduced motion it stays on
// `stillTime`.
export function useIllustrationClock(
  stillTime: number,
  { from = stillTime }: { from?: number } = {},
) {
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const inView = useInView(ref, { amount: 0.2 });
  const [time, setTime] = useState(from);
  const waited = useRef(0);

  useAnimationFrame((_, delta) => {
    if (!inView || reduceMotion) {
      waited.current = 0;
      return;
    }
    waited.current += delta;
    if (waited.current < TICK) return;
    const step = Math.min(waited.current, LONGEST_STEP);
    waited.current = 0;
    setTime((current) => current + step / 1000);
  });

  return { ref, time: reduceMotion ? stillTime : time };
}
