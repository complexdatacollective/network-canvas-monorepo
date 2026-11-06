import { ChevronDown, GripHorizontal, Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  PersonNode,
  pressAt,
  PromptPips,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type Point,
} from './parts';

const TEXT = {
  place: ['Place people closer to the centre', 'the closer you feel to them.'],
  connect: ['Connect the people', 'who know each other.'],
  weekly: ['Tap the people you', 'see every week.'],
  works: ['Connect the people', 'who work together.'],
  arrange: ['Place people where', 'they fit in your life.'],
  savesTo: 'Saves to: position',
  savesToWork: 'Saves to: work_position',
  knows: 'Knows: shown',
  worksWith: 'Works with: this prompt',
  rings: (n: number) => `Concentric circles: ${n}`,
  skew: 'Skew circle sizes: on',
  image: 'Image background',
  regions: ['Home', 'Work', 'School', 'Online'],
  manual: 'Manual',
  automatic: 'Automatic',
  exported: 'Exported data',
  nodes: 'Nodes',
  edges: 'Edges',
  nodeColumns: ['nodeID', 'name', 'position_x', 'position_y', 'weekly'],
  edgeColumns: ['edgeID', 'from', 'to'],
  yes: 'true',
  no: 'false',
  positions: 'Positions: position_x and position_y',
  edgeList: 'Edges: the edge list',
  marked: 'Marked: true or false',
} as const;

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';
const KAI = 'Kai';
const CAFE = 'Café';

/** The canvas the interview draws: concentric circles filling its height. */
const CANVAS = {
  x: STAGE_CENTER_X,
  y: (STAGE.y + STAGE.bottom) / 2,
  r: (STAGE.bottom - STAGE.y) / 2 - 12,
} as const;
const NODE_R = 27;

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
function Circles({
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
function CanvasNode({
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
function Edge({
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

const CARD_X = STAGE.right - 14 - 125;
const CARD_BOTTOM = STAGE.y + 12 + 84;

/** The drawer of nodes still to be placed, at the bottom of the canvas. */
const DRAWER = {
  width: 300,
  height: 60,
  bottom: STAGE.bottom,
} as const;
const drawerSlot = (i: number, count: number): Point => [
  STAGE_CENTER_X + (i - (count - 1) / 2) * 58,
  DRAWER.bottom - DRAWER.height / 2,
];

function Drawer({ open = 1 }: { open?: number }) {
  const y = DRAWER.bottom - DRAWER.height * open;
  return (
    <g>
      <rect
        x={STAGE_CENTER_X - 45}
        y={y - 26}
        width={90}
        height={34}
        rx={14}
        className="fill-cyber-grape"
      />
      <ChevronDown
        x={STAGE_CENTER_X - 12}
        y={y - 24}
        width={24}
        height={24}
        strokeWidth={3}
        className="text-white"
      />
      <rect
        x={STAGE_CENTER_X - DRAWER.width / 2}
        y={y}
        width={DRAWER.width}
        height={DRAWER.height + 10}
        rx={10}
        className="fill-cyber-grape"
      />
    </g>
  );
}

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
 * A sociogram: the participant drags each person out of the drawer onto the
 * circles, then taps two of them to draw an edge.
 */
export const SociogramIntroScene = defineScene(5.4, ({ t }) => {
  const plan: Placement[] = [
    { label: SAM, to: [CANVAS.x - 60, CANVAS.y - 30], at: 0.7 },
    { label: ANA, to: [CANVAS.x + 40, CANVAS.y - 70], at: 1.6 },
    { label: JO, to: [CANVAS.x + 20, CANVAS.y + 60], at: 2.5 },
  ];
  const nodes = plan.map((p, i) => ({
    ...p,
    ...placed(t, p, drawerSlot(i, plan.length)),
  }));
  const drawerOpen = 1 - smooth(segment(t, 3.3, 0.4));
  const sam = plan[0]?.to ?? [0, 0];
  const ana = plan[1]?.to ?? [0, 0];
  const edge = smooth(segment(t, 4.3, 0.3));
  const stops = [
    ...plan.flatMap((p, i) => [
      { to: drawerSlot(i, plan.length), at: p.at - 0.05, ring: false },
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
            pulse={n.label === SAM && t >= 3.8 && t < 4.3 ? t - 3.8 : undefined}
          />
        ))}
        <PromptCard lines={TEXT.place} />
        {drawerOpen > 0 ? (
          <g transform={`translate(0 ${(1 - drawerOpen) * 90})`}>
            <Drawer />
            {nodes.map((n, i) =>
              n.held || n.done ? null : (
                <CanvasNode
                  key={n.label}
                  at={drawerSlot(i, plan.length)}
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
 * What a sociogram leaves in the data: each node's position as _x and _y
 * columns, each edge as a row of the edge list, and a marked node as true.
 */
export const SociogramDataScene = defineScene(
  5.2,
  ({ t }) => {
    const small = { x: CONTENT.x + 150, y: CONTENT.y + 172, r: 130 };
    const people: {
      label: string;
      at: Point;
      xy: [string, string];
      weekly: boolean;
    }[] = [
      {
        label: SAM,
        at: [small.x - 50, small.y - 30],
        xy: ['0.31', '0.42'],
        weekly: true,
      },
      {
        label: ANA,
        at: [small.x + 40, small.y - 60],
        xy: ['0.58', '0.33'],
        weekly: false,
      },
      {
        label: JO,
        at: [small.x + 20, small.y + 55],
        xy: ['0.55', '0.66'],
        weekly: true,
      },
    ];
    const table = { x: 320, width: 370, row: 30 };
    const nodesTop = CONTENT.y + 26;
    const edgesTop = nodesTop + table.row * 5 + 30;
    const cols = [0, 62, 122, 212, 302];
    const edgeCols = [0, 110, 220];
    const rowIn = (i: number) => segment(t, 0.9 + i * 0.45, 0.35);
    const edgeIn = segment(t, 2.6, 0.35);
    const markIn = segment(t, 3.3, 0.35);
    const header = (
      top: number,
      title: string,
      columns: readonly string[],
      xs: number[],
      k: number,
    ) => (
      <g opacity={k}>
        <text
          x={table.x}
          y={top}
          fontSize={13}
          fontWeight={800}
          className="fill-white/60 uppercase"
        >
          {title}
        </text>
        <rect
          x={table.x}
          y={top + 8}
          width={table.width}
          height={table.row}
          rx={8}
          className="fill-cyber-grape"
        />
        {columns.map((c, i) => (
          <text
            key={c}
            x={table.x + 14 + (xs[i] ?? 0)}
            y={top + 28}
            fontSize={13}
            fontWeight={800}
            className="fill-white"
          >
            {c}
          </text>
        ))}
      </g>
    );
    return {
      body: (
        <>
          <Circles n={3} x={small.x} y={small.y} r={small.r} />
          <Edge from={people[0]?.at ?? [0, 0]} to={people[1]?.at ?? [0, 0]} />
          {people.map((p) => (
            <CanvasNode
              key={p.label}
              at={p.at}
              label={p.label}
              ring={p.weekly ? markIn : 0}
              r={20}
            />
          ))}
          {header(
            nodesTop,
            TEXT.nodes,
            TEXT.nodeColumns,
            cols,
            segment(t, 0.4, 0.3),
          )}
          {people.map((p, i) => {
            const y = nodesTop + 8 + table.row * (i + 1);
            const cells = [String(i + 1), p.label, p.xy[0], p.xy[1]];
            return (
              <g key={p.label} opacity={rowIn(i)}>
                <rect
                  x={table.x}
                  y={y}
                  width={table.width}
                  height={table.row}
                  className={i % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
                />
                {cells.map((c, j) => (
                  <text
                    key={j}
                    x={table.x + 14 + (cols[j] ?? 0)}
                    y={y + 20}
                    fontSize={13}
                    fontWeight={700}
                    className="fill-white"
                  >
                    {c}
                  </text>
                ))}
                <text
                  x={table.x + 14 + (cols[4] ?? 0)}
                  y={y + 20}
                  fontSize={13}
                  fontWeight={700}
                  opacity={markIn}
                  className={p.weekly ? 'fill-mustard' : 'fill-white/70'}
                >
                  {p.weekly ? TEXT.yes : TEXT.no}
                </text>
              </g>
            );
          })}
          {header(edgesTop, TEXT.edges, TEXT.edgeColumns, edgeCols, edgeIn)}
          <g opacity={edgeIn}>
            <rect
              x={table.x}
              y={edgesTop + 8 + table.row}
              width={table.width}
              height={table.row}
              className="fill-white/5"
            />
            {['1', '1', '2'].map((c, j) => (
              <text
                key={j}
                x={table.x + 14 + (edgeCols[j] ?? 0)}
                y={edgesTop + 28 + table.row}
                fontSize={14}
                fontWeight={700}
                className="fill-white"
              >
                {c}
              </text>
            ))}
          </g>
          <Chip
            x={small.x}
            y={CONTENT.bottom - 24}
            text={TEXT.positions}
            size={12}
            k={backOut(segment(t, 1.2, 0.4)) * (1 - segment(t, 2.5, 0.2))}
          />
          <Chip
            x={small.x}
            y={CONTENT.bottom - 24}
            text={TEXT.edgeList}
            size={12}
            k={backOut(segment(t, 2.7, 0.4)) * (1 - segment(t, 3.2, 0.2))}
          />
          <Chip
            x={small.x}
            y={CONTENT.bottom - 24}
            text={TEXT.marked}
            size={12}
            k={backOut(segment(t, 3.4, 0.4))}
          />
        </>
      ),
    };
  },
  { url: TEXT.exported },
);

const SHARED_PLAN: Point[] = [
  [CANVAS.x - 70, CANVAS.y - 20],
  [CANVAS.x, CANVAS.y - 90],
  [CANVAS.x + 10, CANVAS.y + 70],
];
const SHARED_NAMES = [SAM, ANA, CAFE];

/**
 * Prompts that save to one layout attribute share one arrangement; a prompt
 * with another attribute starts with every node back in the drawer.
 */
export const SociogramSharedLayoutScene = defineScene(6.0, ({ t }) => {
  const second = t >= 2.2;
  const third = t >= 4.0;
  const current = third ? 2 : second ? 1 : 0;
  const lines =
    current === 0 ? TEXT.place : current === 1 ? TEXT.connect : TEXT.arrange;
  const plan = SHARED_PLAN.map((to, i) => ({
    label: SHARED_NAMES[i] ?? '',
    to,
    at: 0.4 + i * 0.5,
  }));
  const drawerOpen = third
    ? smooth(segment(t, 4.05, 0.4))
    : 1 - smooth(segment(t, 1.9, 0.3));
  const reset = smooth(segment(t, 4.0, 0.4));
  return {
    rail: {
      progress: lerp(0.4, 0.6, current / 2),
      press: pressAt(t, [2.1, 3.9]),
    },
    body: (
      <>
        <Circles n={4} />
        {plan.map((p, i) => {
          const { pos, held, done } = placed(t, p, drawerSlot(i, plan.length));
          const on = (held || done) && reset < 1;
          return on ? (
            <CanvasNode key={p.label} at={pos} label={p.label} k={1 - reset} />
          ) : null;
        })}
        {second && !third ? (
          <Edge
            from={SHARED_PLAN[0] ?? [0, 0]}
            to={SHARED_PLAN[1] ?? [0, 0]}
            k={smooth(segment(t, 3.0, 0.3))}
          />
        ) : null}
        <PromptCard
          lines={lines}
          count={3}
          current={current}
          height={110}
          extra={
            <Chip
              x={CARD_X}
              y={CARD_BOTTOM + 8}
              text={third ? TEXT.savesToWork : TEXT.savesTo}
              size={11}
              k={1}
            />
          }
        />
        {drawerOpen > 0 ? (
          <g transform={`translate(0 ${(1 - drawerOpen) * 90})`}>
            <Drawer />
            {plan.map((p, i) => {
              const { held, done } = placed(t, p, drawerSlot(i, plan.length));
              return held || (done && !third) ? null : (
                <CanvasNode
                  key={p.label}
                  at={drawerSlot(i, plan.length)}
                  label={p.label}
                  r={22}
                />
              );
            })}
          </g>
        ) : null}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          ...plan.flatMap((p, i) => [
            { to: drawerSlot(i, plan.length), at: p.at - 0.05, ring: false },
            { to: p.to, at: p.at + 0.7, glide: 0.6, ring: false },
          ]),
          { to: [CONTENT.x + 33, CONTENT.bottom - 40], at: 2.1 },
          { to: SHARED_PLAN[0] ?? [0, 0], at: 2.7 },
          { to: SHARED_PLAN[1] ?? [0, 0], at: 3.0 },
          { to: [CONTENT.x + 33, CONTENT.bottom - 40], at: 3.9 },
        ]}
        leave={4.4}
      />
    ),
  };
});

const TAP: readonly [Point, Point, Point, Point] = [
  [CANVAS.x - 80, CANVAS.y - 20],
  [CANVAS.x + 10, CANVAS.y - 95],
  [CANVAS.x - 10, CANVAS.y + 70],
  [CANVAS.x + 90, CANVAS.y + 50],
];
const TAP_NAMES = [SAM, ANA, JO, KAI];

/**
 * The two things tapping can do: on an edge prompt, tap one node then
 * another to draw an edge, and tap the pair again to remove it; on a
 * highlighting prompt, tap a node to mark it.
 */
export const SociogramTapScene = defineScene(6.6, ({ t }) => {
  const [sam, ana, jo, kai] = TAP;
  const second = t >= 3.6;
  const edge =
    smooth(segment(t, 1.2, 0.25)) * (1 - smooth(segment(t, 2.7, 0.25)));
  return {
    rail: { progress: second ? 0.6 : 0.5, press: pressAt(t, [3.5]) },
    body: (
      <>
        <Circles n={4} />
        <Edge from={sam} to={ana} k={edge} />
        {TAP.map((at, i) => (
          <CanvasNode
            key={TAP_NAMES[i]}
            at={at}
            label={TAP_NAMES[i] ?? ''}
            pulse={
              i === 0 && ((t >= 0.7 && t < 1.2) || (t >= 2.2 && t < 2.7))
                ? t - 0.7
                : undefined
            }
            ring={
              second
                ? i === 2
                  ? segment(t, 4.4, 0.4)
                  : i === 3
                    ? segment(t, 5.2, 0.4)
                    : 0
                : 0
            }
          />
        ))}
        <PromptCard
          lines={second ? TEXT.weekly : TEXT.connect}
          count={2}
          current={second ? 1 : 0}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: sam, at: 0.7 },
          { to: ana, at: 1.2 },
          { to: sam, at: 2.2 },
          { to: ana, at: 2.7 },
          { to: [CONTENT.x + 33, CONTENT.bottom - 40], at: 3.5 },
          { to: jo, at: 4.4 },
          { to: kai, at: 5.2 },
        ]}
        leave={5.7}
      />
    ),
  };
});

/**
 * Displayed edges: the edges drawn on an earlier prompt stay on screen while
 * a later prompt draws another edge type.
 */
export const SociogramDisplayEdgesScene = defineScene(6.0, ({ t }) => {
  const [sam, ana, jo, kai] = TAP;
  const second = t >= 2.6;
  return {
    rail: { progress: second ? 0.6 : 0.5, press: pressAt(t, [2.5]) },
    body: (
      <>
        <Circles n={4} />
        <Edge from={sam} to={ana} k={smooth(segment(t, 0.9, 0.3))} />
        <Edge from={ana} to={kai} k={smooth(segment(t, 1.8, 0.3))} />
        <Edge from={jo} to={kai} type={2} k={smooth(segment(t, 3.6, 0.3))} />
        <Edge from={sam} to={jo} type={2} k={smooth(segment(t, 4.5, 0.3))} />
        {TAP.map((at, i) => (
          <CanvasNode key={TAP_NAMES[i]} at={at} label={TAP_NAMES[i] ?? ''} />
        ))}
        <PromptCard
          lines={second ? TEXT.works : TEXT.connect}
          count={2}
          current={second ? 1 : 0}
          height={second ? 120 : 84}
          extra={
            second ? (
              <>
                <Chip
                  x={CARD_X}
                  y={CARD_BOTTOM + 4}
                  text={TEXT.knows}
                  size={11}
                  k={backOut(segment(t, 2.7, 0.4))}
                />
                <Chip
                  x={CARD_X}
                  y={CARD_BOTTOM + 26}
                  text={TEXT.worksWith}
                  size={11}
                  fill="fill-sea-serpent"
                  k={backOut(segment(t, 2.9, 0.4))}
                />
              </>
            ) : null
          }
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: sam, at: 0.6 },
          { to: ana, at: 0.9 },
          { to: ana, at: 1.5 },
          { to: kai, at: 1.8 },
          { to: [CONTENT.x + 33, CONTENT.bottom - 40], at: 2.5 },
          { to: jo, at: 3.3 },
          { to: kai, at: 3.6 },
          { to: sam, at: 4.2 },
          { to: jo, at: 4.5 },
        ]}
        leave={5.0}
      />
    ),
  };
});

/**
 * The background options: the number of circles, skewing them so the inner
 * rings grow, and an image of your own, such as one divided into regions.
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

/** A simulation settling: overshoots a little, then comes to rest. */
const settle = (k: number) => 1 - Math.exp(-3 * k) * Math.cos(k * 5);

/** The two layouts, side by side. */
export const SociogramLayoutModeScene = defineScene(6.2, ({ t }) => {
  const width = (CONTENT.right - CONTENT.x) / 2;
  const left = { x: CONTENT.x + width / 2, y: CONTENT.y + 170, r: 120 };
  const right = { x: CONTENT.x + width * 1.5, y: CONTENT.y + 170, r: 120 };
  const drawerY = CONTENT.bottom - 34;
  const manual = [
    { label: SAM, dx: -50, dy: -30 },
    { label: ANA, dx: 40, dy: -50 },
    { label: JO, dx: 0, dy: 50 },
  ].map(({ label, dx, dy }, i) => {
    const from: Point = [left.x + (i - 1) * 50, drawerY];
    const to: Point = [left.x + dx, left.y + dy];
    return { label, from, to, at: 0.6 + i * 0.9 };
  });
  const running = t < 4.6;
  const sim = settle(Math.min(t, 4.6) / 2.2);
  const auto = [
    { label: SAM, to: [-55, -25] as const },
    { label: ANA, to: [35, -55] as const },
    { label: JO, to: [10, 50] as const },
    { label: KAI, to: [65, 25] as const },
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
