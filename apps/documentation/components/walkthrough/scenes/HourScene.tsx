'use client';

import { Badge } from '@codaco/art/illustration/Badge';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { ClockFace, GroundShadow, smooth } from './parts';

// The clock sweeps out an hour; then a FREE stamp lands beside it.
const SWEEP_AT = 0.4;
const SWEEP = 1.4;
const PILL_AT = 1.8;
const BADGE_AT = 2.2;
const END = 3;

const sparkles = [
  [330, 90],
  [880, 120],
  [800, 380],
  [400, 400],
] as const;

export function HourScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const clock = backOut(segment(t, 0, 0.5));
  const sweep = smooth(segment(t, SWEEP_AT, SWEEP));
  const pill = backOut(segment(t, PILL_AT, 0.4));
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  const bob = Math.sin((TAU * t) / 2.7) * 3;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={560} cy={420} rx={150} />
      {sparkles.map(([x, y], index) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 12} L${x + 3} ${y - 3} L${x + 12} ${y} L${x + 3} ${y + 3} L${x} ${y + 12} L${x - 3} ${y + 3} L${x - 12} ${y} L${x - 3} ${y - 3} Z`}
          className="fill-white"
          opacity={
            segment(t, BADGE_AT, 0.4) *
            (0.4 + 0.6 * Math.abs(Math.sin((TAU * t) / 2 + index)))
          }
        />
      ))}
      <g
        transform={`translate(560 ${190 + bob}) scale(${grow(clock)}) translate(-560 -190)`}
      >
        <ClockFace
          x={560}
          y={190}
          r={140}
          minutes={60}
          k={sweep}
          wedge="fill-sea-serpent/40"
        />
      </g>
      <g transform={`translate(560 ${400 + bob}) scale(${grow(pill)})`}>
        <rect
          x={-90}
          y={-24}
          width={180}
          height={48}
          rx={24}
          className="stroke-navy-taupe fill-white"
          strokeWidth={5}
        />
        <text
          y={9}
          textAnchor="middle"
          fontSize={24}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          About 1 hour
        </text>
      </g>
      <g
        transform={`translate(800 ${150 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={62}>
          <text
            y={14}
            textAnchor="middle"
            fontSize={38}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            FREE
          </text>
        </Badge>
      </g>
    </svg>
  );
}
