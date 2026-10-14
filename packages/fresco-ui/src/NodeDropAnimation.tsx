'use client';

import { type Easing, motion } from 'motion/react';
import { useId } from 'react';

import { useShouldSkipAnimations } from './hooks/useSafeAnimate';
import { cva, cx, type VariantProps } from './utils/cva';

const DURATION = 3.4;

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

// Scene coordinates, in viewBox units. The drop zone sits centred in the
// lower part of the scene, leaving room above it for the node to arrive.
const WIDTH = 160;
const HEIGHT = 90;
const ZONE = { x: 30, y: 26, width: 100, height: 56, radius: 14 };
const TARGET = { x: 80, y: 54 };
// The node comes in from above the scene, a little to the left.
const FROM = { x: TARGET.x - 18, y: -16 };
const NODE_RADIUS = 12;
// The pointer's tip rests on the node a little below its centre, and leaves
// up and to the right once the node is down.
const TIP = { x: 2, y: 3 };
const EXIT = { x: TARGET.x + 30, y: -24 };

// Moments in the loop, as fractions of its duration.
const ARRIVE = 0.4;
const LET_GO = 0.46;
const GONE = 0.66;

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

// The pointer carries a node down into the drop zone, sets it down and
// leaves. The node stays a moment, fades, and the loop starts again.
const node = tracks({
  x: {
    times: [0, ARRIVE, 1],
    values: [FROM.x, TARGET.x, TARGET.x],
    ease: ['easeOut', 'linear'],
  },
  y: {
    times: [0, ARRIVE, 1],
    values: [FROM.y, TARGET.y, TARGET.y],
    ease: ['easeInOut', 'linear'],
  },
  scale: {
    times: [0, ARRIVE, LET_GO, 1],
    values: [1.1, 1.1, 1, 1],
  },
  opacity: {
    times: [0, 0.82, 0.92, 1],
    values: [1, 1, 0, 0],
  },
});

const pointer = tracks({
  x: {
    times: [0, ARRIVE, LET_GO, GONE, 1],
    values: [
      FROM.x + TIP.x,
      TARGET.x + TIP.x,
      TARGET.x + TIP.x,
      EXIT.x,
      EXIT.x,
    ],
    ease: ['easeOut', 'linear', 'easeIn', 'linear'],
  },
  y: {
    times: [0, ARRIVE, LET_GO, GONE, 1],
    values: [
      FROM.y + TIP.y,
      TARGET.y + TIP.y,
      TARGET.y + TIP.y,
      EXIT.y,
      EXIT.y,
    ],
    ease: ['easeInOut', 'linear', 'easeIn', 'linear'],
  },
  scale: {
    times: [0, ARRIVE, LET_GO, 1],
    values: [0.85, 0.85, 1, 1],
  },
});

// The zone fills with the accent colour as the node crosses into it, and
// stays lit while it holds the node.
const fill = tracks({
  opacity: {
    times: [0, 0.22, 0.34, 0.82, 0.92, 1],
    values: [0, 0, 0.35, 0.25, 0, 0],
  },
});

function Zone({ filled }: { filled?: boolean }) {
  return (
    <>
      {filled && (
        <rect
          x={ZONE.x}
          y={ZONE.y}
          width={ZONE.width}
          height={ZONE.height}
          rx={ZONE.radius}
          fill="var(--accent)"
          opacity={0.35}
        />
      )}
      <rect
        x={ZONE.x}
        y={ZONE.y}
        width={ZONE.width}
        height={ZONE.height}
        rx={ZONE.radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        opacity={0.6}
      />
    </>
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

type NodeDropAnimationProps = {
  className?: string;
} & VariantProps<typeof nodeDropVariants>;

/**
 * A decorative loop of a pointer bringing a node down into a dashed drop
 * zone, which fills with colour as the node arrives and keeps it once
 * dropped. Use it on an empty drop target to show that people can be dropped
 * there. It takes its colours from the surrounding text colour and the
 * theme's accent, and is hidden from assistive technology, so pair it with
 * text that says what to do. With reduced motion it shows a still frame of
 * the node held in the lit zone.
 */
export default function NodeDropAnimation({
  size,
  className,
}: NodeDropAnimationProps) {
  const skipAnimations = useShouldSkipAnimations();
  // The node and pointer fade in through the top edge as they arrive.
  const id = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const fadeId = `node-drop-fade-${id}`;
  const maskId = `node-drop-mask-${id}`;

  const svgProps = {
    'aria-hidden': true,
    'data-testid': 'node-drop-animation',
    'viewBox': `0 0 ${WIDTH} ${HEIGHT}`,
    'className': cx(nodeDropVariants({ size }), className),
  } as const;

  if (skipAnimations) {
    return (
      <svg {...svgProps} data-still="">
        <Zone filled />
        <g transform={`translate(${TARGET.x} ${TARGET.y}) scale(1.1)`}>
          <Node />
        </g>
        <g transform={`translate(${TARGET.x + TIP.x} ${TARGET.y + TIP.y})`}>
          <Pointer />
        </g>
      </svg>
    );
  }

  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.3" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect
            x={-20}
            y={0}
            width={WIDTH + 40}
            height={HEIGHT}
            fill={`url(#${fadeId})`}
          />
        </mask>
      </defs>
      <motion.rect
        x={ZONE.x}
        y={ZONE.y}
        width={ZONE.width}
        height={ZONE.height}
        rx={ZONE.radius}
        fill="var(--accent)"
        {...fill}
      />
      <Zone />
      <g mask={`url(#${maskId})`}>
        <motion.g {...node}>
          <Node />
        </motion.g>
        <motion.g {...pointer}>
          <Pointer />
        </motion.g>
      </g>
    </svg>
  );
}
