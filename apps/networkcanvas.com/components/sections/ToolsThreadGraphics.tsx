'use client';

import { type MotionValue, motion, useTransform } from 'motion/react';

import { cn } from '~/lib/cn';

import {
  type SegmentGeometry,
  type ThreadColor,
  threadColors,
} from './toolsThreadGeometry';

// The marks the Tools section's thread is drawn with: its strands, the nodes
// where it meets each tool, and the network where its strands rejoin.

/**
 * One strand of the thread. A dotted ghost shows the whole route; the solid
 * strand is drawn up to the reading line, with a glowing tip where it is.
 */
export function ThreadSegment({
  geometry,
  readY,
  gradientId,
  colors,
  motionEnabled,
}: {
  geometry: SegmentGeometry;
  readY: MotionValue<number>;
  gradientId: string;
  colors: readonly [ThreadColor, ThreadColor];
  motionEnabled: boolean;
}) {
  const { d, from, to, xs, ys, fractions } = geometry;
  const first = ys[0] ?? 0;
  const last = ys.at(-1) ?? first + 1;
  const drawn = useTransform(readY, ys, fractions);
  const tipX = useTransform(readY, ys, xs);
  const tipY = useTransform(readY, [first, last], [first, last]);
  const tipOpacity = useTransform(
    readY,
    [first, first + 4, last - 4, last],
    [0, 1, 1, 0],
  );
  const stroke = `url(#${gradientId})`;

  return (
    <g>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y === from.y ? to.y + 1 : to.y}
        >
          <stop offset="0" style={{ stopColor: threadColors[colors[0]] }} />
          <stop offset="1" style={{ stopColor: threadColors[colors[1]] }} />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="0.5 11"
        className="stroke-text/25"
      />
      <motion.path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={20}
        strokeLinecap="round"
        strokeOpacity={0.14}
        style={motionEnabled ? { pathLength: drawn } : undefined}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={5}
        strokeLinecap="round"
        style={motionEnabled ? { pathLength: drawn } : undefined}
      />
      {motionEnabled ? (
        <>
          <motion.circle
            r={14}
            cx={tipX}
            cy={tipY}
            fill={threadColors[colors[1]]}
            style={{ opacity: tipOpacity }}
            fillOpacity={0.22}
          />
          <motion.circle
            r={5.5}
            cx={tipX}
            cy={tipY}
            className="fill-surface"
            stroke={stroke}
            strokeWidth={3}
            style={{ opacity: tipOpacity }}
          />
        </>
      ) : null}
    </g>
  );
}

const nodeColorClass: Record<ThreadColor, string> = {
  'sea-green': 'bg-sea-green',
  'neon-coral': 'bg-neon-coral',
  'slate-blue': 'bg-slate-blue',
  'mustard': 'bg-mustard',
};

const nodeRingClass: Record<ThreadColor, string> = {
  'sea-green': 'border-sea-green',
  'neon-coral': 'border-neon-coral',
  'slate-blue': 'border-slate-blue',
  'mustard': 'border-mustard',
};

const popSpring = { type: 'spring', stiffness: 420, damping: 18 } as const;
const instant = { duration: 0 } as const;

/**
 * A node on the thread: a faint ring until the thread arrives, then a filled
 * dot that pops and sends out one ripple.
 */
export function ThreadNode({
  color,
  active,
  size = 'md',
}: {
  color: ThreadColor;
  active: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      aria-hidden
      data-reached={active ? '' : undefined}
      className={cn(
        'absolute top-0 left-0 grid -translate-x-1/2 -translate-y-1/2 place-items-center',
        size === 'md' ? 'size-7' : 'size-4',
      )}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full border-2 opacity-40',
          nodeRingClass[color],
        )}
      />
      <motion.span
        initial={false}
        animate={
          active ? { scale: [1.9, 3.2], opacity: [0.45, 0] } : { opacity: 0 }
        }
        transition={active ? { duration: 0.9, ease: 'easeOut' } : instant}
        className={cn('absolute inset-0 rounded-full', nodeColorClass[color])}
      />
      <motion.span
        initial={false}
        animate={active ? { scale: 1, opacity: 1 } : { scale: 0.2, opacity: 0 }}
        transition={active ? popSpring : instant}
        className={cn(
          'ring-surface absolute inset-0 rounded-full shadow-lg ring-4',
          nodeColorClass[color],
        )}
      />
    </span>
  );
}

// The network both collection routes produce, drawn where the strands meet.
const satellites: readonly { angle: number; color: ThreadColor }[] = [
  { angle: -150, color: 'sea-green' },
  { angle: -96, color: 'neon-coral' },
  { angle: -30, color: 'slate-blue' },
  { angle: 34, color: 'sea-green' },
  { angle: 98, color: 'neon-coral' },
  { angle: 156, color: 'slate-blue' },
];

// A point on the bloom's ring. Rounded, because browsers' trigonometry can
// differ from the server's in the last digit, which breaks hydration.
function ringPoint(angle: number) {
  const radius = 54;
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(radians) * radius * 100) / 100,
    y: Math.round(Math.sin(radians) * radius * 100) / 100,
  };
}

export function NetworkBloom({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="-80 -80 160 160"
      className="absolute top-0 left-0 size-48 -translate-x-1/2 -translate-y-1/2 overflow-visible"
    >
      {satellites.map((satellite, index) => {
        const { x, y } = ringPoint(satellite.angle);
        const next = ringPoint(
          satellites[(index + 1) % satellites.length]?.angle ?? 0,
        );
        return (
          <g key={satellite.angle}>
            <motion.line
              x1={0}
              y1={0}
              x2={x}
              y2={y}
              strokeWidth={2.5}
              strokeLinecap="round"
              className="stroke-text/30"
              initial={false}
              animate={{ pathLength: active ? 1 : 0 }}
              transition={
                active ? { duration: 0.5, delay: 0.08 * index } : instant
              }
            />
            {index % 2 === 0 ? (
              <motion.line
                x1={x}
                y1={y}
                x2={next.x}
                y2={next.y}
                strokeWidth={2}
                strokeLinecap="round"
                className="stroke-text/20"
                initial={false}
                animate={{ pathLength: active ? 1 : 0 }}
                transition={
                  active
                    ? { duration: 0.45, delay: 0.3 + 0.08 * index }
                    : instant
                }
              />
            ) : null}
            <motion.circle
              cx={x}
              cy={y}
              r={7}
              style={{ fill: threadColors[satellite.color] }}
              initial={false}
              animate={
                active ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
              }
              transition={
                active ? { ...popSpring, delay: 0.25 + 0.08 * index } : instant
              }
            />
          </g>
        );
      })}
      <motion.circle
        r={13}
        style={{ fill: threadColors.mustard }}
        className="stroke-surface"
        strokeWidth={4}
        initial={false}
        animate={active ? { scale: 1, opacity: 1 } : { scale: 0.2, opacity: 0 }}
        transition={active ? popSpring : instant}
      />
    </svg>
  );
}
