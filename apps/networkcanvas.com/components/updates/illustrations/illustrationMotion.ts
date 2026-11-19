'use client';

import { useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { startFrameLoop } from '~/components/ui/frameLoop';

export const TAU = Math.PI * 2;
export const outline = 'stroke-navy-taupe';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const segment = (t: number, start: number, duration: number) =>
  clamp((t - start) / duration);

export const backOut = (x: number) => {
  if (x <= 0) return 0;
  const c = 1.8;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

export const inCubic = (x: number) => x * x * x;

// Each tick of the clock re-renders a whole illustration, so the clock ticks
// at the rate of drawn animation rather than of the display.
const FRAMES_PER_SECOND = 30;

// The longest step the clock takes in one tick. A tab left in the background
// stops ticking; when it comes back, the illustration carries on from where
// it was instead of jumping ahead by the time away.
const LONGEST_STEP = 100;

/**
 * The time an illustration is drawn at, in seconds. It advances while the
 * illustration is in view, and holds at `stillTime` under reduced motion.
 */
export function useIllustrationClock(stillTime: number) {
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const inView = useInView(ref, { amount: 0.2 });
  const [time, setTime] = useState(stillTime);
  const running = inView && !reduceMotion;

  useEffect(() => {
    if (!running) return undefined;
    return startFrameLoop((elapsed) => {
      setTime((current) => current + Math.min(elapsed, LONGEST_STEP) / 1000);
    }, FRAMES_PER_SECOND);
  }, [running]);

  return { ref, time: reduceMotion ? stillTime : time };
}
