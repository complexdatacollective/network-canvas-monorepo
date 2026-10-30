'use client';

import { Code, User } from 'lucide-react';
import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import { Badge } from '@codaco/art/illustration/Badge';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  GroundShadow,
  Icon,
  link,
  Particles,
  pivot,
  type Point,
} from './parts';

// The reader and GitHub, joined by a dotted line that asks whether they have
// an account there yet.
const PERSON: Point = [330, 210];
const TILE: Point = [830, 210];
const PATH = link([PERSON[0] + 100, PERSON[1]], [TILE[0] - 80, TILE[1]]);
const PATH_AT = 0.8;
const BADGE_AT = 1.9;
const END = 2.6;

export function AccountScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const person = backOut(segment(t, 0, 0.5));
  const tile = backOut(segment(t, 0.35, 0.5));
  const badge = backOut(segment(t, BADGE_AT, 0.5));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={PERSON[0]} cy={410} rx={120} />
      <GroundShadow cx={TILE[0] + 60} cy={410} rx={150} />
      <g opacity={segment(t, PATH_AT, 0.3)}>
        <DottedPath d={PATH.d} time={time} />
      </g>
      <Particles
        path={PATH}
        since={t - PATH_AT}
        duration={0.9}
        fill="fill-purple-pizazz"
      />
      <g
        transform={`translate(0 ${bob}) ${pivot(PERSON[0], PERSON[1], person)}`}
      >
        <circle
          cx={PERSON[0]}
          cy={PERSON[1]}
          r={96}
          className={cx('fill-sea-serpent', outline)}
          strokeWidth={6}
        />
        <Icon
          icon={User}
          x={PERSON[0]}
          y={PERSON[1]}
          size={100}
          className="text-white"
        />
        <rect
          x={PERSON[0] - 48}
          y={PERSON[1] + 120}
          width={96}
          height={38}
          rx={19}
          className={cx('fill-white', outline)}
          strokeWidth={4}
        />
        <text
          x={PERSON[0]}
          y={PERSON[1] + 146}
          textAnchor="middle"
          fontSize={18}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          You
        </text>
      </g>
      <g
        transform={`translate(${TILE[0]} ${TILE[1] + bob}) scale(${grow(tile)})`}
      >
        <AppTile
          size={130}
          clipId={`${id}-tile`}
          fill="fill-purple-pizazz"
          label="GitHub"
        >
          <Icon icon={Code} x={0} y={0} size={70} className="text-white" />
        </AppTile>
      </g>
      <g
        transform={`translate(${(PERSON[0] + TILE[0]) / 2} ${110 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={48}>
          <text
            y={20}
            textAnchor="middle"
            fontSize={60}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            ?
          </text>
        </Badge>
      </g>
    </svg>
  );
}
