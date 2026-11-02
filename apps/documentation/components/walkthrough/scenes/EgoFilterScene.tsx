'use client';

import { Funnel } from 'lucide-react';

import { Badge } from '@codaco/art/illustration/Badge';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { GroundShadow, Icon, pivot, smooth } from './parts';
import { PersonNode } from './rosterParts';

// A sociogram of the roster. A filter arrives, and the participant's own
// circle and its lines fade out of view.
const CENTER = [600, 225] as const;
const nodes = [
  { name: 'Lisa', x: 600, y: 215 },
  { name: 'Marge', x: 450, y: 140 },
  { name: 'Homer', x: 760, y: 120 },
  { name: 'Bart', x: 460, y: 320 },
  { name: 'Maggie', x: 750, y: 325 },
] as const;
const EGO = 0;
const edges: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [3, 4],
  [2, 4],
];
const FILTER_AT = 1.5;
const FADE_AT = 2;
const END = 2.9;

export function EgoFilterScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const fade = 1 - smooth(segment(t, FADE_AT, 0.6));
  const filter = backOut(segment(t, FILTER_AT, 0.5));
  const you = backOut(segment(t, 0.9, 0.4));
  const ego = nodes[EGO];

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={CENTER[0]} cy={425} rx={240} />
      <g transform={`translate(0 ${bob})`}>
        {[195, 130, 65].map((r, index) => (
          <circle
            key={r}
            cx={CENTER[0]}
            cy={CENTER[1]}
            r={r * grow(backOut(segment(t, index * 0.1, 0.5)))}
            className="fill-navy-taupe/5"
          />
        ))}
        {edges.map(([a, b], index) => {
          const k = segment(t, 0.6 + index * 0.08, 0.35);
          const from = nodes[a]!;
          const to = nodes[b]!;
          const touchesEgo = a === EGO || b === EGO;
          return (
            <line
              key={`${a}-${b}`}
              x1={from.x}
              y1={from.y}
              x2={from.x + (to.x - from.x) * k}
              y2={from.y + (to.y - from.y) * k}
              className="stroke-navy-taupe"
              strokeWidth={6}
              strokeLinecap="round"
              opacity={touchesEgo ? fade : 1}
            />
          );
        })}
        <circle
          cx={ego.x}
          cy={ego.y}
          r={44}
          fill="none"
          className="stroke-navy-taupe/30"
          strokeWidth={5}
          strokeDasharray="2 12"
          strokeLinecap="round"
          opacity={1 - fade}
        />
        {nodes.map((node, index) => {
          const k = backOut(segment(t, 0.2 + index * 0.08, 0.5));
          if (k <= 0) return null;
          const isEgo = index === EGO;
          return (
            <g
              key={node.name}
              transform={pivot(
                node.x,
                node.y,
                isEgo ? k * (0.6 + 0.4 * fade) : k,
              )}
              opacity={isEgo ? fade : 1}
            >
              <PersonNode x={node.x} y={node.y} r={44} name={node.name} />
            </g>
          );
        })}
        {you > 0 && fade > 0 ? (
          <g
            transform={pivot(ego.x, ego.y - 62, you * (0.6 + 0.4 * fade))}
            opacity={fade}
          >
            <rect
              x={ego.x - 36}
              y={ego.y - 80}
              width={72}
              height={34}
              rx={17}
              className={cx('fill-mustard', outline)}
              strokeWidth={4}
            />
            <text
              x={ego.x}
              y={ego.y - 56}
              textAnchor="middle"
              fontSize={19}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              You
            </text>
          </g>
        ) : null}
      </g>
      <g
        transform={`translate(910 ${90 + bob}) rotate(${Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(filter)})`}
      >
        <Badge r={46} fill="fill-cerulean-blue">
          <Icon icon={Funnel} x={0} y={2} size={44} className="text-white" />
        </Badge>
      </g>
    </svg>
  );
}
