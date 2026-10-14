'use client';

import { motion } from 'motion/react';

import { useShouldSkipAnimations } from './hooks/useSafeAnimate';
import { cva, cx, type VariantProps } from './utils/cva';

const DURATION = 3.2;

const nodeDropVariants = cva({
  base: 'shrink-0 overflow-visible',
  variants: {
    size: {
      sm: 'h-14',
      md: 'h-22',
      lg: 'h-32',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

// Scene coordinates, in viewBox units.
const START = { x: 40, y: 38 };
const LIFTED = { x: 40, y: 33 };
const MIDWAY = { x: 80, y: 22 };
const ABOVE_TARGET = { x: 118, y: 48 };
const TARGET = { x: 118, y: 62 };
const NODE_RADIUS = 13;
const TARGET_RADIUS = 16;

const repeat = (times: number[]) => ({
  duration: DURATION,
  times,
  ease: 'easeInOut' as const,
  repeat: Infinity,
});

// The hand presses the node, carries it in an arc to the target, lets go
// and leaves; the node stays in the target until the scene fades and loops.
const nodeTimes = [0, 0.06, 0.14, 0.3, 0.48, 0.58, 0.64, 0.88, 0.96, 1];
const nodeKeyframes = {
  x: [
    START.x,
    START.x,
    LIFTED.x,
    MIDWAY.x,
    ABOVE_TARGET.x,
    TARGET.x,
    TARGET.x,
    TARGET.x,
    TARGET.x,
    START.x,
  ],
  y: [
    START.y,
    START.y,
    LIFTED.y,
    MIDWAY.y,
    ABOVE_TARGET.y,
    TARGET.y,
    TARGET.y,
    TARGET.y,
    TARGET.y,
    START.y,
  ],
  scale: [1, 1, 1.12, 1.12, 1.12, 0.92, 1, 1, 1, 1],
  opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
};

const handTimes = [0, 0.06, 0.1, 0.14, 0.3, 0.48, 0.58, 0.64, 0.76, 0.88, 1];
const handKeyframes = {
  x: [
    START.x + 14,
    START.x,
    START.x,
    LIFTED.x,
    MIDWAY.x,
    ABOVE_TARGET.x,
    TARGET.x,
    TARGET.x + 2,
    TARGET.x + 22,
    TARGET.x + 22,
    START.x + 14,
  ],
  y: [
    START.y + 16,
    START.y,
    START.y,
    LIFTED.y,
    MIDWAY.y,
    ABOVE_TARGET.y,
    TARGET.y,
    TARGET.y - 4,
    TARGET.y + 8,
    TARGET.y + 8,
    START.y + 16,
  ],
  scale: [1, 1, 0.9, 0.9, 0.9, 0.9, 0.9, 1, 1, 1, 1],
  opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
};

// The target lights up as the node arrives, grows to meet it, and keeps a
// gentle glow once the node is in place.
const targetTimes = [0, 0.4, 0.5, 0.58, 0.66, 0.88, 0.96, 1];
const targetKeyframes = {
  scale: [1, 1, 1.15, 1.15, 1, 1, 1, 1],
};
const glowKeyframes = {
  opacity: [0, 0, 1, 1, 0.55, 0.55, 0, 0],
};
const ringKeyframes = {
  opacity: [0.5, 0.5, 0.9, 0.9, 0.5, 0.5, 0.5, 0.5],
};
const rippleTimes = [0, 0.58, 0.8, 1];
const rippleKeyframes = {
  scale: [1, 1, 1.7, 1.7],
  opacity: [0, 0.6, 0, 0],
};

// Each track starts from its first keyframe.
function first(keyframes: Record<string, number[]>) {
  return Object.fromEntries(
    Object.entries(keyframes).map(([key, values]) => [key, values[0]]),
  );
}

function Hand() {
  // A pointing hand drawn from simple shapes, with the fingertip resting just
  // below the origin. Filled with the surface colour and outlined, so it
  // stands out against the node it holds.
  return (
    <g
      transform="translate(0 4) scale(1.9) translate(-9.25 -1)"
      fill="var(--surface)"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinejoin="round"
    >
      <rect
        x="2.4"
        y="13"
        width="7.6"
        height="4.2"
        rx="2.1"
        transform="rotate(35 6.2 15.1)"
      />
      <rect x="15.4" y="9.6" width="3.9" height="7.4" rx="1.95" />
      <rect x="11.5" y="8" width="4.1" height="8.5" rx="2.05" />
      <rect x="7" y="11.5" width="12.3" height="10.5" rx="4.2" />
      <rect x="7" y="1" width="4.5" height="14.5" rx="2.25" />
    </g>
  );
}

function Node() {
  // Two tones split on the diagonal, like a node in the interview.
  return (
    <g>
      <circle r={NODE_RADIUS} fill="currentColor" opacity={0.9} />
      <path
        d={`M ${NODE_RADIUS * Math.SQRT1_2} ${-NODE_RADIUS * Math.SQRT1_2} A ${NODE_RADIUS} ${NODE_RADIUS} 0 0 1 ${-NODE_RADIUS * Math.SQRT1_2} ${NODE_RADIUS * Math.SQRT1_2} Z`}
        fill="var(--surface)"
        opacity={0.25}
      />
    </g>
  );
}

type NodeDropAnimationProps = {
  className?: string;
} & VariantProps<typeof nodeDropVariants>;

/**
 * A decorative loop of a hand dragging a node onto a drop target, which
 * lights up as the node arrives and keeps it once dropped. Use it on an empty
 * drop target to show that people can be dropped there. It takes its colours
 * from the surrounding text colour and the theme's accent, and is hidden from
 * assistive technology, so pair it with text that says what to do. With
 * reduced motion it shows a still frame of the node held over the target.
 */
export default function NodeDropAnimation({
  size,
  className,
}: NodeDropAnimationProps) {
  const skipAnimations = useShouldSkipAnimations();

  const svgProps = {
    'aria-hidden': true,
    'data-testid': 'node-drop-animation',
    'viewBox': '0 0 160 90',
    'className': cx(nodeDropVariants({ size }), className),
  } as const;

  if (skipAnimations) {
    return (
      <svg {...svgProps} data-still="">
        <g transform={`translate(${TARGET.x} ${TARGET.y})`}>
          <circle r={TARGET_RADIUS} fill="var(--accent)" opacity={0.45} />
          <circle
            r={TARGET_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.9}
          />
        </g>
        <g transform={`translate(${ABOVE_TARGET.x} ${ABOVE_TARGET.y - 6})`}>
          <g transform="scale(1.12)">
            <Node />
          </g>
          <Hand />
        </g>
      </svg>
    );
  }

  return (
    <svg {...svgProps}>
      <g transform={`translate(${TARGET.x} ${TARGET.y})`}>
        <motion.g
          initial={first(targetKeyframes)}
          animate={targetKeyframes}
          transition={repeat(targetTimes)}
        >
          <motion.circle
            r={TARGET_RADIUS}
            fill="var(--accent)"
            initial={first(glowKeyframes)}
            animate={glowKeyframes}
            transition={repeat(targetTimes)}
          />
          <motion.circle
            r={TARGET_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            initial={first(ringKeyframes)}
            animate={ringKeyframes}
            transition={repeat(targetTimes)}
          />
        </motion.g>
        <motion.circle
          r={TARGET_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          initial={first(rippleKeyframes)}
          animate={rippleKeyframes}
          transition={repeat(rippleTimes)}
        />
      </g>
      <motion.g
        initial={first(nodeKeyframes)}
        animate={nodeKeyframes}
        transition={repeat(nodeTimes)}
      >
        <Node />
      </motion.g>
      <motion.g
        initial={first(handKeyframes)}
        animate={handKeyframes}
        transition={repeat(handTimes)}
      >
        <Hand />
      </motion.g>
    </svg>
  );
}
