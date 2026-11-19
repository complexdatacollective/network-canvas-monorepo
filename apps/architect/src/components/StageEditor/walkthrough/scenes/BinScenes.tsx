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
  Prompt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type DrawerStyle,
  type Point,
  type Stop,
} from './parts';

const TEXT = {
  ordinalPrompt: 'How close do you feel to each of these people?',
  categoricalPrompt: 'Which best describes how you know each person?',
  closeness: ['Not close', 'Somewhat', 'Close', 'Very close', 'Extremely'],
  categories: ['Family', 'Work', 'School', 'Neighbours', 'Social'],
  // A categorical attribute exports one true-or-false column per value.
  network: 'In the interview',
  thisStage: 'On this stage',
  filter: 'Filter network: close_friend is true',
  tagged: 'close_friend',
  summary: (name: string, more: number) =>
    more > 0 ? `${name} +${more}` : name,
} as const;

const NODE_R = 24;

/* The drawer at the foot of a bin stage, where unplaced alters wait. */
const DRAWER: DrawerStyle = {
  width: 280,
  gap: 52,
  handle: 22,
  handleWidth: 80,
  overhang: 12,
  rx: 14,
  drop: 2,
};

/** A node as a bin stage draws it, with the white ring of a selected one. */
function BinNode({
  at,
  label,
  selected = false,
  k = 1,
  r = NODE_R,
}: {
  at: Point;
  label: string;
  selected?: boolean;
  k?: number;
  r?: number;
}) {
  return (
    <>
      {selected ? (
        <circle
          cx={at[0]}
          cy={at[1]}
          r={r + 6}
          className="fill-none stroke-white"
          strokeWidth={4}
        />
      ) : null}
      <PersonNode x={at[0]} y={at[1]} r={r} label={label} k={k} />
    </>
  );
}

type Move = Readonly<{ label: string; to: Point; at: number; bin?: number }>;

/** Where an alter moving from `from` at `at` is, and whether it has landed. */
function moved(t: number, { to, at }: Move, from: Point, length = 0.7) {
  const k = smooth(segment(t, at, length));
  return {
    pos: [lerp(from[0], to[0], k), lerp(from[1], to[1], k)] as Point,
    moving: k > 0 && k < 1,
    done: k >= 1,
  };
}

/** The cursor stops for dragging each move's alter from its drawer slot. */
const dragStops = (moves: readonly Move[], from: (i: number) => Point) =>
  moves.flatMap((m, i): Stop[] => [
    { to: from(i), at: m.at - 0.05, ring: false },
    { to: m.to, at: m.at + 0.7, glide: 0.7, ring: false },
  ]);

/* ---------------------------------------------------------------- ordinal */

const ORD = {
  left: STAGE.x + 14,
  right: STAGE.right - 14,
  top: STAGE.y + 50,
  bottom: STAGE.bottom - 96,
  gap: 6,
  header: 30,
} as const;

const ordWidth = (count: number) =>
  (ORD.right - ORD.left - ORD.gap * (count - 1)) / count;
const ordX = (i: number, count: number) =>
  ORD.left + i * (ordWidth(count) + ORD.gap);
/** Where the `slot`th alter in bin `i` sits. */
const ordSlot = (i: number, slot: number, count = 5): Point => [
  ordX(i, count) + ordWidth(count) / 2,
  ORD.top + ORD.header + 30 + slot * 46,
];

const ORD_FILLS = [
  'fill-ord-1',
  'fill-ord-2',
  'fill-ord-3',
  'fill-ord-4',
  'fill-ord-5',
  'fill-ord-6',
  'fill-ord-7',
  'fill-ord-8',
] as const;

/**
 * The row of ordinal bins: each header takes the prompt's colour, blended a
 * step further towards the dark background for each bin along the scale.
 */
function OrdinalBins({
  id,
  labels,
  color = 0,
  next,
  blend = 0,
  pressed,
}: {
  id: string;
  labels: readonly string[];
  color?: number;
  /** A second colour being crossfaded to, and how far. */
  next?: number;
  blend?: number;
  /** A bin whose header is being tapped. */
  pressed?: number;
}) {
  const count = labels.length;
  const clip = `${id}-ordinal`;
  return (
    <g>
      <clipPath id={clip}>
        <rect
          x={ORD.left}
          y={ORD.top}
          width={ORD.right - ORD.left}
          height={ORD.bottom - ORD.top}
          rx={18}
        />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {labels.map((label, i) => {
          const x = ordX(i, count);
          const w = ordWidth(count);
          // The interview mixes each bin with the background by i / count.
          const darken = i / count;
          return (
            <g key={label}>
              <rect
                x={x}
                y={ORD.top}
                width={w}
                height={ORD.bottom - ORD.top}
                className="fill-cyber-grape"
                opacity={0.75 * (1 - i / count)}
              />
              <rect
                x={x}
                y={ORD.top}
                width={w}
                height={ORD.header}
                className={ORD_FILLS[color % ORD_FILLS.length]}
              />
              {next !== undefined ? (
                <rect
                  x={x}
                  y={ORD.top}
                  width={w}
                  height={ORD.header}
                  className={ORD_FILLS[next % ORD_FILLS.length]}
                  opacity={blend}
                />
              ) : null}
              <rect
                x={x}
                y={ORD.top}
                width={w}
                height={ORD.header}
                className="fill-navy-taupe"
                opacity={darken}
              />
              {pressed === i ? (
                <rect
                  x={x}
                  y={ORD.top}
                  width={w}
                  height={ORD.bottom - ORD.top}
                  className="fill-white"
                  opacity={0.12}
                />
              ) : null}
              <text
                x={x + w / 2}
                y={ORD.top + 20}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                className="fill-white"
              >
                {label}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}

/**
 * Shows an ordinal bin where the participant drags three alters from the drawer
 * into bins along a scale from Not close to Extremely.
 */
export const OrdinalBinIntroScene = defineScene(5.6, ({ t, id }) => {
  const moves: Move[] = [
    { label: NAMES.sam, to: ordSlot(2, 0), at: 0.7 },
    { label: NAMES.ana, to: ordSlot(3, 0), at: 1.9 },
    { label: NAMES.jo, to: ordSlot(0, 0), at: 3.1 },
  ];
  const from = (i: number) => drawerSlot(i, moves.length, DRAWER);
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Prompt text={TEXT.ordinalPrompt} y={STAGE.y + 32} size={19} />
        <OrdinalBins id={id} labels={TEXT.closeness} />
        <Drawer style={DRAWER} />
        {moves.map((m, i) => {
          const { pos } = moved(t, m, from(i));
          return <BinNode key={m.label} at={pos} label={m.label} />;
        })}
      </>
    ),
    overlay: <Click t={t} stops={dragStops(moves, from)} leave={4.2} />,
  };
});

const CAT_R = 46;
const CAT_STROKES = [
  'stroke-cat-1',
  'stroke-cat-2',
  'stroke-cat-3',
  'stroke-cat-4',
  'stroke-cat-5',
  'stroke-cat-6',
] as const;
const CAT_FILLS = [
  'fill-cat-1',
  'fill-cat-2',
  'fill-cat-3',
  'fill-cat-4',
  'fill-cat-5',
  'fill-cat-6',
] as const;

/** Circles in two rows, three over the rest, as the interview lays them out. */
function catCentre(i: number, count = 5): Point {
  const top = STAGE.y + 50 + CAT_R + 4;
  const bottomRow = top + CAT_R * 2 + 16;
  const perTop = Math.min(3, count);
  const inTop = i < perTop;
  const n = inTop ? perTop : count - perTop;
  const j = inTop ? i : i - perTop;
  const gap = 150;
  return [STAGE_CENTER_X + (j - (n - 1) / 2) * gap, inTop ? top : bottomRow];
}

function CategoryCircles({
  labels,
  members,
  highlight,
  expanded,
}: {
  labels: readonly string[];
  members: readonly (readonly string[])[];
  /** A circle being dragged over or tapped. */
  highlight?: number;
  /** A circle opened to show its alters, and how far open. */
  expanded?: { index: number; k: number };
}) {
  return (
    <g>
      {labels.map((label, i) => {
        const [x, y] = catCentre(i, labels.length);
        const names = members[i] ?? [];
        const first = names[0];
        const open = expanded?.index === i ? expanded.k : 0;
        const r =
          CAT_R *
          (1 - open * 0.25) *
          (expanded && expanded.index !== i ? 1 - expanded.k * 0.15 : 1);
        return (
          <g key={label}>
            <circle
              cx={x}
              cy={y}
              r={r}
              className={`${CAT_FILLS[i % CAT_FILLS.length]} ${CAT_STROKES[i % CAT_STROKES.length]}`}
              fillOpacity={highlight === i ? 0.4 : 0.1}
              strokeWidth={4}
            />
            <text
              x={x}
              y={y + (first ? -2 : 5)}
              textAnchor="middle"
              fontSize={15}
              fontWeight={800}
              className="fill-white"
            >
              {label}
            </text>
            {first ? (
              <text
                x={x}
                y={y + 15}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                className="fill-white/80"
              >
                {TEXT.summary(first, names.length - 1)}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** The panel a tapped circle opens into, listing its alters. */
function ExpandedCategory({
  index,
  label,
  names,
  k,
}: {
  index: number;
  label: string;
  names: readonly string[];
  k: number;
}) {
  if (k <= 0) return null;
  const width = 300;
  const height = 150;
  const x = STAGE_CENTER_X - width / 2;
  const y = STAGE.y + 70;
  return (
    <g
      opacity={Math.min(1, k * 1.5)}
      transform={`translate(0 ${(1 - k) * 20})`}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={14}
        className={`fill-navy-taupe ${CAT_STROKES[index % CAT_STROKES.length]}`}
        strokeWidth={4}
      />
      <rect
        x={x + 2}
        y={y + 2}
        width={width - 4}
        height={40}
        rx={12}
        className={CAT_FILLS[index % CAT_FILLS.length]}
        opacity={0.15}
      />
      <text
        x={x + 18}
        y={y + 28}
        fontSize={17}
        fontWeight={800}
        className="fill-white"
      >
        {label}
      </text>
      <text
        x={x + width - 18}
        y={y + 28}
        textAnchor="end"
        fontSize={14}
        className="fill-white/60"
      >
        {names.length}
      </text>
      {names.map((name, i) => (
        <BinNode key={name} at={[x + 50 + i * 60, y + 96]} label={name} />
      ))}
    </g>
  );
}

/**
 * Shows a categorical bin where the participant drags three alters from the
 * drawer into colored circles, then taps the Work circle to open it and see the
 * alters inside.
 */
export const CategoricalBinIntroScene = defineScene(6.0, ({ t }) => {
  const moves: Move[] = [
    { label: NAMES.sam, to: catCentre(0), at: 0.7, bin: 0 },
    { label: NAMES.ana, to: catCentre(1), at: 1.9, bin: 1 },
    { label: NAMES.jo, to: catCentre(1), at: 3.1, bin: 1 },
  ];
  const from = (i: number) => drawerSlot(i, moves.length, DRAWER);
  const placed = moves.map((m, i) => moved(t, m, from(i)));
  const members = TEXT.categories.map((_, ci) =>
    moves
      .filter((m, mi) => placed[mi]?.done && m.bin === ci)
      .map((m) => m.label),
  );
  const open = smooth(segment(t, 4.6, 0.4));
  const hover = placed.findIndex((p) => p.moving);
  const hoverBin = hover === -1 ? undefined : moves[hover]?.bin;
  return {
    rail: { progress: 0.5 },
    body: (
      <>
        <Prompt text={TEXT.categoricalPrompt} y={STAGE.y + 32} size={19} />
        <g opacity={1 - open * 0.6}>
          <CategoryCircles
            labels={TEXT.categories}
            members={members}
            highlight={hoverBin}
          />
        </g>
        <ExpandedCategory
          index={1}
          label={TEXT.categories[1]}
          names={members[1] ?? []}
          k={open}
        />
        <Drawer style={DRAWER} />
        {moves.map((m, i) => {
          const p = placed[i];
          if (p === undefined || p.done) return null;
          return <BinNode key={m.label} at={p.pos} label={m.label} />;
        })}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[...dragStops(moves, from), { to: catCentre(1), at: 4.5 }]}
        leave={5.2}
      />
    ),
  };
});

/**
 * Shows a stage filter of close_friend is true, where only the alters with that
 * attribute move from the interview onto this stage and the others are left
 * behind.
 */
export const StageFilterScene = defineScene(
  5.0,
  ({ t }) => {
    const people = [
      { name: NAMES.sam, tagged: true },
      { name: NAMES.ana, tagged: false },
      { name: NAMES.jo, tagged: true },
      { name: NAMES.kai, tagged: false },
      { name: NAMES.lee, tagged: true },
    ];
    const box = { y: CONTENT.y + 70, height: 230, width: 270 };
    const leftX = CONTENT.x + 40;
    const rightX = CONTENT.right - 40 - box.width;
    const go = smooth(segment(t, 2.0, 0.9));
    const fade = smooth(segment(t, 1.6, 0.4));
    const at = (x: number, i: number): Point => [
      x + 60 + (i % 3) * 75,
      box.y + 80 + Math.floor(i / 3) * 90,
    ];
    let shown = 0;
    const headings: ReactNode = (
      <>
        {[
          { x: leftX, text: TEXT.network },
          { x: rightX, text: TEXT.thisStage },
        ].map(({ x, text }) => (
          <text
            key={text}
            x={x + box.width / 2}
            y={box.y - 14}
            textAnchor="middle"
            fontSize={14}
            fontWeight={800}
            className="fill-white/60 uppercase"
          >
            {text}
          </text>
        ))}
      </>
    );
    return {
      body: (
        <>
          {headings}
          {[leftX, rightX].map((x) => (
            <rect
              key={x}
              x={x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={16}
              className="fill-white/5 stroke-white/20"
              strokeWidth={2}
            />
          ))}
          <Chip
            x={STAGE_CENTER_X - 33}
            y={CONTENT.bottom - 40}
            text={TEXT.filter}
            size={14}
            k={backOut(segment(t, 0.8, 0.4))}
          />
          {people.map((p, i) => {
            const a = at(leftX, i);
            const target = p.tagged ? at(rightX, shown++) : a;
            const pos: Point = p.tagged
              ? [
                  lerp(a[0], target[0], go),
                  lerp(a[1], target[1], go) - Math.sin(Math.PI * go) * 30,
                ]
              : a;
            return (
              <g key={p.name} opacity={p.tagged ? 1 : 1 - fade * 0.65}>
                <BinNode at={pos} label={p.name} />
                {p.tagged ? (
                  <Chip
                    x={pos[0]}
                    y={pos[1] + 34}
                    text={TEXT.tagged}
                    size={10}
                    k={backOut(segment(t, 0.4, 0.4))}
                  />
                ) : null}
              </g>
            );
          })}
        </>
      ),
    };
  },
  { url: 'Filter network' },
);
