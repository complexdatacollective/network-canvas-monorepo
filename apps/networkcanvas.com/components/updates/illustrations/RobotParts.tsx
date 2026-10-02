'use client';

import { useAnimationFrame, useInView, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

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

export function blink(t: number, times: readonly number[]) {
  return Math.max(
    0.1,
    Math.min(1, ...times.map((b) => Math.abs(t - b) / 0.08)),
  );
}

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

type DecorNode = readonly [x: number, y: number, r: number, className: string];

export function NetworkDecor({
  nodes,
  edges,
  time,
  period,
}: {
  nodes: readonly DecorNode[];
  edges: readonly (readonly [number, number])[];
  time: number;
  period: number;
}) {
  const placed = nodes.map(([x, y, r, className], index) => ({
    x,
    y: y + Math.sin((TAU * time) / period + index * 1.3) * 6,
    r,
    className,
  }));
  return (
    <g>
      {edges.map(([from, to]) => (
        <line
          key={`${from}-${to}`}
          x1={placed[from]!.x}
          y1={placed[from]!.y}
          x2={placed[to]!.x}
          y2={placed[to]!.y}
          className="stroke-navy-taupe/20"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      {placed.map(({ x, y, r, className }) => (
        <circle
          key={`${x}-${r}`}
          cx={x}
          cy={y}
          r={r}
          className={cx(className, outline)}
          strokeWidth={5}
        />
      ))}
    </g>
  );
}

export function Arm({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} className={outline} strokeWidth={32} />
      <path d={d} className="stroke-white" strokeWidth={18} />
    </g>
  );
}

export function Hand({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={19}
      className={cx('fill-mustard', outline)}
      strokeWidth={6}
    />
  );
}

export function RobotHead({
  tilt,
  antennaClassName,
  eyeX = [106, 168],
  eyeY = 108,
  eyeHeight,
  smile = 'M114 146 Q132 162 150 146',
}: {
  tilt: number;
  antennaClassName: string;
  eyeX?: readonly [number, number];
  eyeY?: number;
  eyeHeight: number;
  smile?: string;
}) {
  return (
    <g transform={`rotate(${tilt} 130 200)`} strokeWidth={6}>
      <line
        x1={130}
        y1={50}
        x2={130}
        y2={18}
        className={outline}
        strokeLinecap="round"
      />
      <circle
        cx={130}
        cy={14}
        r={13}
        className={cx(antennaClassName, outline)}
      />
      <rect
        x={14}
        y={100}
        width={26}
        height={54}
        rx={13}
        className={cx('fill-cerulean-blue', outline)}
      />
      <rect
        x={220}
        y={100}
        width={26}
        height={54}
        rx={13}
        className={cx('fill-cerulean-blue', outline)}
      />
      <rect
        x={30}
        y={46}
        width={200}
        height={158}
        rx={60}
        className={cx('fill-white', outline)}
      />
      <rect
        x={52}
        y={72}
        width={156}
        height={104}
        rx={38}
        className="fill-navy-taupe"
        strokeWidth={0}
      />
      {eyeX.map((x) => (
        <ellipse
          key={x}
          cx={x}
          cy={eyeY}
          rx={11}
          ry={eyeHeight}
          className="fill-sea-green"
          strokeWidth={0}
        />
      ))}
      <path
        d={smile}
        fill="none"
        className="stroke-sea-green"
        strokeLinecap="round"
      />
    </g>
  );
}
