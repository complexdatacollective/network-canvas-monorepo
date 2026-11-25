'use client';

import { motion, type Transition } from 'motion/react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

type ScrollDownIconProps = {
  size?: number;
  className?: string;
};

const CHEVRON = 'm7 9 5 5 5-5';

// Each chevron travels the height of the icon once per loop, fading in at the
// top and out at the bottom. The second runs half a loop behind the first, so
// two are always in view and the stream never stops.
const flow = {
  duration: 2.4,
  ease: 'linear',
  repeat: Number.POSITIVE_INFINITY,
} satisfies Transition;

const flowAnimation = {
  y: [-7, 7],
  opacity: [0, 1, 1, 0],
};

const flowTransition = {
  y: flow,
  opacity: { ...flow, times: [0, 0.3, 0.7, 1] },
} satisfies Transition;

/**
 * A lucide-style "scroll down to see more" icon: chevrons drifting
 * continuously downwards. Under reduced motion it is drawn still, as lucide's
 * `chevrons-down`.
 */
export default function ScrollDownIcon({
  size = 24,
  className,
}: ScrollDownIconProps) {
  const animate = !usePrefersReducedMotion();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {animate ? (
        <>
          <motion.path
            d={CHEVRON}
            initial={{ opacity: 0 }}
            animate={flowAnimation}
            transition={flowTransition}
          />
          <motion.path
            d={CHEVRON}
            initial={{ opacity: 0 }}
            animate={flowAnimation}
            transition={{
              y: { ...flowTransition.y, delay: -flow.duration / 2 },
              opacity: { ...flowTransition.opacity, delay: -flow.duration / 2 },
            }}
          />
        </>
      ) : (
        <>
          <path d="m7 6 5 5 5-5" />
          <path d="m7 13 5 5 5-5" />
        </>
      )}
    </svg>
  );
}
