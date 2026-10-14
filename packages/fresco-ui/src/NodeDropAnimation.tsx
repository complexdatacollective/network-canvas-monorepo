'use client';

import { type Easing, motion } from 'motion/react';

import { useShouldSkipAnimations } from './hooks/useSafeAnimate';
import { cva, cx, type VariantProps } from './utils/cva';

const DURATION = 3.6;

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

// Scene coordinates, in viewBox units. The start and the target sit
// symmetrically about the middle of the frame.
const WIDTH = 160;
const HEIGHT = 90;
const START = { x: 50, y: 46 };
const TARGET = { x: 110, y: 46 };
const LIFT = 4;
const APEX_Y = 26;
const NODE_RADIUS = 12;
const TARGET_RADIUS = 15;
// The pointer's tip rests on the node a little below its centre, and waits
// below and to the right of the start between drags.
const TIP = { x: 2, y: 3 };
const REST = { x: START.x + 12, y: START.y + 16 };

type Track = { times: number[]; values: number[]; ease?: Easing[] };

// Builds Motion's animate and transition props from per-property tracks
// that share one looping duration.
function tracks(spec: Record<string, Track>) {
  const initial: Record<string, number> = {};
  const animate: Record<string, number[]> = {};
  const transition: Record<string, object> = {};
  for (const [key, { times, values, ease }] of Object.entries(spec)) {
    initial[key] = values[0] ?? 0;
    animate[key] = values;
    transition[key] = {
      duration: DURATION,
      times,
      ease: ease ?? 'easeInOut',
      repeat: Infinity,
    };
  }
  return { initial, animate, transition };
}

// A node appears, the pointer arrives and presses it, carries it in one
// smooth arc to the target and lets go. The pointer goes back to wait while
// the dropped node fades from the target, and the loop starts again.
const node = tracks({
  x: {
    times: [0, 0.22, 0.56, 0.93, 0.94, 1],
    values: [START.x, START.x, TARGET.x, TARGET.x, START.x, START.x],
    ease: ['linear', 'easeInOut', 'linear', 'linear', 'linear'],
  },
  y: {
    times: [0, 0.16, 0.22, 0.39, 0.56, 1],
    values: [START.y, START.y, START.y - LIFT, APEX_Y, TARGET.y, TARGET.y],
    ease: ['linear', 'easeOut', 'easeOut', 'easeIn', 'linear'],
  },
  scale: {
    times: [0, 0.08, 0.16, 0.22, 0.56, 0.62, 1],
    values: [0.6, 1, 1, 1.1, 1.1, 1, 1],
  },
  opacity: {
    times: [0, 0.08, 0.82, 0.92, 1],
    values: [0, 1, 1, 0, 0],
  },
});

const pointer = tracks({
  x: {
    times: [0, 0.16, 0.22, 0.56, 0.62, 0.8, 1],
    values: [
      REST.x,
      START.x + TIP.x,
      START.x + TIP.x,
      TARGET.x + TIP.x,
      TARGET.x + TIP.x,
      REST.x,
      REST.x,
    ],
    ease: ['easeInOut', 'linear', 'easeInOut', 'linear', 'easeInOut', 'linear'],
  },
  y: {
    times: [0, 0.16, 0.22, 0.39, 0.56, 0.62, 0.8, 1],
    values: [
      REST.y,
      START.y + TIP.y,
      START.y - LIFT + TIP.y,
      APEX_Y + TIP.y,
      TARGET.y + TIP.y,
      TARGET.y + TIP.y,
      REST.y,
      REST.y,
    ],
    ease: [
      'easeInOut',
      'easeOut',
      'easeOut',
      'easeIn',
      'linear',
      'easeInOut',
      'linear',
    ],
  },
  scale: {
    times: [0, 0.16, 0.22, 0.56, 0.62, 1],
    values: [1, 1, 0.85, 0.85, 1, 1],
  },
});

// The target lights up and grows to meet the node as it arrives, ripples
// when it lands, and glows while it holds the node.
const target = tracks({
  scale: {
    times: [0, 0.42, 0.52, 0.6, 0.68, 1],
    values: [1, 1, 1.15, 1.15, 1, 1],
  },
});
const glow = tracks({
  opacity: {
    times: [0, 0.4, 0.52, 0.62, 0.82, 0.92, 1],
    values: [0, 0, 1, 0.9, 0.6, 0, 0],
  },
});
const ripple = tracks({
  scale: { times: [0, 0.58, 0.8, 1], values: [1, 1, 1.7, 1.7] },
  opacity: { times: [0, 0.58, 0.8, 1], values: [0, 0.6, 0, 0] },
});

function Frame() {
  return (
    <rect
      x={4}
      y={4}
      width={WIDTH - 8}
      height={HEIGHT - 8}
      rx={14}
      fill="currentColor"
      fillOpacity={0.06}
      stroke="currentColor"
      strokeOpacity={0.15}
    />
  );
}

function Pointer() {
  // A plain arrow cursor with its tip at the origin.
  return (
    <path
      d="M0 0 L0 15 L4 11.5 L7 18 L9.5 17 L6.6 10.6 L11.5 10.6 Z"
      transform="scale(1.2)"
      fill="var(--surface)"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinejoin="round"
    />
  );
}

function Node() {
  // Two tones split on the diagonal, like a node in the interview.
  const d = NODE_RADIUS * Math.SQRT1_2;
  return (
    <g>
      <circle r={NODE_RADIUS} fill="currentColor" opacity={0.9} />
      <path
        d={`M ${d} ${-d} A ${NODE_RADIUS} ${NODE_RADIUS} 0 0 1 ${-d} ${d} Z`}
        fill="var(--surface)"
        opacity={0.25}
      />
    </g>
  );
}

function TargetRing() {
  return (
    <circle
      r={TARGET_RADIUS}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeDasharray="4 3"
      opacity={0.6}
    />
  );
}

type NodeDropAnimationProps = {
  className?: string;
} & VariantProps<typeof nodeDropVariants>;

/**
 * A decorative loop, in a light frame, of a pointer dragging a node onto a
 * drop target, which lights up as the node arrives and keeps it once
 * dropped. Use it on an empty drop target to show that people can be dropped
 * there. It takes its colours from the surrounding text colour and the
 * theme's accent, and is hidden from assistive technology, so pair it with
 * text that says what to do. With reduced motion it shows a still frame of
 * the node held over the target.
 */
export default function NodeDropAnimation({
  size,
  className,
}: NodeDropAnimationProps) {
  const skipAnimations = useShouldSkipAnimations();

  const svgProps = {
    'aria-hidden': true,
    'data-testid': 'node-drop-animation',
    'viewBox': `0 0 ${WIDTH} ${HEIGHT}`,
    'className': cx(nodeDropVariants({ size }), className),
  } as const;

  if (skipAnimations) {
    const held = { x: TARGET.x, y: TARGET.y - 14 };
    return (
      <svg {...svgProps} data-still="">
        <Frame />
        <g transform={`translate(${TARGET.x} ${TARGET.y})`}>
          <circle r={TARGET_RADIUS} fill="var(--accent)" opacity={0.6} />
          <TargetRing />
        </g>
        <g transform={`translate(${held.x} ${held.y}) scale(1.1)`}>
          <Node />
        </g>
        <g transform={`translate(${held.x + TIP.x} ${held.y + TIP.y})`}>
          <Pointer />
        </g>
      </svg>
    );
  }

  return (
    <svg {...svgProps}>
      <Frame />
      <g transform={`translate(${TARGET.x} ${TARGET.y})`}>
        <motion.g {...target}>
          <motion.circle r={TARGET_RADIUS} fill="var(--accent)" {...glow} />
          <TargetRing />
        </motion.g>
        <motion.circle
          r={TARGET_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          {...ripple}
        />
      </g>
      <motion.g {...node}>
        <Node />
      </motion.g>
      <motion.g {...pointer}>
        <Pointer />
      </motion.g>
    </svg>
  );
}
