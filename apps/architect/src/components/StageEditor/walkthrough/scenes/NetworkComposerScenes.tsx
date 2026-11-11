import {
  Link,
  MousePointer2,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { Hull } from './NarrativeScenes';
import {
  CalloutPin,
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type Point,
  type Stop,
} from './parts';
import { CANVAS, CanvasNode, Circles, Edge } from './SociogramScenes';

const TEXT = {
  placeholder: 'Type a name, then press Enter',
  quickAdd: 'Quick add attribute: name',
  layout: 'Layout attribute: position',
  edgeTypes: ['Friends', 'Family'],
  groups: ['Family', 'Work'],
  tools: [
    'Select and move',
    'Add node',
    'Draw edge',
    'Groups',
    'Automatic layout',
    'Undo',
    'Redo',
  ],
  closeness: 'How close are you?',
  nickname: 'Nickname',
  nicknameValue: 'Sammy',
  talk: 'How often do you talk?',
  talkOptions: ['Daily', 'Weekly', 'Monthly'],
  remove: 'Delete',
  savedAsYouGo: 'Saved as you go',
  nodes: 'Nodes',
  edges: 'Edges',
  nodeColumns: ['name', 'position_x', 'position_y', 'group_family'],
  edgeColumns: ['from', 'to', 'type'],
} as const;

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';
const KAI = 'Kai';
const LIN = 'Lin';

/** The width and height of the canvas beside the navigation rail. */
const WIDTH = STAGE.right - STAGE.x;
const HEIGHT = STAGE.bottom - STAGE.y;

/** A position as the layout attribute stores it: 0 to 1 across the canvas. */
const normalised = ([x, y]: Point) =>
  [
    ((x - STAGE.x) / WIDTH).toFixed(2),
    ((y - STAGE.y) / HEIGHT).toFixed(2),
  ] as const;

/** One network, as the interviewer might leave it. */
const PEOPLE: readonly { label: string; at: Point }[] = [
  { label: SAM, at: [CANVAS.x - 110, CANVAS.y - 50] },
  { label: ANA, at: [CANVAS.x - 20, CANVAS.y - 110] },
  { label: JO, at: [CANVAS.x - 10, CANVAS.y + 40] },
  { label: KAI, at: [CANVAS.x + 110, CANVAS.y - 10] },
  { label: LIN, at: [CANVAS.x + 90, CANVAS.y + 110] },
];

const at = (label: string, dx = 0): Point => {
  const point = PEOPLE.find((p) => p.label === label)?.at ?? [
    CANVAS.x,
    CANVAS.y,
  ];
  return [point[0] + dx, point[1]];
};

/** Network positions shifted left, clear of the inspector. */
const SHIFT = -80;

const midpoint = (a: Point, b: Point): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

/** A spring that overshoots a little and settles, like the force layout. */
const settle = (k: number) =>
  k <= 0 ? 0 : 1 - Math.exp(-3 * k) * Math.cos(k * 5);

/** The letters of `text` typed so far, one every `pace` seconds. */
const typed = (t: number, text: string, start: number, pace = 0.08) =>
  t < start ? '' : text.slice(0, Math.floor((t - start) / pace) + 1);

const TOOLS = [
  { key: 'select', icon: MousePointer2 },
  { key: 'add', icon: Plus },
  { key: 'edge', icon: Link },
  { key: 'groups', icon: Shapes },
  { key: 'layout', icon: Sparkles },
  { key: 'undo', icon: Undo2 },
  { key: 'redo', icon: Redo2 },
] as const;
type Tool = (typeof TOOLS)[number]['key'];

const TOOL_GAP = 42;
const GROUP_GAP = 16;
const PALETTE = {
  x: STAGE.x + 14,
  width: 50,
  top: CANVAS.y - (TOOLS.length * TOOL_GAP + GROUP_GAP + 12) / 2,
  height: TOOLS.length * TOOL_GAP + GROUP_GAP + 12,
} as const;
const PALETTE_RIGHT = PALETTE.x + PALETTE.width;

/**
 * The spot the interview gives the `i`th node added with automatic layout
 * off: a grid read from the top left, kept clear of the palette.
 */
const gridCell = (i: number): Point => [
  PALETTE_RIGHT + 48 + (i % 7) * 64,
  STAGE.y + HEIGHT * (0.12 + Math.floor(i / 7) * 0.18),
];

/** The middle of a tool's button on the palette. */
const toolAt = (tool: Tool): Point => {
  const i = TOOLS.findIndex((entry) => entry.key === tool);
  return [
    PALETTE.x + PALETTE.width / 2,
    PALETTE.top + 6 + TOOL_GAP / 2 + i * TOOL_GAP + (i >= 4 ? GROUP_GAP : 0),
  ];
};

/**
 * The floating tool palette down the left of the canvas: select, add, draw
 * edge and groups, then automatic layout and undo and redo. The tool in use
 * is filled, in its edge type's or group's color while it has one.
 */
function Palette({
  active = [],
  tint,
  dimmed = [],
  pressed,
}: {
  active?: readonly Tool[];
  /** The fill of an active edge or groups tool. */
  tint?: string;
  /** Tools greyed out, as undo and redo are with nothing to undo or redo. */
  dimmed?: readonly Tool[];
  /** A tool being pressed: its fill grows in as `k` runs from 0 to 1. */
  pressed?: Readonly<{ tool: Tool; k: number }>;
}) {
  const separator = PALETTE.top + 6 + TOOL_GAP * 4 + GROUP_GAP / 2;
  return (
    <g>
      <rect
        x={PALETTE.x}
        y={PALETTE.top}
        width={PALETTE.width}
        height={PALETTE.height}
        rx={PALETTE.width / 2}
        className="fill-white/10 stroke-white/20"
        strokeWidth={2}
      />
      <line
        x1={PALETTE.x + 12}
        y1={separator}
        x2={PALETTE_RIGHT - 12}
        y2={separator}
        className="stroke-white/20"
        strokeWidth={2}
      />
      {TOOLS.map(({ key, icon: Glyph }) => {
        const [x, y] = toolAt(key);
        const grow = pressed?.tool === key ? backOut(pressed.k) : 1;
        const on = active.includes(key) && grow > 0;
        const colored =
          on && tint !== undefined && (key === 'edge' || key === 'groups');
        return (
          <g key={key}>
            {on ? (
              <circle
                cx={x}
                cy={y}
                r={18 * grow}
                className={colored ? tint : 'fill-white'}
              />
            ) : null}
            <Glyph
              x={x - 11}
              y={y - 11}
              width={22}
              height={22}
              strokeWidth={2.4}
              className={on && !colored ? 'text-navy-taupe' : 'text-white'}
              opacity={dimmed.includes(key) ? 0.35 : 1}
            />
          </g>
        );
      })}
    </g>
  );
}

/** A small list that opens beside a palette tool, e.g. edge types or groups. */
function ToolMenu({
  tool,
  items,
  k,
}: {
  tool: Tool;
  items: readonly { label: string; swatch: ReactNode }[];
  k: number;
}) {
  if (k <= 0) return null;
  const [, y] = toolAt(tool);
  const top = y - 22;
  const x = PALETTE_RIGHT + 12;
  return (
    <g
      opacity={Math.min(1, k * 2)}
      transform={`translate(${x} ${top}) scale(${Math.max(0.001, backOut(k))}) translate(${-x} ${-top})`}
    >
      <rect
        x={x}
        y={top}
        width={150}
        height={items.length * 38 + 8}
        rx={12}
        className="fill-white"
      />
      {items.map((item, i) => (
        <g key={item.label}>
          {item.swatch}
          <text
            x={x + 44}
            y={top + 28 + i * 38}
            fontSize={15}
            fontWeight={700}
            className="fill-navy-taupe"
          >
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Where a tool menu's `i`th item sits, for the cursor. */
const menuItemAt = (tool: Tool, i: number): Point => [
  PALETTE_RIGHT + 60,
  toolAt(tool)[1] - 22 + 23 + i * 38,
];

const EDGE_STROKES = ['stroke-edge-1', 'stroke-edge-2'] as const;
const EDGE_FILLS = ['fill-edge-1', 'fill-edge-2'] as const;
const GROUP_FILLS = ['fill-cat-1', 'fill-cat-2'] as const;

const edgeMenu = (tool: Tool = 'edge') =>
  TEXT.edgeTypes.map((label, i) => {
    const y = toolAt(tool)[1] - 22 + 23 + i * 38;
    const x = PALETTE_RIGHT + 24;
    return {
      label,
      swatch: (
        <line
          x1={x}
          y1={y}
          x2={x + 22}
          y2={y}
          className={EDGE_STROKES[i]}
          strokeWidth={6}
          strokeLinecap="round"
        />
      ),
    };
  });

const groupMenu = () =>
  TEXT.groups.map((label, i) => {
    const y = toolAt('groups')[1] - 22 + 23 + i * 38;
    return {
      label,
      swatch: (
        <circle
          cx={PALETTE_RIGHT + 35}
          cy={y}
          r={10}
          className={GROUP_FILLS[i]}
        />
      ),
    };
  });

/** The quick-add box that opens beside the add tool and stays open. */
function NameField({ text, k = 1 }: { text: string; k?: number }) {
  if (k <= 0) return null;
  const [, y] = toolAt('add');
  const x = PALETTE_RIGHT + 12;
  return (
    <g opacity={Math.min(1, k * 2)}>
      <rect
        x={x}
        y={y - 22}
        width={250}
        height={44}
        rx={10}
        className="fill-white"
      />
      <text
        x={x + 14}
        y={y + 5}
        fontSize={14}
        fontWeight={text === '' ? 600 : 800}
        className={text === '' ? 'fill-navy-taupe/40' : 'fill-navy-taupe'}
      >
        {text === '' ? TEXT.placeholder : text}
      </text>
    </g>
  );
}

const DRAWER = { width: 236, x: CONTENT.right - 236 } as const;

/**
 * The inspector: a panel that slides in from the right edge when one node or
 * edge is selected, titled with its name, holding its attribute form and a
 * delete button.
 */
function Drawer({
  k,
  title,
  children,
}: {
  k: number;
  title: string;
  children?: ReactNode;
}) {
  if (k <= 0) return null;
  const x = lerp(CONTENT.right + 10, DRAWER.x, k);
  return (
    <g transform={`translate(${x - DRAWER.x} 0)`}>
      <rect
        x={DRAWER.x}
        y={CONTENT.y}
        width={DRAWER.width}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-white"
      />
      <text
        x={DRAWER.x + 20}
        y={CONTENT.y + 36}
        fontSize={19}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {title}
      </text>
      <line
        x1={DRAWER.x}
        y1={CONTENT.y + 56}
        x2={CONTENT.right}
        y2={CONTENT.y + 56}
        className="stroke-navy-taupe/10"
        strokeWidth={2}
      />
      {children}
      <line
        x1={DRAWER.x}
        y1={CONTENT.bottom - 60}
        x2={CONTENT.right}
        y2={CONTENT.bottom - 60}
        className="stroke-navy-taupe/10"
        strokeWidth={2}
      />
      <rect
        x={DRAWER.x + 20}
        y={CONTENT.bottom - 46}
        width={96}
        height={32}
        rx={8}
        className="fill-neon-coral"
      />
      <Trash2
        x={DRAWER.x + 30}
        y={CONTENT.bottom - 38}
        width={16}
        height={16}
        strokeWidth={2.4}
        className="text-white"
      />
      <text
        x={DRAWER.x + 52}
        y={CONTENT.bottom - 25}
        fontSize={13}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.remove}
      </text>
    </g>
  );
}

function FieldLabel({ y, text }: { y: number; text: string }) {
  return (
    <text
      x={DRAWER.x + 20}
      y={y}
      fontSize={14}
      fontWeight={800}
      className="fill-navy-taupe"
    >
      {text}
    </text>
  );
}

/** A row of choices in the inspector, `chosen` filled as it is picked. */
function Options({
  y,
  labels,
  chosen,
  k,
}: {
  y: number;
  labels: readonly string[];
  chosen: number;
  k: number;
}) {
  return (
    <>
      {labels.map((label, i) => {
        const x = DRAWER.x + 20 + i * 66;
        const on = i === chosen ? k : 0;
        return (
          <g key={label}>
            <rect
              x={x}
              y={y}
              width={60}
              height={30}
              rx={15}
              className={on > 0.5 ? 'fill-sea-serpent' : 'fill-navy-taupe/10'}
            />
            <text
              x={x + 30}
              y={y + 20}
              textAnchor="middle"
              fontSize={12}
              fontWeight={800}
              className={on > 0.5 ? 'fill-white' : 'fill-navy-taupe'}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

const optionAt = (y: number, i: number): Point => [
  DRAWER.x + 50 + i * 66,
  y + 15,
];

/** A tap that starts an edge pulses until the second tap lands. */
const pulseFor = (t: number, from: number, to: number) =>
  t >= from && t < to ? t - from : undefined;

/**
 * Shows a network composer where the interviewer types four names to add four
 * alters, draws edges between two pairs of alters, and then puts two alters in
 * a group, all on the same canvas.
 */
export const NetworkComposerIntroScene = defineScene(8.0, ({ t }) => {
  const people = [
    { label: SAM, typing: 0.8, to: at(SAM) },
    { label: ANA, typing: 1.5, to: at(ANA) },
    { label: JO, typing: 2.2, to: at(JO) },
    { label: KAI, typing: 2.9, to: at(KAI) },
  ].map((p, i) => {
    const added = p.typing + 0.4;
    const spread = settle(segment(t, added, 1.0));
    const start: Point = [CANVAS.x + (i - 1.5) * 12, CANVAS.y + (i % 2) * 10];
    return {
      ...p,
      added,
      k: backOut(segment(t, added, 0.35)),
      now: [
        lerp(start[0], p.to[0], spread),
        lerp(start[1], p.to[1], spread),
      ] as Point,
    };
  });
  const position = (label: string) =>
    people.find((p) => p.label === label)?.now ?? [CANVAS.x, CANVAS.y];
  const typing = people.find((p) => t >= p.typing && t < p.added);
  const fieldOpen = t >= 0.5 && t < 3.5 ? 1 : 0;
  const tool: Tool =
    t < 0.5 ? 'select' : t < 3.5 ? 'add' : t < 6.2 ? 'edge' : 'groups';
  const family = [
    { label: SAM, at: 6.7 },
    { label: ANA, at: 7.1 },
  ].filter((m) => t >= m.at);
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        {family.length > 0 ? (
          <Hull points={family.map((m) => position(m.label))} color={1} k={1} />
        ) : null}
        <Edge
          from={position(SAM)}
          to={position(ANA)}
          k={smooth(segment(t, 4.5, 0.3))}
        />
        <Edge
          from={position(JO)}
          to={position(KAI)}
          k={smooth(segment(t, 5.5, 0.3))}
        />
        {people.map((p) => (
          <CanvasNode
            key={p.label}
            at={p.now}
            label={p.label}
            k={p.k}
            r={24}
            pulse={
              p.label === SAM
                ? pulseFor(t, 4.0, 4.5)
                : p.label === JO
                  ? pulseFor(t, 5.0, 5.5)
                  : undefined
            }
          />
        ))}
        <Palette
          active={[tool, 'layout']}
          tint={tool === 'edge' ? EDGE_FILLS[0] : GROUP_FILLS[0]}
        />
        <NameField
          k={fieldOpen}
          text={typing ? typed(t, typing.label, typing.typing) : ''}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: toolAt('add'), at: 0.5 },
          { to: toolAt('edge'), at: 3.5 },
          { to: at(SAM), at: 4.0 },
          { to: at(ANA), at: 4.5 },
          { to: at(JO), at: 5.0 },
          { to: at(KAI), at: 5.5 },
          { to: toolAt('groups'), at: 6.2 },
          { to: at(SAM), at: 6.7 },
          { to: at(ANA), at: 7.1 },
        ]}
        leave={7.5}
      />
    ),
  };
});

/** A small table in the exported-data scene. */
function Table({
  x,
  y,
  title,
  columns,
  offsets,
  rows,
  t,
  from,
}: {
  x: number;
  y: number;
  title: string;
  columns: readonly string[];
  offsets: readonly number[];
  rows: readonly (readonly string[])[];
  t: number;
  from: number;
}) {
  const height = 30;
  const width = CONTENT.right - 16 - x;
  return (
    <g>
      <text
        x={x}
        y={y - 10}
        fontSize={12}
        fontWeight={800}
        className="fill-white/60 uppercase"
      >
        {title}
      </text>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        className="fill-cyber-grape"
      />
      {columns.map((c, i) => (
        <text
          key={c}
          x={x + 12 + (offsets[i] ?? 0)}
          y={y + 20}
          fontSize={12}
          fontWeight={800}
          className="fill-white"
        >
          {c}
        </text>
      ))}
      {rows.map((cells, r) => {
        const rowY = y + height * (r + 1);
        const k = smooth(segment(t, from + r * 0.35, 0.3));
        return (
          <g key={cells.join('-')} opacity={k}>
            <rect
              x={x}
              y={rowY}
              width={width}
              height={height}
              className={r % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
            />
            {cells.map((cell, i) => (
              <text
                key={`${columns[i] ?? i}`}
                x={x + 12 + (offsets[i] ?? 0)}
                y={rowY + 20}
                fontSize={12}
                fontWeight={700}
                className="fill-white"
              >
                {cell}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Shows how a network composer's data is exported: each node becomes a row with
 * its name, its position and a true or false column for its group, and each
 * edge becomes a row with the two alters it connects and its type.
 */
export const NetworkComposerDataScene = defineScene(
  5.4,
  ({ t }) => {
    const small = { x: CONTENT.x + 140, y: CONTENT.y + 180, r: 120 };
    const nodes: { label: string; at: Point }[] = [
      { label: SAM, at: [small.x - 55, small.y - 30] },
      { label: ANA, at: [small.x + 20, small.y - 70] },
      { label: JO, at: [small.x + 30, small.y + 55] },
    ];
    const node = (i: number): Point => nodes[i]?.at ?? [small.x, small.y];
    const tableX = CONTENT.x + 290;
    return {
      body: (
        <>
          <Circles n={3} x={small.x} y={small.y} r={small.r} />
          <Hull points={[node(0), node(1)]} color={1} k={1} />
          <Edge from={node(0)} to={node(1)} />
          <Edge from={node(1)} to={node(2)} type={2} />
          {nodes.map((n) => (
            <CanvasNode key={n.label} at={n.at} label={n.label} r={22} />
          ))}
          <Table
            x={tableX}
            y={CONTENT.y + 40}
            title={TEXT.nodes}
            columns={TEXT.nodeColumns}
            offsets={[0, 70, 170, 270]}
            rows={[
              [SAM, '0.31', '0.42', 'true'],
              [ANA, '0.42', '0.27', 'true'],
              [JO, '0.44', '0.61', 'false'],
            ]}
            t={t}
            from={0.6}
          />
          <Table
            x={tableX}
            y={CONTENT.y + 220}
            title={TEXT.edges}
            columns={TEXT.edgeColumns}
            offsets={[0, 110, 220]}
            rows={[
              [SAM, ANA, 'friends'],
              [ANA, JO, 'family'],
            ]}
            t={t}
            from={2.0}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/**
 * Shows the network composer's tool palette with a numbered pin beside each
 * tool, matching the numbered list, and highlights each tool in turn.
 */
export const NetworkComposerToolsScene = defineScene(9.6, ({ t }) => {
  const dx = STAGE_CENTER_X - 120 - (PALETTE.x + PALETTE.width / 2);
  const pinX = PALETTE_RIGHT + dx + 110;
  const lit = t >= 2.2 ? Math.floor((t - 2.2) / 1.0) : -1;
  const litTool = TOOLS[lit];
  return {
    body: (
      <>
        <g transform={`translate(${dx} 0)`}>
          <Palette
            active={litTool === undefined ? ['select'] : [litTool.key]}
          />
        </g>
        {TOOLS.map(({ key }, i) => {
          const [, y] = toolAt(key);
          return (
            <CalloutPin
              key={key}
              n={i + 1}
              at={[pinX, y]}
              to={[PALETTE_RIGHT + dx + 2, y]}
              k={smooth(segment(t, 0.3 + i * 0.2, 0.35))}
              lit={i === lit ? smooth(segment(t, 2.2 + i * 1.0, 0.2)) : 0}
              label={TEXT.tools[i] ?? ''}
            />
          );
        })}
      </>
    ),
  };
});

/**
 * Shows a network composer where the interviewer opens the name box with the
 * add node tool and types three names, and each name is saved to the quick add
 * attribute and becomes a node on the next free spot of the grid while the name
 * box stays open.
 */
export const NetworkComposerAddScene = defineScene(5.6, ({ t }) => {
  const names = [
    { label: SAM, typing: 0.9 },
    { label: ANA, typing: 1.9 },
    { label: JO, typing: 2.9 },
  ].map((n) => ({ ...n, added: n.typing + 0.5 }));
  const typing = names.find((n) => t >= n.typing && t < n.added);
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        {Array.from({ length: 6 }, (_, i) => {
          const [x, y] = gridCell(i);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={20}
              className="fill-none stroke-white/30"
              strokeWidth={2}
              strokeDasharray="4 5"
            />
          );
        })}
        {names.map((n, i) => (
          <CanvasNode
            key={n.label}
            at={gridCell(i)}
            label={n.label}
            r={22}
            k={backOut(segment(t, n.added, 0.35))}
          />
        ))}
        <Palette active={[t >= 0.5 ? 'add' : 'select']} />
        <NameField
          k={t >= 0.5 ? 1 : 0}
          text={typing ? typed(t, typing.label, typing.typing) : ''}
        />
        <Chip
          x={PALETTE_RIGHT + 137}
          y={toolAt('add')[1] + 46}
          text={TEXT.quickAdd}
          size={13}
          k={backOut(segment(t, 1.5, 0.35))}
        />
      </>
    ),
    overlay: (
      <Click t={t} stops={[{ to: toolAt('add'), at: 0.5 }]} leave={1.0} />
    ),
  };
});

/**
 * Shows a network composer where the interviewer drags two nodes to new places,
 * and the layout attribute shows each node's new position as x and y
 * coordinates.
 */
export const NetworkComposerPositionsScene = defineScene(5.2, ({ t }) => {
  const sam = smooth(segment(t, 0.8, 1.0));
  const ana = smooth(segment(t, 2.6, 1.0));
  const samAt: Point = [
    lerp(gridCell(0)[0], at(SAM)[0], sam),
    lerp(gridCell(0)[1], at(SAM)[1], sam),
  ];
  const anaAt: Point = [
    lerp(gridCell(1)[0], at(ANA)[0] + 60, ana),
    lerp(gridCell(1)[1], at(ANA)[1] + 20, ana),
  ];
  const moving = t < 2.4 ? samAt : anaAt;
  const [x, y] = normalised(moving);
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        <CanvasNode at={samAt} label={SAM} r={22} ring={t < 2.4 ? 1 : 0} />
        <CanvasNode at={anaAt} label={ANA} r={22} ring={t >= 2.4 ? 1 : 0} />
        <CanvasNode at={gridCell(2)} label={JO} r={22} />
        <Palette active={['select']} />
        <Chip
          x={STAGE.right - 130}
          y={STAGE.y + 34}
          text={TEXT.layout}
          size={13}
          k={backOut(segment(t, 0.4, 0.35))}
        />
        <Chip
          x={STAGE.right - 130}
          y={STAGE.y + 76}
          text={`x ${x}  ·  y ${y}`}
          size={15}
          fill="fill-white/20"
          ink="fill-white"
          k={backOut(segment(t, 0.6, 0.35))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: gridCell(0), at: 0.7, ring: false },
          { to: at(SAM), at: 1.8, glide: 1.0, ring: false },
          { to: gridCell(1), at: 2.5, ring: false },
          {
            to: [at(ANA)[0] + 60, at(ANA)[1] + 20],
            at: 3.6,
            glide: 1.0,
            ring: false,
          },
        ]}
        leave={4.0}
      />
    ),
  };
});

/**
 * Shows a network composer where switching on automatic layout spreads the
 * nodes out from a grid while keeping grouped nodes together, and switching it
 * off leaves the nodes where they are.
 */
export const NetworkComposerAutoLayoutScene = defineScene(6.0, ({ t }) => {
  const running = t >= 0.6 && t < 4.0;
  const k = settle(Math.min(Math.max(t - 0.7, 0), 3.3) / 2.0);
  const place = (label: string, i: number): Point => [
    lerp(gridCell(i)[0], at(label)[0], k),
    lerp(gridCell(i)[1], at(label)[1], k),
  ];
  const positions = PEOPLE.map((p, i) => ({
    label: p.label,
    at: place(p.label, i),
  }));
  const pos = (label: string) =>
    positions.find((p) => p.label === label)?.at ?? [CANVAS.x, CANVAS.y];
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        <Hull points={[pos(SAM), pos(ANA), pos(JO)]} color={1} k={1} />
        <Edge from={pos(SAM)} to={pos(ANA)} />
        <Edge from={pos(JO)} to={pos(KAI)} />
        <Edge from={pos(KAI)} to={pos(LIN)} type={2} />
        {positions.map((p) => (
          <CanvasNode key={p.label} at={p.at} label={p.label} r={22} />
        ))}
        <Palette active={running ? ['select', 'layout'] : ['select']} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: toolAt('layout'), at: 0.6 },
          { to: toolAt('layout'), at: 4.0, glide: 0.4 },
        ]}
        leave={4.6}
      />
    ),
  };
});

/**
 * Shows a network composer where the interviewer picks the Family group and
 * taps three nodes, then picks the Work group and taps three more, and a shaded
 * outline grows around each group, with one node in both groups.
 */
export const NetworkComposerGroupsScene = defineScene(6.4, ({ t }) => {
  const family = [
    { label: SAM, at: 1.5 },
    { label: ANA, at: 1.9 },
    { label: JO, at: 2.3 },
  ].filter((m) => t >= m.at);
  const work = [
    { label: JO, at: 4.0 },
    { label: KAI, at: 4.4 },
    { label: LIN, at: 4.8 },
  ].filter((m) => t >= m.at);
  const menu = t >= 0.5 && t < 1.0 ? 1 : t >= 3.0 && t < 3.5 ? 1 : 0;
  const group = t < 3.5 ? 0 : 1;
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        {family.length > 0 ? (
          <Hull points={family.map((m) => at(m.label))} color={1} k={1} />
        ) : null}
        {work.length > 0 ? (
          <Hull points={work.map((m) => at(m.label))} color={2} k={1} />
        ) : null}
        {PEOPLE.map((p) => (
          <CanvasNode key={p.label} at={p.at} label={p.label} r={24} />
        ))}
        <Palette
          active={[t >= 1.0 ? 'groups' : 'select']}
          tint={GROUP_FILLS[group]}
        />
        <ToolMenu tool="groups" items={groupMenu()} k={menu} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: toolAt('groups'), at: 0.5 },
          { to: menuItemAt('groups', 0), at: 1.0, glide: 0.4 },
          { to: at(SAM), at: 1.5, glide: 0.4 },
          { to: at(ANA), at: 1.9, glide: 0.35 },
          { to: at(JO), at: 2.3, glide: 0.35 },
          { to: toolAt('groups'), at: 3.0 },
          { to: menuItemAt('groups', 1), at: 3.5, glide: 0.4 },
          { to: at(JO), at: 4.0, glide: 0.4 },
          { to: at(KAI), at: 4.4, glide: 0.35 },
          { to: at(LIN), at: 4.8, glide: 0.35 },
        ]}
        leave={5.3}
      />
    ),
  };
});

/** The loop drawn around Sam, Ana and Jo, as evenly spaced points. */
const LASSO: readonly Point[] = Array.from({ length: 25 }, (_, i) => {
  const angle = Math.PI * 0.85 + (i / 24) * Math.PI * 2;
  return [
    CANVAS.x - 55 + Math.cos(angle) * 112,
    CANVAS.y - 38 + Math.sin(angle) * 122,
  ] as const;
});
const LASSO_START = 0.7;
const LASSO_LENGTH = 1.5;

const BAR = { width: 320, height: 56, y: STAGE.bottom - 72 } as const;
const BAR_X = (STAGE.x + STAGE.right) / 2 - BAR.width / 2;
const barButtonAt = (i: number): Point => [
  BAR_X + 12 + i * 152 + 70,
  BAR.y + BAR.height / 2,
];

/**
 * Shows a network composer where the interviewer draws a lasso around three
 * nodes to select them, a row of group buttons rises from the bottom of the
 * canvas, and one tap adds all three nodes to the Family group.
 */
export const NetworkComposerLassoScene = defineScene(5.8, ({ t }) => {
  const drawn = segment(t, LASSO_START, LASSO_LENGTH);
  const fade = 1 - smooth(segment(t, 2.4, 0.4));
  const selected = t >= 2.3;
  const rise = backOut(segment(t, 2.4, 0.5));
  const joined = t >= 3.4;
  const lassoed = [SAM, ANA, JO];
  const d = `M ${LASSO.map((p) => `${p[0]} ${p[1]}`).join(' L ')}`;
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        {joined ? (
          <Hull points={lassoed.map((label) => at(label))} color={1} k={1} />
        ) : null}
        {PEOPLE.map((p) => (
          <CanvasNode
            key={p.label}
            at={p.at}
            label={p.label}
            r={24}
            ring={selected && lassoed.includes(p.label) ? 1 : 0}
          />
        ))}
        <path
          d={d}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawn}
          className="fill-none stroke-white"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={drawn > 0 ? fade : 0}
        />
        <Palette active={['select']} />
        {rise > 0 ? (
          <g transform={`translate(0 ${(1 - rise) * 90})`}>
            <rect
              x={BAR_X}
              y={BAR.y}
              width={BAR.width}
              height={BAR.height}
              rx={14}
              className="fill-white"
            />
            {TEXT.groups.map((label, i) => {
              const [x, y] = barButtonAt(i);
              const pressed = i === 0 && joined;
              return (
                <g key={label}>
                  <rect
                    x={x - 70}
                    y={y - 18}
                    width={140}
                    height={36}
                    rx={6}
                    className={cx(GROUP_FILLS[i], pressed && 'stroke-white')}
                    strokeWidth={pressed ? 4 : 0}
                  />
                  <text
                    x={x}
                    y={y + 5}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={pressed ? 900 : 700}
                    className="fill-white"
                  >
                    {label}
                  </text>
                </g>
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
          ...LASSO.map((to, i): Stop => ({
            to,
            at: LASSO_START + (i / (LASSO.length - 1)) * LASSO_LENGTH,
            glide: i === 0 ? 0.6 : LASSO_LENGTH / (LASSO.length - 1),
            ring: false,
          })),
          { to: barButtonAt(0), at: 3.4 },
        ]}
        leave={3.9}
      />
    ),
  };
});

/**
 * Shows a network composer where selecting a node opens a panel titled with its
 * name, and the interviewer answers the panel's fields, which are saved as they
 * are given.
 */
export const NetworkComposerInspectorScene = defineScene(5.4, ({ t }) => {
  const open = smooth(segment(t, 0.8, 0.4));
  const closeY = CONTENT.y + 96;
  const nicknameY = CONTENT.y + 168;
  const close = t >= 1.9 ? 1 : 0;
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} x={CANVAS.x + SHIFT} />
        <Edge from={at(SAM, SHIFT)} to={at(ANA, SHIFT)} />
        <Edge from={at(JO, SHIFT)} to={at(KAI, SHIFT)} />
        {PEOPLE.slice(0, 4).map((p) => (
          <CanvasNode
            key={p.label}
            at={at(p.label, SHIFT)}
            label={p.label}
            r={24}
            ring={p.label === SAM && t >= 0.7 ? 1 : 0}
          />
        ))}
        <Palette active={['select']} />
        <Drawer k={open} title={SAM}>
          <FieldLabel y={closeY - 10} text={TEXT.closeness} />
          <Options y={closeY} labels={['1', '2', '3']} chosen={2} k={close} />
          <FieldLabel y={nicknameY - 10} text={TEXT.nickname} />
          <rect
            x={DRAWER.x + 20}
            y={nicknameY}
            width={DRAWER.width - 40}
            height={34}
            rx={8}
            className="stroke-navy-taupe/30 fill-none"
            strokeWidth={2}
          />
          <text
            x={DRAWER.x + 32}
            y={nicknameY + 22}
            fontSize={14}
            fontWeight={700}
            className="fill-navy-taupe"
          >
            {typed(t, TEXT.nicknameValue, 2.7)}
          </text>
        </Drawer>
        <Chip
          x={DRAWER.x + DRAWER.width / 2}
          y={CONTENT.y + 250}
          text={TEXT.savedAsYouGo}
          size={13}
          fill="fill-sea-green"
          ink="fill-white"
          k={backOut(segment(t, 3.6, 0.35))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: at(SAM, SHIFT), at: 0.7 },
          { to: optionAt(closeY, 2), at: 1.9 },
          { to: [DRAWER.x + 60, nicknameY + 17], at: 2.6, glide: 0.5 },
        ]}
        leave={3.3}
      />
    ),
  };
});

/**
 * Shows a network composer where selecting an edge opens a panel titled with
 * its connection type's label, and the interviewer answers the question in it.
 */
export const NetworkComposerEdgeInspectorScene = defineScene(4.6, ({ t }) => {
  const open = smooth(segment(t, 0.8, 0.4));
  const selected = t >= 0.7;
  const from = at(SAM, SHIFT);
  const to = at(ANA, SHIFT);
  const talkY = CONTENT.y + 96;
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} x={CANVAS.x + SHIFT} />
        {selected ? (
          <line
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            className="stroke-white"
            strokeWidth={14}
            strokeLinecap="round"
          />
        ) : null}
        <Edge from={from} to={to} />
        <Edge from={at(JO, SHIFT)} to={at(KAI, SHIFT)} type={2} />
        {PEOPLE.slice(0, 4).map((p) => (
          <CanvasNode
            key={p.label}
            at={at(p.label, SHIFT)}
            label={p.label}
            r={24}
          />
        ))}
        <Palette active={['select']} />
        <Drawer k={open} title={TEXT.edgeTypes[0]}>
          <FieldLabel y={talkY - 10} text={TEXT.talk} />
          <Options
            y={talkY}
            labels={TEXT.talkOptions}
            chosen={1}
            k={t >= 1.9 ? 1 : 0}
          />
        </Drawer>
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: midpoint(from, to), at: 0.7 },
          { to: optionAt(talkY, 1), at: 1.9 },
        ]}
        leave={2.5}
      />
    ),
  };
});

/**
 * Shows a network composer where the interviewer picks Friends from the draw
 * edge menu, taps pairs of nodes to connect them, taps one pair again to remove
 * its edge, and then picks Family to draw an edge of another type.
 */
export const NetworkComposerEdgesScene = defineScene(7.2, ({ t }) => {
  const menu = (t >= 0.5 && t < 1.0) || (t >= 4.8 && t < 5.3) ? 1 : 0;
  const type = t < 5.3 ? 0 : 1;
  const removed = smooth(segment(t, 4.2, 0.3));
  return {
    rail: { progress: 0.6 },
    body: (
      <>
        <Circles n={4} />
        <Edge from={at(SAM)} to={at(ANA)} k={smooth(segment(t, 2.0, 0.3))} />
        <Edge
          from={at(ANA)}
          to={at(JO)}
          k={smooth(segment(t, 3.1, 0.3)) * (1 - removed)}
        />
        <Edge
          from={at(JO)}
          to={at(KAI)}
          type={2}
          k={smooth(segment(t, 6.3, 0.3))}
        />
        {PEOPLE.map((p) => (
          <CanvasNode
            key={p.label}
            at={p.at}
            label={p.label}
            r={24}
            pulse={
              p.label === SAM
                ? pulseFor(t, 1.5, 2.0)
                : p.label === ANA
                  ? (pulseFor(t, 2.6, 3.1) ?? pulseFor(t, 3.7, 4.2))
                  : p.label === JO
                    ? pulseFor(t, 5.8, 6.3)
                    : undefined
            }
          />
        ))}
        <Palette
          active={[t >= 1.0 ? 'edge' : 'select']}
          tint={EDGE_FILLS[type]}
        />
        <ToolMenu tool="edge" items={edgeMenu()} k={menu} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: toolAt('edge'), at: 0.5 },
          { to: menuItemAt('edge', 0), at: 1.0, glide: 0.4 },
          { to: at(SAM), at: 1.5, glide: 0.4 },
          { to: at(ANA), at: 2.0, glide: 0.4 },
          { to: at(ANA), at: 2.6, glide: 0.2 },
          { to: at(JO), at: 3.1, glide: 0.4 },
          { to: at(ANA), at: 3.7, glide: 0.4 },
          { to: at(JO), at: 4.2, glide: 0.4 },
          { to: toolAt('edge'), at: 4.8 },
          { to: menuItemAt('edge', 1), at: 5.3, glide: 0.4 },
          { to: at(JO), at: 5.8, glide: 0.4 },
          { to: at(KAI), at: 6.3, glide: 0.4 },
        ]}
        leave={6.7}
      />
    ),
  };
});
