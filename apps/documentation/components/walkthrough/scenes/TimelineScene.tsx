'use client';

import {
  Flag,
  Info,
  Share2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@codaco/art/illustration/Badge';
import { Confetti } from '@codaco/art/illustration/Confetti';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { CheckStamp, GroundShadow, Icon, lerp, smooth } from './parts';

// The protocol's timeline of stages. `ready` stamps the roster stage with a
// check; `ego` opens a gap before it for a second roster stage, stamped
// "You", where participants find themselves.
type Mode = 'ready' | 'ego';

type Stage = {
  label: string;
  icon: LucideIcon;
  fill: string;
  x: number;
  to?: number;
  at: number;
};

const TILE_Y = 190;
const TILE = 100;
const STEP = 240;
const slot = (index: number) => 240 + index * STEP;

const STAGES: Record<Mode, Stage[]> = {
  ready: [
    {
      label: 'Welcome',
      icon: Info,
      fill: 'fill-cerulean-blue',
      x: slot(0),
      at: 0,
    },
    {
      label: 'Classmates',
      icon: Users,
      fill: 'fill-neon-coral',
      x: slot(1),
      at: 0.15,
    },
    {
      label: 'Sociogram',
      icon: Share2,
      fill: 'fill-sea-green',
      x: slot(2),
      at: 0.3,
    },
    {
      label: 'Finish',
      icon: Flag,
      fill: 'fill-purple-pizazz',
      x: slot(3),
      at: 0.45,
    },
  ],
  ego: [
    {
      label: 'Welcome',
      icon: Info,
      fill: 'fill-cerulean-blue',
      x: slot(0),
      at: 0,
    },
    {
      label: 'Find yourself',
      icon: UserRound,
      fill: 'fill-neon-coral',
      x: slot(1),
      at: 1.2,
    },
    {
      label: 'Classmates',
      icon: Users,
      fill: 'fill-neon-coral',
      x: slot(1),
      to: slot(2),
      at: 0.15,
    },
    {
      label: 'Sociogram',
      icon: Share2,
      fill: 'fill-sea-green',
      x: slot(2),
      to: slot(3),
      at: 0.3,
    },
  ],
};

const STAMP_AT: Record<Mode, number> = { ready: 1.1, ego: 1.8 };
const END: Record<Mode, number> = { ready: 3.8, ego: 2.6 };
const GAP_AT = 0.8;

function TimelineScene({ mode }: { mode: Mode }) {
  const { ref, time } = useIllustrationClock(END[mode], { from: 0 });
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const gap = smooth(segment(t, GAP_AT, 0.4));
  const stages = STAGES[mode];
  const lastX = Math.max(
    ...stages.map((stage) => lerp(stage.x, stage.to ?? stage.x, gap)),
  );
  const line = smooth(segment(t, 0, 0.6));
  const stamp = backOut(segment(t, STAMP_AT[mode], 0.5));
  const marked = slot(1);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={600} cy={400} rx={460} />
      <g transform={`translate(0 ${bob})`}>
        <line
          x1={slot(0)}
          y1={TILE_Y}
          x2={lerp(slot(0), lastX, line)}
          y2={TILE_Y}
          className="stroke-navy-taupe/25"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {stages.map((stage) => {
          const k = backOut(segment(t, stage.at, 0.5));
          if (k <= 0) return null;
          const x = lerp(stage.x, stage.to ?? stage.x, gap);
          return (
            <g key={stage.label}>
              <g transform={`translate(${x} ${TILE_Y}) scale(${grow(k)})`}>
                <rect
                  x={-TILE / 2}
                  y={-TILE / 2}
                  width={TILE}
                  height={TILE}
                  rx={26}
                  className={cx(stage.fill, outline)}
                  strokeWidth={6}
                />
                <Icon
                  icon={stage.icon}
                  x={0}
                  y={0}
                  size={48}
                  className="text-white"
                />
              </g>
              <text
                x={x}
                y={TILE_Y + TILE / 2 + 44}
                textAnchor="middle"
                fontSize={22}
                fontWeight={900}
                className="fill-navy-taupe"
                opacity={Math.min(1, k)}
              >
                {stage.label}
              </text>
            </g>
          );
        })}
      </g>
      {mode === 'ready' ? (
        <>
          <CheckStamp
            x={marked + 52}
            y={TILE_Y - 56 + bob}
            k={stamp}
            t={t}
            r={36}
          />
          <Confetti
            since={t - STAMP_AT.ready - 0.2}
            origin={[marked, TILE_Y - 60]}
            floor={420}
          />
        </>
      ) : (
        <g
          transform={`translate(${marked + 52} ${TILE_Y - 58 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(stamp)})`}
        >
          <Badge r={38}>
            <text
              y={9}
              textAnchor="middle"
              fontSize={25}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              You
            </text>
          </Badge>
        </g>
      )}
    </svg>
  );
}

export const RosterReadyScene = () => <TimelineScene mode="ready" />;
export const EgoFirstScene = () => <TimelineScene mode="ego" />;
