'use client';

import { GitFork } from 'lucide-react';

import { Badge } from '@codaco/art/illustration/Badge';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import {
  CodeCard,
  cubic,
  GroundShadow,
  Icon,
  lerp,
  smooth,
  type Point,
} from './parts';

// Fresco's code sits on the left; a copy lifts off it, travels along an arc
// and lands on the right under the reader's name.
const ORIGINAL: Point = [150, 150];
const COPY: Point = [750, 150];
const ARC = {
  from: [450, 190] as Point,
  c1: [560, 20] as Point,
  c2: [660, 20] as Point,
  to: [750, 190] as Point,
};
const LIFT_AT = 0.9;
const TRAVEL = 1.2;
const BADGE_AT = 2.3;
const END = 3;

export function ForkScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const original = backOut(segment(t, 0.1, 0.5));
  const lift = segment(t, LIFT_AT, 0.25);
  const travel = smooth(segment(t, LIFT_AT + 0.2, TRAVEL));
  const landed = segment(t, LIFT_AT + 0.2 + TRAVEL, 0.3);
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const arcPath = `M${ARC.from[0]} ${ARC.from[1]} C${ARC.c1[0]} ${ARC.c1[1]} ${ARC.c2[0]} ${ARC.c2[1]} ${ARC.to[0]} ${ARC.to[1]}`;

  const copyX = lerp(ORIGINAL[0], COPY[0], travel);
  const copyY =
    lerp(ORIGINAL[1], COPY[1], travel) -
    Math.sin(Math.PI * travel) * 110 -
    lift * (1 - travel) * 18;
  const tilt = Math.sin(Math.PI * travel) * -8;
  const squash = 1 + 0.06 * Math.sin(Math.PI * landed);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={300} cy={410} rx={170} />
      <GroundShadow cx={900} cy={410} rx={170 * Math.max(travel, 0.001)} />
      <g opacity={segment(t, LIFT_AT, 0.3)}>
        <DottedPath d={arcPath} time={time} />
      </g>
      {[0, 0.06, 0.12].map((lag, index) => {
        if (travel <= 0 || travel >= 1) return null;
        const [x, y] = cubic(
          ARC.from,
          ARC.c1,
          ARC.c2,
          ARC.to,
          Math.max(0, travel - lag),
        );
        return (
          <circle
            key={lag}
            cx={x}
            cy={y}
            r={8 - index * 2}
            className="fill-purple-pizazz"
            opacity={1 - index * 0.3}
          />
        );
      })}
      <g
        transform={`translate(${ORIGINAL[0] + 150} ${ORIGINAL[1] + 95 + bob}) scale(${grow(original)}) translate(-150 -95)`}
      >
        <CodeCard x={0} y={0} title="complexdatacollective/Fresco" />
      </g>
      {lift > 0 ? (
        <g
          transform={`translate(${copyX + 150} ${copyY + 95 + bob * landed}) rotate(${tilt}) scale(${squash} ${2 - squash}) translate(-150 -95)`}
        >
          <CodeCard x={0} y={0} title="you/your-study" accent="fill-mustard" />
        </g>
      ) : null}
      <g
        transform={`translate(${COPY[0] + 290} ${COPY[1] + 6 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={46} fill="fill-purple-pizazz">
          <Icon icon={GitFork} x={0} y={-8} size={34} className="text-white" />
          <text
            y={28}
            textAnchor="middle"
            fontSize={15}
            fontWeight={900}
            letterSpacing={2}
            className="fill-white"
          >
            FORK
          </text>
        </Badge>
      </g>
    </svg>
  );
}
