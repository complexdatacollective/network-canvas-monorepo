'use client';

import { useAnimationFrame, useInView } from 'motion/react';
import { useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

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

// SVG `scale(0)` collapses a group's transform; keep it just above zero.
export const grow = (k: number) => Math.max(0.001, k);

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

  useAnimationFrame((_, delta) => {
    if (!inView || reduceMotion) return;
    setTime((current) => current + delta / 1000);
  });

  return { ref, time: reduceMotion ? stillTime : time };
}
