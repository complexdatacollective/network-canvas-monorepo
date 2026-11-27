import { GripHorizontal, Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  Drawer,
  drawerSlot,
  lerp,
  NAMES,
  PersonNode,
  PromptPips,
  settle,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type DrawerStyle,
  type Point,
} from './parts';

const TEXT = {
  place: ['Place people closer to the center', 'the closer you feel to them.'],
  connect: ['Tap two people who know each other', 'to connect them.'],
  rings: (n: number) => `Concentric circles: ${n}`,
  skew: 'Skew circle sizes: on',
  image: 'Image background',
  regions: ['Home', 'Work', 'School', 'Online'],
  manual: 'Manual',
  automatic: 'Automatic',
} as const;

/** The canvas the interview draws: concentric circles filling its height. */
export const CANVAS = {
  x: STAGE_CENTER_X,
  y: (STAGE.y + STAGE.bottom) / 2,
  r: (STAGE.bottom - STAGE.y) / 2 - 12,
} as const;
export const NODE_R = 27;

/** Radii as the interview computes them, outermost first. */
const radii = (n: number, skewed: boolean, r: number) =>
  Array.from(
    { length: n },
    (_, i) => r * (1 - (1 - (i + 1) / n) ** (skewed ? 1.4 : 1)),
  ).toReversed();

/**
 * The interview's concentric circles: each ring a blend of the background
 * toward white, lighter toward the centre.
 */
export function Circles({
  n,
  skew = 0,
  x = CANVAS.x,
  y = CANVAS.y,
  r = CANVAS.r,
  opacity = 1,
}: {
  n: number;
  /** 0 for even rings, 1 for skewed toward the centre. */
  skew?: number;
  x?: number;
  y?: number;
  r?: number;
  opacity?: number;
}) {
  const even = radii(n, false, r);
  const skewed = radii(n, true, r);
  return (
    <g opacity={opacity}>
      {even.map((radius, i) => (
        <g key={i}>
          <circle
            cx={x}
            cy={y}
            r={lerp(radius, skewed[i] ?? radius, skew)}
            className="fill-navy-taupe"
          />
          <circle
            cx={x}
            cy={y}
            r={lerp(radius, skewed[i] ?? radius, skew)}
            className="fill-white"
            opacity={(10 + (i / n) * 50) / 100}
          />
        </g>
      ))}
    </g>
  );
}

/** A canvas node, with the white ring the interview gives a marked one. */
export function CanvasNode({
  at,
  label,
  k = 1,
  ring = 0,
  pulse,
  r = NODE_R,
}: {
  at: Point;
  label: string;
  k?: number;
  /** 0 to 1: the marked (highlighted or selected) ring. */
  ring?: number;
  /** Seconds into a linking pulse, while this node starts an edge. */
  pulse?: number;
  r?: number;
}) {
  if (k <= 0) return null;
  const linking =
    pulse === undefined ? 0 : 0.5 + 0.5 * Math.sin(pulse * Math.PI * 3);
  return (
    <g>
      {linking > 0 ? (
        <circle
          cx={at[0]}
          cy={at[1]}
          r={r + 6 + linking * 6}
          className="fill-white"
          opacity={0.35 * (1 - linking * 0.5)}
        />
      ) : null}
      {ring > 0 ? (
        <circle
          cx={at[0]}
          cy={at[1]}
          r={r + 5 * backOut(ring)}
          className="fill-white"
        />
      ) : null}
      <PersonNode x={at[0]} y={at[1]} r={r} label={label} k={k} />
    </g>
  );
}

/** An edge as the interview draws it: a thick round-capped line. */
export function Edge({
  from,
  to,
  k = 1,
  type = 1,
}: {
  from: Point;
  to: Point;
  k?: number;
  type?: 1 | 2;
}) {
  if (k <= 0) return null;
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={lerp(from[0], to[0], k)}
      y2={lerp(from[1], to[1], k)}
      className={type === 1 ? 'stroke-edge-1' : 'stroke-edge-2'}
      strokeWidth={6}
      strokeLinecap="round"
    />
  );
}

/**
 * The prompt panel the sociogram floats at the top right: a grip, the
 * prompt, its pips when there are several, and, in automatic layout, the
 * pause button.
 */
function PromptCard({
  lines,
  count = 1,
  current = 0,
  extra,
  height = 84,
}: {
  lines: readonly string[];
  count?: number;
  current?: number;
  extra?: ReactNode;
  height?: number;
}) {
  const width = 250;
  const x = STAGE.right - width - 14;
  const y = STAGE.y + 12;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={14}
        className="fill-cyber-grape"
        opacity={0.92}
      />
      <GripHorizontal
        x={x + 14}
        y={y + 8}
        width={18}
        height={18}
        className="text-white/50"
      />
      {count > 1 ? (
        <PromptPips
          count={count}
          current={current}
          x={x + width / 2}
          y={y + 17}
        />
      ) : null}
      {lines.map((line, i) => (
        <text
          key={line}
          x={x + width / 2}
          y={y + 46 + i * 19}
          textAnchor="middle"
          fontSize={15}
          fontWeight={500}
          className="fill-white"
        >
          {line}
        </text>
      ))}
      {extra}
    </g>
  );
}

/** The drawer of nodes still to be placed, at the bottom of the canvas. */
const DRAWER: DrawerStyle = {
  width: 300,
  gap: 58,
  handle: 24,
  handleWidth: 90,
  overhang: 10,
  rx: 10,
};

type Placement = Readonly<{ label: string; to: Point; at: number }>;

/** Where a node dragged from the drawer at `at` is, and whether it is held. */
function placed(
  t: number,
  { to, at }: Placement,
  from: Point,
): { pos: Point; held: boolean; done: boolean } {
  const k = smooth(segment(t, at, 0.7));
  return {
    pos: [lerp(from[0], to[0], k), lerp(from[1], to[1], k)],
    held: k > 0 && k < 1,
    done: k >= 1,
  };
}

/**
 * Shows a sociogram with two prompts. In the first, a position task, the
 * participant drags three alters from the drawer onto the concentric circles.
 * The prompt then moves on to a connect task, in which the participant taps
 * one node and then another to draw an edge between them.
 */
export const SociogramIntroScene = defineScene(5.4, ({ t }) => {
  const plan: Placement[] = [
    { label: NAMES.sam, to: [CANVAS.x - 60, CANVAS.y - 30], at: 0.7 },
    { label: NAMES.ana, to: [CANVAS.x + 40, CANVAS.y - 70], at: 1.6 },
    { label: NAMES.jo, to: [CANVAS.x + 20, CANVAS.y + 60], at: 2.5 },
  ];
  const nodes = plan.map((p, i) => ({
    ...p,
    ...placed(t, p, drawerSlot(i, plan.length, DRAWER)),
  }));
  const drawerOpen = 1 - smooth(segment(t, 3.3, 0.4));
  const sam = plan[0]?.to ?? [0, 0];
  const ana = plan[1]?.to ?? [0, 0];
  const edge = smooth(segment(t, 4.3, 0.3));
  const connecting = t >= 3.4;
  const stops = [
    ...plan.flatMap((p, i) => [
      { to: drawerSlot(i, plan.length, DRAWER), at: p.at - 0.05, ring: false },
      { to: p.to, at: p.at + 0.7, glide: 0.7, ring: false },
    ]),
    { to: sam, at: 3.8 },
    { to: ana, at: 4.3 },
  ];
  return {
    rail: { progress: 0.5, press: 0 },
    body: (
      <>
        <Circles n={4} />
        <Edge from={sam} to={ana} k={edge} />
        {nodes.map((n) => (
          <CanvasNode
            key={n.label}
            at={n.pos}
            label={n.label}
            k={n.held || n.done ? 1 : drawerOpen}
            r={n.held || n.done ? NODE_R : 22}
            pulse={
              n.label === NAMES.sam && t >= 3.8 && t < 4.3 ? t - 3.8 : undefined
            }
          />
        ))}
        <PromptCard
          lines={connecting ? TEXT.connect : TEXT.place}
          count={2}
          current={connecting ? 1 : 0}
        />
        {drawerOpen > 0 ? (
          <g transform={`translate(0 ${(1 - drawerOpen) * 90})`}>
            <Drawer style={DRAWER} />
            {nodes.map((n, i) =>
              n.held || n.done ? null : (
                <CanvasNode
                  key={n.label}
                  at={drawerSlot(i, plan.length, DRAWER)}
                  label={n.label}
                  r={22}
                />
              ),
            )}
          </g>
        ) : null}
      </>
    ),
    overlay: <Click t={t} stops={stops} leave={4.8} />,
  };
});

/**
 * Shows a sociogram where the background changes from three concentric circles
 * to five, the circles are skewed so the inner rings grow, and then an image
 * divided into Home, Work, School and Online regions replaces the circles.
 */
export const SociogramBackgroundScene = defineScene(6.4, ({ t }) => {
  const n = t < 0.9 ? 3 : t < 1.7 ? 4 : 5;
  const skew = smooth(segment(t, 2.4, 0.8));
  const image = smooth(segment(t, 4.0, 0.6));
  const label = t >= 4.0 ? TEXT.image : t >= 2.3 ? TEXT.skew : TEXT.rings(n);
  const half = (STAGE.right - STAGE.x) / 3;
  const quad = [
    { x: STAGE.x, y: STAGE.y, fill: 'fill-sea-serpent/30' },
    { x: CANVAS.x, y: STAGE.y, fill: 'fill-mustard/30' },
    { x: STAGE.x, y: CANVAS.y, fill: 'fill-neon-coral/25' },
    { x: CANVAS.x, y: CANVAS.y, fill: 'fill-slate-blue/40' },
  ];
  return {
    rail: { progress: 0.5 },
    body: (
      <>
        <Circles n={n} skew={skew} opacity={1 - image} />
        <g opacity={image}>
          {quad.map((q, i) => (
            <g key={TEXT.regions[i]}>
              <rect
                x={q.x}
                y={q.y}
                width={half * 1.5}
                height={CANVAS.y - STAGE.y}
                className={q.fill}
              />
              <text
                x={q.x + (i % 2 === 0 ? 24 : half * 1.5 - 24)}
                y={q.y + (i < 2 ? 34 : CANVAS.y - STAGE.y - 20)}
                textAnchor={i % 2 === 0 ? 'start' : 'end'}
                fontSize={20}
                fontWeight={800}
                className="fill-white/80"
              >
                {TEXT.regions[i]}
              </text>
            </g>
          ))}
        </g>
        <Chip
          x={STAGE_CENTER_X}
          y={STAGE.bottom - 26}
          text={label}
          size={14}
          k={1}
        />
      </>
    ),
  };
});

/**
 * Shows a sociogram where, side by side, the participant drags alters from the
 * drawer onto a canvas in manual layout, while the nodes on a canvas in
 * automatic layout settle into place on their own until the participant presses
 * pause.
 */
export const SociogramLayoutModeScene = defineScene(6.2, ({ t }) => {
  const width = (CONTENT.right - CONTENT.x) / 2;
  const left = { x: CONTENT.x + width / 2, y: CONTENT.y + 170, r: 120 };
  const right = { x: CONTENT.x + width * 1.5, y: CONTENT.y + 170, r: 120 };
  const drawerY = CONTENT.bottom - 34;
  const manual = [
    { label: NAMES.sam, dx: -50, dy: -30 },
    { label: NAMES.ana, dx: 40, dy: -50 },
    { label: NAMES.jo, dx: 0, dy: 50 },
  ].map(({ label, dx, dy }, i) => {
    const from: Point = [left.x + (i - 1) * 50, drawerY];
    const to: Point = [left.x + dx, left.y + dy];
    return { label, from, to, at: 0.6 + i * 0.9 };
  });
  const running = t < 4.6;
  const sim = settle(Math.min(t, 4.6) / 2.2);
  const auto = [
    { label: NAMES.sam, to: [-55, -25] as const },
    { label: NAMES.ana, to: [35, -55] as const },
    { label: NAMES.jo, to: [10, 50] as const },
    { label: NAMES.kai, to: [65, 25] as const },
  ].map((a, i) => ({
    label: a.label,
    at: [
      right.x + lerp((i - 1.5) * 8, a.to[0], sim),
      right.y + lerp((i % 2) * 8, a.to[1], sim),
    ] as Point,
  }));
  const pauseAt: Point = [right.x + width / 2 - 34, CONTENT.y + 30];
  const Glyph = running ? Pause : Play;
  return {
    body: (
      <>
        <line
          x1={CONTENT.x + width}
          y1={CONTENT.y}
          x2={CONTENT.x + width}
          y2={CONTENT.bottom}
          className="stroke-white/15"
          strokeWidth={2}
        />
        <Circles n={3} x={left.x} y={left.y} r={left.r} />
        <Circles n={3} x={right.x} y={right.y} r={right.r} />
        <Chip
          x={left.x}
          y={CONTENT.y + 26}
          text={TEXT.manual}
          size={14}
          k={1}
        />
        <Chip
          x={right.x}
          y={CONTENT.y + 26}
          text={TEXT.automatic}
          size={14}
          k={1}
        />
        <rect
          x={left.x - 100}
          y={drawerY - 26}
          width={200}
          height={60}
          rx={10}
          className="fill-cyber-grape"
        />
        {manual.map((m) => {
          const k = smooth(segment(t, m.at, 0.7));
          return (
            <CanvasNode
              key={m.label}
              at={[lerp(m.from[0], m.to[0], k), lerp(m.from[1], m.to[1], k)]}
              label={m.label}
              r={k > 0 ? 20 : 17}
            />
          );
        })}
        <Edge from={auto[0]?.at ?? [0, 0]} to={auto[1]?.at ?? [0, 0]} />
        <Edge from={auto[2]?.at ?? [0, 0]} to={auto[3]?.at ?? [0, 0]} />
        <Edge from={auto[1]?.at ?? [0, 0]} to={auto[3]?.at ?? [0, 0]} />
        {auto.map((a) => (
          <CanvasNode key={a.label} at={a.at} label={a.label} r={20} />
        ))}
        {/* The interview keeps the pause button inside the prompt card. */}
        <rect
          x={pauseAt[0] - 70}
          y={pauseAt[1] - 22}
          width={96}
          height={44}
          rx={12}
          className="fill-cyber-grape"
          opacity={0.92}
        />
        <GripHorizontal
          x={pauseAt[0] - 60}
          y={pauseAt[1] - 9}
          width={18}
          height={18}
          className="text-white/50"
        />
        <Glyph
          x={pauseAt[0] - 10}
          y={pauseAt[1] - 10}
          width={20}
          height={20}
          strokeWidth={2.6}
          className="text-white"
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          ...manual.flatMap((m) => [
            { to: m.from, at: m.at - 0.05, ring: false },
            { to: m.to, at: m.at + 0.7, glide: 0.7, ring: false },
          ]),
          { to: pauseAt, at: 4.6 },
        ]}
        leave={5.2}
      />
    ),
  };
});
