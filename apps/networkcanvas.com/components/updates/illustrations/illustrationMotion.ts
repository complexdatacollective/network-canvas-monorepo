'use client';

import { useAnimationFrame, useInView, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';

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

export function useIllustrationClock(stillTime: number) {
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion();
  const inView = useInView(ref, { amount: 0.2 });
  const [time, setTime] = useState(stillTime);

  useAnimationFrame((_, delta) => {
    if (!inView || reduceMotion) return;
    setTime((current) => current + delta / 1000);
  });

  return { ref, time: reduceMotion ? stillTime : time };
}
