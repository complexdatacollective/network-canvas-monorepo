'use client';

import { Archive, KeyRound, ShieldCheck } from 'lucide-react';
import { useId } from 'react';

import { AppTile, appTileLabelWidth } from '@codaco/art/illustration/AppTile';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import {
  CheckStamp,
  GroundShadow,
  Icon,
  link,
  Particles,
  type Point,
} from './parts';

// The three things an S3 bucket needs before setup: each arrives, is ticked
// off, and connects to Fresco.
const items = [
  { label: 'Bucket', icon: Archive, y: 100, fill: 'fill-cerulean-blue' },
  { label: 'Access key', icon: KeyRound, y: 230, fill: 'fill-mustard' },
  {
    label: 'CORS for your address',
    icon: ShieldCheck,
    y: 360,
    fill: 'fill-sea-green',
  },
] as const;

const TILE_X = 140;
const TILE = 80;
const STARTS = [0.2, 0.7, 1.2] as const;
const FRESCO: Point = [960, 230];
const FRESCO_AT = 1.9;
const END = 2.7;

export function BucketScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const fresco = backOut(segment(t, FRESCO_AT - 0.3, 0.5));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={FRESCO[0]} cy={420} rx={110} />
      {items.map((item, index) => {
        const from: Point = [
          TILE_X + TILE / 2 + 16 + appTileLabelWidth(item.label) + 14,
          item.y,
        ];
        const path = link(from, [FRESCO[0] - 90, FRESCO[1]]);
        const since = t - STARTS[index]! - 0.4;
        return (
          <g key={item.label}>
            <g opacity={segment(t, STARTS[index]! + 0.3, 0.3)}>
              <DottedPath d={path.d} time={time} />
            </g>
            <Particles
              path={path}
              since={since}
              duration={0.9}
              fill={item.fill}
            />
          </g>
        );
      })}
      <g
        transform={`translate(${FRESCO[0]} ${FRESCO[1] + bob}) scale(${grow(fresco)})`}
      >
        <AppTile
          href="/assets/walkthroughs/fresco-icon.png"
          size={150}
          clipId={`${id}-fresco`}
        />
      </g>
      {items.map((item, index) => {
        const k = backOut(segment(t, STARTS[index]!, 0.5));
        const y =
          item.y + Math.sin((TAU * t) / 2.7 + index) * 3 * Math.min(1, k);
        return (
          <g key={item.label}>
            <g transform={`translate(${TILE_X} ${y}) scale(${grow(k)})`}>
              <AppTile
                size={TILE}
                clipId={`${id}-${index}`}
                label={item.label}
                fill={item.fill}
              >
                <Icon
                  icon={item.icon}
                  x={0}
                  y={0}
                  size={42}
                  className="text-white"
                />
              </AppTile>
            </g>
            <CheckStamp
              x={TILE_X - 46}
              y={y - 34}
              r={20}
              k={backOut(segment(t, STARTS[index]! + 0.35, 0.4))}
              t={t}
            />
          </g>
        );
      })}
    </svg>
  );
}
