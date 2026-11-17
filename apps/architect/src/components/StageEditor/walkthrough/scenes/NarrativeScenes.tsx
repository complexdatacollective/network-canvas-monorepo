import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Snowflake,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NAMES,
  smooth,
  STAGE,
  type Point,
} from './parts';
import { CANVAS, CanvasNode, Circles, Edge, NODE_R } from './SociogramScenes';

const TEXT = {
  presets: ['Friends', 'Groups', 'Support'],
  attributes: 'Attributes',
  highlights: ['Gives support', 'Sees weekly'],
  groups: ['Family', 'Work'],
  sociogram: 'Sociogram',
  narrative: 'Narrative',
  savesTo: 'Layout attribute: position',
  noPosition: 'No position: not shown',
  nodes: 'Nodes',
  columns: ['name', 'position_x', 'position_y'],
  unchanged: 'Nothing from this stage',
} as const;

/** One network, laid out as a participant left it on a sociogram. */
const PEOPLE: readonly { label: string; at: Point }[] = [
  { label: NAMES.sam, at: [CANVAS.x - 95, CANVAS.y - 60] },
  { label: NAMES.ana, at: [CANVAS.x - 30, CANVAS.y - 105] },
  { label: NAMES.jo, at: [CANVAS.x - 70, CANVAS.y + 30] },
  { label: NAMES.kai, at: [CANVAS.x + 85, CANVAS.y + 20] },
  { label: NAMES.lin, at: [CANVAS.x + 60, CANVAS.y + 95] },
];

const at = (label: string): Point =>
  PEOPLE.find((p) => p.label === label)?.at ?? [CANVAS.x, CANVAS.y];

const EDGES: readonly [string, string][] = [
  [NAMES.sam, NAMES.ana],
  [NAMES.sam, NAMES.jo],
  [NAMES.kai, NAMES.lin],
  [NAMES.jo, NAMES.kai],
];

/** The groups a categorical attribute draws, Jo in both. */
const GROUPS: readonly { members: readonly string[]; color: number }[] = [
  { members: [NAMES.sam, NAMES.ana, NAMES.jo], color: 1 },
  { members: [NAMES.jo, NAMES.kai, NAMES.lin], color: 2 },
];

const HULL_FILLS = ['fill-cat-1', 'fill-cat-2'] as const;
const HULL_STROKES = ['stroke-cat-1', 'stroke-cat-2'] as const;

/**
 * A group as the interview draws it: the shape around its members, filled
 * and stroked wide and round in the category's color, half transparent.
 */
export function Hull({
  points,
  color,
  k,
}: {
  points: readonly Point[];
  color: number;
  k: number;
}) {
  if (k <= 0 || points.length === 0) return null;
  const cx0 = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy0 = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const d = `M ${points.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
  return (
    <path
      d={d}
      transform={`translate(${cx0} ${cy0}) scale(${Math.max(0.001, k)}) translate(${-cx0} ${-cy0})`}
      className={cx(HULL_FILLS[color - 1], HULL_STROKES[color - 1])}
      strokeWidth={NODE_R * 2 + 24}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={0.45}
    />
  );
}

function Network({
  edges = 0,
  hulls = 0,
  highlighted = () => 0,
}: {
  /** 0 to 1, the edges showing. */
  edges?: number;
  /** 0 to 1, the groups showing. */
  hulls?: number;
  /** 0 to 1 for each node's highlight ring. */
  highlighted?: (label: string) => number;
}) {
  return (
    <>
      <Circles n={4} />
      {GROUPS.map((g) => (
        <Hull
          key={g.color}
          points={g.members.map(at)}
          color={g.color}
          k={hulls}
        />
      ))}
      <g opacity={edges}>
        {EDGES.map(([a, b]) => (
          <Edge key={`${a}-${b}`} from={at(a)} to={at(b)} />
        ))}
      </g>
      {PEOPLE.map((p) => (
        <CanvasNode
          key={p.label}
          at={p.at}
          label={p.label}
          ring={highlighted(p.label)}
        />
      ))}
    </>
  );
}

const SWITCHER = {
  width: 220,
  height: 46,
  x: STAGE.right - 236,
  y: STAGE.bottom - 62,
} as const;
const NEXT_PRESET: Point = [
  SWITCHER.x + SWITCHER.width - 24,
  SWITCHER.y + SWITCHER.height / 2,
];

/** The preset switcher at the bottom right: previous, the label, next. */
function PresetSwitcher({
  label,
  first,
  last,
  popover,
}: {
  label: string;
  first: boolean;
  last: boolean;
  popover?: ReactNode;
}) {
  const mid = SWITCHER.y + SWITCHER.height / 2;
  return (
    <g>
      {popover}
      <rect
        x={SWITCHER.x}
        y={SWITCHER.y}
        width={SWITCHER.width}
        height={SWITCHER.height}
        rx={SWITCHER.height / 2}
        className="fill-cyber-grape"
      />
      {/* oxlint-disable-next-line direction/inline-arrow-turns -- the scene is drawn at fixed coordinates and does not mirror, so this marks the switcher's physical left end */}
      <ChevronLeft
        x={SWITCHER.x + 12}
        y={mid - 12}
        width={24}
        height={24}
        strokeWidth={3}
        className={first ? 'text-white/30' : 'text-white'}
      />
      <text
        x={SWITCHER.x + SWITCHER.width / 2}
        y={mid + 6}
        textAnchor="middle"
        fontSize={17}
        fontWeight={800}
        className="fill-white"
      >
        {label}
      </text>
      {/* oxlint-disable-next-line direction/inline-arrow-turns -- the scene is drawn at fixed coordinates and does not mirror, so this marks the switcher's physical right end */}
      <ChevronRight
        x={NEXT_PRESET[0] - 12}
        y={mid - 12}
        width={24}
        height={24}
        strokeWidth={3}
        className={last ? 'text-white/30' : 'text-white'}
      />
    </g>
  );
}

/**
 * Shows a narrative where the participant steps through three presets with the
 * next arrow, from one that draws edges, to one that groups nodes, to one that
 * highlights two nodes.
 */
export const NarrativeIntroScene = defineScene(6.2, ({ t }) => {
  const toGroups = smooth(segment(t, 2.0, 0.5));
  const toSupport = smooth(segment(t, 4.2, 0.5));
  const preset = t < 2.0 ? 0 : t < 4.2 ? 1 : 2;
  return {
    rail: { progress: 0.85 },
    body: (
      <>
        <Network
          edges={1 - toGroups}
          hulls={toGroups * (1 - toSupport)}
          highlighted={(label) =>
            label === NAMES.ana || label === NAMES.kai ? toSupport : 0
          }
        />
        <PresetSwitcher
          label={TEXT.presets[preset] ?? ''}
          first={preset === 0}
          last={preset === 2}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: NEXT_PRESET, at: 2.0 },
          { to: NEXT_PRESET, at: 4.2 },
        ]}
        leave={4.8}
      />
    ),
  };
});

/**
 * Shows how a narrative's data is exported: the participant drags a node and
 * draws a line on the canvas, and the exported positions stay exactly as they
 * were.
 */
export const NarrativeDataScene = defineScene(
  5.4,
  ({ t }) => {
    const small = { x: CONTENT.x + 150, y: CONTENT.y + 180, r: 130 };
    const nodes: { label: string; at: Point; xy: [string, string] }[] = [
      {
        label: NAMES.sam,
        at: [small.x - 50, small.y - 40],
        xy: ['0.31', '0.42'],
      },
      {
        label: NAMES.ana,
        at: [small.x + 45, small.y - 55],
        xy: ['0.58', '0.33'],
      },
      {
        label: NAMES.jo,
        at: [small.x + 10, small.y + 55],
        xy: ['0.55', '0.66'],
      },
    ];
    const drag = smooth(segment(t, 0.6, 0.8));
    const dragged: Point = [
      lerp(nodes[2]?.at[0] ?? 0, small.x - 70, drag),
      lerp(nodes[2]?.at[1] ?? 0, small.y + 70, drag),
    ];
    const stroke = smooth(segment(t, 1.8, 0.8));
    const strokeFade = 1 - smooth(segment(t, 3.0, 1.2));
    const table = { x: CONTENT.x + 330, y: CONTENT.y + 60, row: 36 };
    const cols = [0, 90, 210];
    return {
      body: (
        <>
          <Circles n={3} x={small.x} y={small.y} r={small.r} />
          {nodes.map((n, i) => (
            <CanvasNode
              key={n.label}
              at={i === 2 ? dragged : n.at}
              label={n.label}
              r={22}
            />
          ))}
          <path
            d={`M ${small.x - 90} ${small.y - 80} Q ${small.x} ${small.y - 130} ${small.x + 90} ${small.y - 80}`}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - stroke}
            className="fill-none stroke-white"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={strokeFade}
          />
          <text
            x={table.x}
            y={table.y - 14}
            fontSize={13}
            fontWeight={800}
            className="fill-white/60 uppercase"
          >
            {TEXT.nodes}
          </text>
          <rect
            x={table.x}
            y={table.y}
            width={330}
            height={table.row}
            rx={8}
            className="fill-cyber-grape"
          />
          {TEXT.columns.map((c, i) => (
            <text
              key={c}
              x={table.x + 14 + (cols[i] ?? 0)}
              y={table.y + 23}
              fontSize={13}
              fontWeight={800}
              className="fill-white"
            >
              {c}
            </text>
          ))}
          {nodes.map((n, r) => {
            const y = table.y + table.row * (r + 1);
            return (
              <g key={n.label}>
                <rect
                  x={table.x}
                  y={y}
                  width={330}
                  height={table.row}
                  className={r % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
                />
                {[n.label, ...n.xy].map((cell, i) => (
                  <text
                    key={`${n.label}-${TEXT.columns[i] ?? i}`}
                    x={table.x + 14 + (cols[i] ?? 0)}
                    y={y + 23}
                    fontSize={13}
                    fontWeight={700}
                    className="fill-white"
                  >
                    {cell}
                  </text>
                ))}
              </g>
            );
          })}
          <Chip
            x={table.x + 165}
            y={table.y + table.row * 4 + 50}
            text={TEXT.unchanged}
            size={14}
            k={backOut(segment(t, 3.6, 0.4))}
          />
        </>
      ),
      overlay: (
        <Click
          t={t}
          stops={[
            { to: nodes[2]?.at ?? [0, 0], at: 0.55, ring: false },
            {
              to: [small.x - 70, small.y + 70],
              at: 1.4,
              glide: 0.8,
              ring: false,
            },
            { to: [small.x - 90, small.y - 80], at: 1.75, ring: false },
            {
              to: [small.x + 90, small.y - 80],
              at: 2.6,
              glide: 0.8,
              ring: false,
            },
          ]}
          leave={3.0}
        />
      ),
    };
  },
  { url: 'Exported data' },
);

const TOOLBAR = { x: STAGE.x + 16, y: STAGE.bottom - 62, height: 46 } as const;
const toolAt = (i: number): Point => [
  TOOLBAR.x + 28 + i * 46,
  TOOLBAR.y + TOOLBAR.height / 2,
];

/**
 * Shows a narrative where the participant turns on the pencil and draws a line
 * around a group that fades away, then turns on the snowflake and draws an
 * arrow that stays until the reset button clears it.
 */
export const NarrativeDrawScene = defineScene(6.4, ({ t }) => {
  const pencilOn = t >= 0.6;
  const frozen = t >= 3.4;
  const first = smooth(segment(t, 1.2, 0.9));
  const firstFade = 1 - smooth(segment(t, 2.2, 1.0));
  const second = smooth(segment(t, 4.0, 0.9));
  const secondFade = 1 - smooth(segment(t, 5.6, 0.3));
  const loop = `M ${CANVAS.x - 150} ${CANVAS.y - 40} C ${CANVAS.x - 150} ${CANVAS.y - 170} ${CANVAS.x + 20} ${CANVAS.y - 170} ${CANVAS.x + 10} ${CANVAS.y - 50} S ${CANVAS.x - 150} ${CANVAS.y + 90} ${CANVAS.x - 150} ${CANVAS.y - 40}`;
  const arrow = `M ${CANVAS.x + 160} ${CANVAS.y + 150} Q ${CANVAS.x + 150} ${CANVAS.y + 60} ${CANVAS.x + 110} ${CANVAS.y + 40}`;
  const tools = [
    { icon: Pencil, on: pencilOn },
    { icon: Snowflake, on: frozen },
    { icon: RotateCcw, on: false },
  ];
  return {
    rail: { progress: 0.85 },
    body: (
      <>
        <Network edges={1} />
        <path
          d={loop}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - first}
          className="fill-none stroke-white"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={first > 0 ? firstFade : 0}
        />
        <path
          d={arrow}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - second}
          className="fill-none stroke-white"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={second > 0 ? secondFade : 0}
        />
        <rect
          x={TOOLBAR.x}
          y={TOOLBAR.y}
          width={46 * 3 + 10}
          height={TOOLBAR.height}
          rx={TOOLBAR.height / 2}
          className="fill-cyber-grape"
        />
        {tools.map(({ icon: Glyph, on }, i) => {
          const [x, y] = toolAt(i);
          return (
            <g key={i}>
              {on ? (
                <circle cx={x} cy={y} r={18} className="fill-white/20" />
              ) : null}
              <Glyph
                x={x - 11}
                y={y - 11}
                width={22}
                height={22}
                strokeWidth={2.4}
                className="text-white"
              />
            </g>
          );
        })}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: toolAt(0), at: 0.6 },
          { to: [CANVAS.x - 150, CANVAS.y - 40], at: 1.15, ring: false },
          {
            to: [CANVAS.x + 10, CANVAS.y - 50],
            at: 2.1,
            glide: 0.9,
            ring: false,
          },
          { to: toolAt(1), at: 3.4 },
          { to: [CANVAS.x + 160, CANVAS.y + 150], at: 3.95, ring: false },
          {
            to: [CANVAS.x + 110, CANVAS.y + 40],
            at: 4.9,
            glide: 0.9,
            ring: false,
          },
          { to: toolAt(2), at: 5.6 },
        ]}
        leave={6.0}
      />
    ),
  };
});
