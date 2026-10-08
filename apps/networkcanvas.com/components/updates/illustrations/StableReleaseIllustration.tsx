'use client';

import { useId } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  backOut,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from './illustrationMotion';

const PHOTO_START = 0.2;
const DEVICE_STARTS = [1, 1.8, 2.6] as const;
const CHIPS_START = 3.5;
const BADGE_START = 5;
const OUT_START = 7.2;
const LOOP = 8;
const STILL_TIME = 6.2;

const PHOTO = { x: 262, y: 232, tilt: -4 } as const;
const BADGE = { x: 452, y: 100 } as const;
const GROUND = 296;
const LAPTOP_X = 645;
const MONITOR_X = 878;
const TABLET = { x: 1073, y: 192 } as const;

const pop = (shown: number, delay: number) =>
  backOut(segment(shown, delay, 0.35));

const labelWidth = (name: string) => name.length * 10.5 + 36;
const chipWidth = (name: string) => name.length * 11 + 40;

const chipRows = [
  {
    center: 765,
    items: [
      ['Windows', 'fill-cerulean-blue'],
      ['macOS', 'fill-neon-coral'],
      ['Linux', 'fill-mustard'],
    ],
  },
  {
    center: 1052,
    items: [
      ['iPad', 'fill-sea-green'],
      ['Android', 'fill-purple-pizazz'],
    ],
  },
] as const;

const CHIP_GAP = 8;
const CHIP_Y = 407;

const chips = chipRows.flatMap((row) => {
  const total =
    row.items.reduce((sum, [name]) => sum + chipWidth(name), 0) +
    CHIP_GAP * (row.items.length - 1);
  let x = row.center - total / 2;
  return row.items.map(([name, dot]) => {
    const chip = { name, dot, x, width: chipWidth(name) };
    x += chip.width + CHIP_GAP;
    return chip;
  });
});

const stages = [
  { y: -134, dot: 'fill-sea-green', width: 40 },
  { y: -102, dot: 'fill-neon-coral', width: 28 },
  { y: -70, dot: 'fill-cerulean-blue', width: 46 },
] as const;

const previewNodes = [
  [42, -112, 'fill-neon-coral'],
  [72, -96, 'fill-sea-green'],
  [52, -66, 'fill-mustard'],
] as const;

// Laptop screen, drawn around the laptop's bottom centre.
function ArchitectScreen({ shown }: { shown: number }) {
  return (
    <g>
      <line
        x1={-84}
        y1={-142}
        x2={-84}
        y2={-48}
        className="stroke-navy-taupe/15"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {stages.map((stage, index) => {
        const k = pop(shown, 0.2 + index * 0.12);
        return (
          <g
            key={stage.y}
            transform={`translate(${(1 - k) * -16} 0)`}
            opacity={Math.min(1, k)}
          >
            <circle
              cx={-84}
              cy={stage.y}
              r={7}
              className={cx(stage.dot, outline)}
              strokeWidth={2.5}
            />
            <rect
              x={-70}
              y={stage.y - 12}
              width={80}
              height={24}
              rx={7}
              className="fill-navy-taupe/5 stroke-navy-taupe/15"
              strokeWidth={2}
            />
            <rect
              x={-62}
              y={stage.y - 3.5}
              width={stage.width}
              height={7}
              rx={3.5}
              className="fill-navy-taupe/25"
            />
          </g>
        );
      })}
      <rect
        x={20}
        y={-146}
        width={74}
        height={104}
        rx={10}
        className="fill-navy-taupe"
        opacity={Math.min(1, pop(shown, 0.4))}
      />
      {previewNodes.map(([x, y, fill], index) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={10 * pop(shown, 0.5 + index * 0.1)}
          className={cx(fill, 'stroke-white')}
          strokeWidth={2.5}
        />
      ))}
      <rect
        x={34}
        y={-136}
        width={46}
        height={6}
        rx={3}
        className="fill-white/40"
        opacity={Math.min(1, pop(shown, 0.45))}
      />
    </g>
  );
}

function Laptop({ shown }: { shown: number }) {
  return (
    <g>
      <rect
        x={-122}
        y={-18}
        width={244}
        height={18}
        rx={9}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-114}
        y={-168}
        width={228}
        height={150}
        rx={16}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-102}
        y={-156}
        width={204}
        height={126}
        rx={6}
        className="stroke-navy-taupe/30 fill-white"
        strokeWidth={3}
      />
      <ArchitectScreen shown={shown} />
    </g>
  );
}

const columns = [-34, -2, 32, 62] as const;

const interviews = [
  { id: 22, progress: 1, status: 'fill-sea-green' },
  { id: 16, progress: 0.6, status: 'fill-mustard' },
  { id: 20, progress: 1, status: 'fill-sea-green' },
  { id: 14, progress: 0.3, status: 'fill-mustard' },
] as const;

// Monitor screen: the interview table. Origin is the monitor's bottom centre.
function ServerScreen({ shown }: { shown: number }) {
  return (
    <g>
      <path
        d="M-95 -190 H-58 V-64 H-79 Q-95 -64 -95 -80 Z"
        className="fill-slate-blue/12"
      />
      {[-170, -150, -130].map((y, index) => (
        <rect
          key={y}
          x={-88}
          y={y}
          width={22}
          height={7}
          rx={3.5}
          className={index === 1 ? 'fill-slate-blue' : 'fill-navy-taupe/20'}
        />
      ))}
      <rect
        x={-50}
        y={-178}
        width={130}
        height={20}
        rx={6}
        className="fill-navy-taupe/5"
      />
      {columns.map((x) => (
        <rect
          key={x}
          x={x}
          y={-171}
          width={22}
          height={6}
          rx={3}
          className="fill-navy-taupe/35"
        />
      ))}
      {interviews.map((row, index) => {
        const y = -148 + index * 22;
        const k = pop(shown, 0.2 + index * 0.12);
        return (
          <g
            key={y}
            transform={`translate(0 ${(1 - k) * 8})`}
            opacity={Math.min(1, k)}
          >
            <rect
              x={columns[0]}
              y={y + 6}
              width={row.id}
              height={6}
              rx={3}
              className="fill-navy-taupe/50"
            />
            <rect
              x={columns[1]}
              y={y + 6}
              width={26}
              height={6}
              rx={3}
              className="fill-navy-taupe/20"
            />
            <rect
              x={columns[2]}
              y={y + 6}
              width={22}
              height={6}
              rx={3}
              className="fill-navy-taupe/10"
            />
            <rect
              x={columns[2]}
              y={y + 6}
              width={22 * row.progress * Math.min(1, k)}
              height={6}
              rx={3}
              className="fill-slate-blue"
            />
            <rect
              x={columns[3]}
              y={y + 2}
              width={20}
              height={14}
              rx={7}
              className={row.status}
              opacity={0.3}
            />
            <circle
              cx={columns[3] + 8}
              cy={y + 9}
              r={3}
              className={row.status}
            />
            <line
              x1={-50}
              y1={y + 20}
              x2={80}
              y2={y + 20}
              className="stroke-navy-taupe/10"
              strokeWidth={2}
            />
          </g>
        );
      })}
    </g>
  );
}

function Monitor({ shown }: { shown: number }) {
  return (
    <g>
      <rect
        x={-52}
        y={-14}
        width={104}
        height={14}
        rx={7}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-15}
        y={-56}
        width={30}
        height={44}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-107}
        y={-202}
        width={214}
        height={150}
        rx={16}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-95}
        y={-190}
        width={190}
        height={126}
        rx={6}
        className="stroke-navy-taupe/30 fill-white"
        strokeWidth={3}
      />
      <ServerScreen shown={shown} />
    </g>
  );
}

const people = [
  [-30, -14],
  [14, -22],
  [-8, 24],
  [38, 20],
  [-48, 16],
] as const;

const ties = [
  [0, 1],
  [1, 3],
  [0, 2],
  [2, 4],
  [2, 3],
] as const;

const personFills = [
  'fill-neon-coral',
  'fill-sea-green',
  'fill-mustard',
  'fill-cerulean-blue',
  'fill-purple-pizazz',
] as const;

// Tablet, drawn around its centre.
function Tablet({ shown }: { shown: number }) {
  return (
    <g>
      <rect
        x={-84}
        y={-62}
        width={168}
        height={124}
        rx={22}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <rect
        x={-70}
        y={-48}
        width={140}
        height={96}
        rx={8}
        className="fill-navy-taupe"
      />
      <circle cx={-77} cy={0} r={2.5} className="fill-navy-taupe/40" />
      {[44, 30, 16].map((r) => (
        <circle
          key={r}
          cx={0}
          cy={0}
          r={r}
          fill="none"
          className="stroke-white/15"
          strokeWidth={2}
        />
      ))}
      {ties.map(([from, to], index) => (
        <line
          key={`${from}-${to}`}
          x1={people[from]![0]}
          y1={people[from]![1]}
          x2={people[to]![0]}
          y2={people[to]![1]}
          className="stroke-white/60"
          strokeWidth={2.5}
          opacity={segment(shown, 0.7 + index * 0.1, 0.2)}
        />
      ))}
      {people.map(([x, y], index) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={9 * pop(shown, 0.2 + index * 0.1)}
          className={cx(personFills[index], 'stroke-white')}
          strokeWidth={2.5}
        />
      ))}
    </g>
  );
}

function NamePill({ name, x, k }: { name: string; x: number; k: number }) {
  const width = labelWidth(name);
  return (
    <g
      transform={`translate(${x} 358) scale(${Math.max(0.001, k)})`}
      opacity={Math.min(1, k)}
    >
      <rect
        x={-width / 2}
        y={-19}
        width={width}
        height={38}
        rx={19}
        className={cx('fill-white', outline)}
        strokeWidth={4}
      />
      <text
        y={7}
        textAnchor="middle"
        fontSize={20}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {name}
      </text>
    </g>
  );
}

export function StableReleaseIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipPrefix = `stable-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;

  const out = inCubic(segment(t, OUT_START, 0.45));
  const bobOf = (index: number, amount: number) =>
    Math.sin((TAU * t) / 2.7 + index * 1.7) * amount;

  const photoIn = backOut(segment(t, PHOTO_START, 0.7));
  const photoScale = (0.7 + 0.3 * Math.min(1, photoIn)) * (1 - out) + 0.001;
  const recoil = Math.sin(Math.PI * segment(t, BADGE_START + 0.35, 0.4)) * 5;
  const photoOpacity = Math.min(1, segment(t, PHOTO_START, 0.2) * 3);

  const laptop = backOut(segment(t, DEVICE_STARTS[0], 0.55)) * (1 - out);
  const monitor = backOut(segment(t, DEVICE_STARTS[1], 0.55)) * (1 - out);
  const tablet = backOut(segment(t, DEVICE_STARTS[2], 0.55)) * (1 - out);
  const pills = DEVICE_STARTS.map(
    (start) => backOut(segment(t, start + 0.3, 0.4)) * (1 - out),
  );
  const scaleOf = (k: number) => Math.max(0.001, k);
  const tabletBob = bobOf(2, 6);

  const badgeIn = segment(t, BADGE_START, 0.4);
  const badgeScale = (1 + 1.8 * Math.pow(1 - badgeIn, 2)) * (1 - out) + 0.001;
  const badgeAngle = -14 + (1 - badgeIn) * 26 + Math.sin((TAU * t) / 2.7) * 3;
  const ring = segment(t, BADGE_START + 0.35, 0.5);
  const tick = backOut(segment(t, BADGE_START + 0.3, 0.35)) * (1 - out);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <ellipse
        cx={PHOTO.x}
        cy={394}
        rx={170 * Math.min(1, photoIn) * (1 - out)}
        ry={12}
        className="fill-navy-taupe/12"
      />
      {(
        [
          [LAPTOP_X, 134, laptop],
          [MONITOR_X, 70, monitor],
        ] as const
      ).map(([x, rx, k]) => (
        <ellipse
          key={x}
          cx={x}
          cy={GROUND + 6}
          rx={rx * Math.min(1, k)}
          ry={9}
          className="fill-navy-taupe/12"
        />
      ))}
      <ellipse
        cx={TABLET.x}
        cy={GROUND + 6}
        rx={(66 - tabletBob * 1.2) * Math.min(1, tablet)}
        ry={9}
        className="fill-navy-taupe/12"
      />
      <g
        transform={`translate(${PHOTO.x} ${
          PHOTO.y + (1 - photoIn) * -150 + recoil + bobOf(0, 3) - out * 40
        }) rotate(${
          PHOTO.tilt + (1 - photoIn) * -10 + Math.sin((TAU * t) / 3.3) * 0.7
        }) scale(${photoScale})`}
        opacity={photoOpacity}
      >
        <clipPath id={`${clipPrefix}-photo`}>
          <rect x={-192} y={-112} width={384} height={211} rx={10} />
        </clipPath>
        <rect
          x={-210}
          y={-130}
          width={420}
          height={260}
          rx={20}
          className={cx('fill-white', outline)}
          strokeWidth={6}
        />
        <image
          href="/images/updates/researchers-using-network-canvas.jpg"
          x={-192}
          y={-112}
          width={384}
          height={211}
          clipPath={`url(#${clipPrefix}-photo)`}
          preserveAspectRatio="xMidYMid slice"
        />
        <rect
          x={-192}
          y={-112}
          width={384}
          height={211}
          rx={10}
          fill="none"
          className={outline}
          strokeWidth={4}
        />
        <rect
          x={-44}
          y={-150}
          width={88}
          height={28}
          rx={4}
          transform="rotate(3)"
          className={cx('fill-paradise-pink', outline)}
          strokeWidth={4}
        />
      </g>
      <g
        transform={`translate(${LAPTOP_X} ${GROUND + bobOf(0, 2)}) scale(${scaleOf(
          laptop,
        )})`}
      >
        <Laptop shown={t - DEVICE_STARTS[0]} />
      </g>
      <g
        transform={`translate(${MONITOR_X} ${GROUND + bobOf(1, 2)}) scale(${scaleOf(
          monitor,
        )})`}
      >
        <Monitor shown={t - DEVICE_STARTS[1]} />
      </g>
      <g
        transform={`translate(${TABLET.x} ${TABLET.y + tabletBob}) rotate(${
          -5 + bobOf(3, 1.5)
        }) scale(${scaleOf(tablet)})`}
      >
        <Tablet shown={t - DEVICE_STARTS[2]} />
      </g>
      <NamePill name="Architect" x={LAPTOP_X} k={pills[0]!} />
      <NamePill name="Server" x={MONITOR_X} k={pills[1]!} />
      <NamePill name="Interviewer" x={TABLET.x} k={pills[2]!} />
      {chips.map((chip, index) => {
        const k =
          backOut(segment(t, CHIPS_START + index * 0.15, 0.35)) * (1 - out);
        return (
          <g
            key={chip.name}
            transform={`translate(${chip.x + chip.width / 2} ${CHIP_Y}) scale(${scaleOf(
              k,
            )})`}
            opacity={Math.min(1, k)}
          >
            <rect
              x={-chip.width / 2}
              y={-16}
              width={chip.width}
              height={32}
              rx={16}
              className={cx('fill-white', outline)}
              strokeWidth={4}
            />
            <circle
              cx={-chip.width / 2 + 16}
              cy={0}
              r={5}
              className={chip.dot}
            />
            <text
              x={-chip.width / 2 + 28}
              y={6}
              fontSize={16}
              fontWeight={800}
              className="fill-navy-taupe"
            >
              {chip.name}
            </text>
          </g>
        );
      })}
      <circle
        cx={BADGE.x}
        cy={BADGE.y}
        r={64 + ring * 44}
        fill="none"
        className="stroke-mustard"
        strokeWidth={6}
        opacity={ring > 0 && ring < 1 ? 0.9 * (1 - ring) : 0}
      />
      <g
        transform={`translate(${BADGE.x} ${BADGE.y}) rotate(${badgeAngle}) scale(${badgeScale})`}
        opacity={Math.min(1, badgeIn * 4)}
      >
        <circle
          r={64}
          className={cx('fill-mustard', outline)}
          strokeWidth={6}
        />
        <text
          y={4}
          textAnchor="middle"
          fontSize={42}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          6.0
        </text>
        <text
          y={34}
          textAnchor="middle"
          fontSize={17}
          fontWeight={900}
          letterSpacing={2}
          className="fill-navy-taupe"
        >
          STABLE
        </text>
        <g transform={`translate(50 -46) scale(${scaleOf(tick)})`}>
          <circle
            r={19}
            className={cx('fill-sea-green', outline)}
            strokeWidth={5}
          />
          <path
            d="M-8 1 L-2 7 L9 -7"
            fill="none"
            className="stroke-white"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}
