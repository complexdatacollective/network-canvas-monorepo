'use client';

import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { GroundShadow, pivot, TextBar, type Point } from './parts';
import { NODE_FILL } from './rosterParts';

// A classroom where everyone on the roster is also answering: desks with name
// cards, and arrows between the people who name each other.
const DESK_WIDTH = 180;
const DESK_HEIGHT = 54;
const COLS = [260, 600, 940] as const;
const ROWS = [160, 310] as const;
const desks = ['Marge', 'Homer', 'Lisa', 'Bart', 'Maggie', 'Kwame'].map(
  (name, index) => ({
    name,
    x: COLS[index % 3]!,
    top: ROWS[Math.floor(index / 3)]!,
  }),
);
const mid = (index: number) => desks[index]!.top + DESK_HEIGHT / 2;
const leftOf = (index: number): Point => [
  desks[index]!.x - DESK_WIDTH / 2 - 12,
  mid(index),
];
const rightOf = (index: number): Point => [
  desks[index]!.x + DESK_WIDTH / 2 + 12,
  mid(index),
];

// Each arrow as a quadratic curve: start, control point, end.
const arrows: [Point, Point, Point][] = [
  [rightOf(0), [430, mid(0) - 46], leftOf(1)],
  [leftOf(4), [430, mid(3) - 46], rightOf(3)],
  [rightOf(5), [1110, (mid(2) + mid(5)) / 2], rightOf(2)],
  [leftOf(3), [90, (mid(0) + mid(3)) / 2], leftOf(0)],
  [leftOf(5), [770, mid(5) - 46], rightOf(4)],
];
const ARROWS_AT = 1;
const END = 2.9;

export function ClassroomScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const board = backOut(segment(t, 0, 0.5));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={600} cy={415} rx={480} />
      <g transform={`translate(0 ${bob})`}>
        <g transform={pivot(600, 56, board)}>
          <rect
            x={460}
            y={20}
            width={280}
            height={72}
            rx={12}
            className={cx('fill-navy-taupe', outline)}
            strokeWidth={6}
          />
          <TextBar x={490} y={46} width={150} className="stroke-white/40" />
          <TextBar x={490} y={68} width={200} className="stroke-white/25" />
        </g>
        {desks.map((desk, index) => {
          const k = backOut(segment(t, 0.2 + index * 0.1, 0.5));
          return (
            <g key={desk.name} transform={pivot(desk.x, desk.top, k)}>
              <circle
                cx={desk.x}
                cy={desk.top - 14}
                r={28}
                className={cx(NODE_FILL, outline)}
                strokeWidth={5}
              />
              <rect
                x={desk.x - DESK_WIDTH / 2}
                y={desk.top}
                width={DESK_WIDTH}
                height={DESK_HEIGHT}
                rx={12}
                className={cx('fill-white', outline)}
                strokeWidth={5}
              />
              <text
                x={desk.x}
                y={desk.top + 35}
                textAnchor="middle"
                fontSize={22}
                fontWeight={900}
                className="fill-navy-taupe"
              >
                {desk.name}
              </text>
            </g>
          );
        })}
        {arrows.map(([from, control, to], index) => {
          const k = segment(t, ARROWS_AT + index * 0.2, 0.45);
          if (k <= 0) return null;
          const angle =
            (Math.atan2(to[1] - control[1], to[0] - control[0]) * 180) /
            Math.PI;
          return (
            <g key={index}>
              <path
                d={`M${from[0]} ${from[1]} Q${control[0]} ${control[1]} ${to[0]} ${to[1]}`}
                fill="none"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - k}
                className="stroke-navy-taupe"
                strokeWidth={5}
                strokeLinecap="round"
              />
              <path
                d="M0 0 L-16 -9 L-16 9 Z"
                transform={`translate(${to[0]} ${to[1]}) rotate(${angle}) scale(${grow(backOut(segment(t, ARROWS_AT + index * 0.2 + 0.35, 0.3)))})`}
                className={cx('fill-navy-taupe', outline)}
                strokeWidth={3}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
