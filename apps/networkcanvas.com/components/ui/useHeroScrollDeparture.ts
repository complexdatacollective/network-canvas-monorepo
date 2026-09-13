'use client';

import {
  type MotionStyle,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import type { RefObject } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';

import { heroScrollSpring } from './scrollDrivenMotion';

type HeroScrollDepartureOptions = {
  distance?: number;
  restingScale?: number;
};

export function useHeroScrollDeparture<T extends HTMLElement>(
  target: RefObject<T | null>,
  { distance = 96, restingScale = 0.93 }: HeroScrollDepartureOptions = {},
): MotionStyle | undefined {
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useHasHydrated();
  const { scrollYProgress } = useScroll({
    target,
    offset: ['start start', 'end start'],
  });
  const progress = useSpring(scrollYProgress, heroScrollSpring);
  // Opacity on this wrapper would form a Backdrop Root and prevent descendant
  // translucent surfaces from blurring the page background while scrolling.
  const scale = useTransform(progress, [0, 0.68, 1], [1, 0.985, restingScale]);
  const y = useTransform(progress, [0, 1], [0, -distance]);

  return hasHydrated && shouldReduceMotion === false ? { scale, y } : undefined;
}
