import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  PersonNode,
  Prompt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBox,
  Toast,
  type Point,
  type Stop,
} from './parts';

const TEXT = {
  ordinalPrompt: 'How close do you feel to each of these people?',
  categoricalPrompt: 'Which best describes how you know each person?',
  closeness: ['Not close', 'Somewhat', 'Close', 'Very close', 'Extremely'],
  categories: ['Family', 'Work', 'School', 'Neighbours', 'Social'],
  other: 'Other',
  otherQuestion: 'How do you know this person?',
  otherAnswer: 'Football club',
  save: 'Save',
  unplaced: ['You must place every', 'item before you can', 'continue.'],
  exported: 'Exported data',
  nameColumn: 'name',
  closenessColumn: 'closeness',
  relationshipColumn: 'relationship',
  gradient: (n: number) => `Color: gradient ${n}`,
  bucketOrder: 'Bucket order: name, A to Z',
  network: 'In the interview',
  thisStage: 'On this stage',
  filter: 'Stage filter: close_friend is true',
  tagged: 'close_friend',
  summary: (name: string, more: number) =>
    more > 0 ? `${name} +${more}` : name,
} as const;

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';
const KAI = 'Kai';
const LEE = 'Lee';

const NODE_R = 24;

/* The drawer at the foot of a bin stage, where unplaced alters wait. */
const DRAWER = { width: 280, height: 60, bottom: STAGE.bottom } as const;

const drawerSlot = (i: number, count: number): Point => [
  STAGE_CENTER_X + (i - (count - 1) / 2) * 52,
  DRAWER.bottom - DRAWER.height / 2 + 2,
];

function Drawer({ width = DRAWER.width }: { width?: number }) {
  const y = DRAWER.bottom - DRAWER.height;
  return (
    <g>
      <rect
        x={STAGE_CENTER_X - 40}
        y={y - 24}
        width={80}
        height={32}
        rx={12}
        className="fill-cyber-grape"
      />
      <ChevronDown
        x={STAGE_CENTER_X - 11}
        y={y - 22}
        width={22}
        height={22}
        strokeWidth={3}
        className="text-white"
      />
      <rect
        x={STAGE_CENTER_X - width / 2}
        y={y}
        width={width}
        height={DRAWER.height + 12}
        rx={14}
        className="fill-cyber-grape"
      />
    </g>
  );
}

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
          const darken = (i / count) * 0.8;
          return (
            <g key={label}>
              <rect
                x={x}
                y={ORD.top}
                width={w}
                height={ORD.bottom - ORD.top}
                className="fill-cyber-grape"
                opacity={0.75 - i * 0.05}
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

/** An ordinal bin stage: alters dragged from the drawer into bins on a scale. */
export const OrdinalBinIntroScene = defineScene(5.6, ({ t, id }) => {
  const moves: Move[] = [
    { label: SAM, to: ordSlot(2, 0), at: 0.7 },
    { label: ANA, to: ordSlot(3, 0), at: 1.9 },
    { label: JO, to: ordSlot(0, 0), at: 3.1 },
  ];
  const from = (i: number) => drawerSlot(i, moves.length);
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Prompt text={TEXT.ordinalPrompt} y={STAGE.y + 32} size={19} />
        <OrdinalBins id={id} labels={TEXT.closeness} />
        <Drawer />
        {moves.map((m, i) => {
          const { pos } = moved(t, m, from(i));
          return <BinNode key={m.label} at={pos} label={m.label} />;
        })}
      </>
    ),
    overlay: <Click t={t} stops={dragStops(moves, from)} leave={4.2} />,
  };
});

const ordHeader = (i: number): Point => [
  ordX(i, 5) + ordWidth(5) / 2,
  ORD.top + ORD.header / 2,
];

/** Tap to place: the selected alter goes to the bin tapped, the next is selected. */
export const OrdinalBinTapScene = defineScene(5.2, ({ t, id }) => {
  const order = [SAM, ANA, JO];
  const moves: Move[] = [
    { label: SAM, to: ordSlot(3, 0), at: 1.0 },
    { label: ANA, to: ordSlot(1, 0), at: 2.4 },
    { label: JO, to: ordSlot(3, 1), at: 3.8 },
  ];
  const from = (i: number) => drawerSlot(i, order.length);
  const selectedIndex = moves.findIndex((m) => t < m.at);
  const pressedBin =
    t >= 0.8 && t < 1.1
      ? 3
      : t >= 2.2 && t < 2.5
        ? 1
        : t >= 3.6 && t < 3.9
          ? 3
          : undefined;
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Prompt text={TEXT.ordinalPrompt} y={STAGE.y + 32} size={19} />
        <OrdinalBins id={id} labels={TEXT.closeness} pressed={pressedBin} />
        <Drawer />
        {moves.map((m, i) => {
          const { pos } = moved(t, m, from(i), 0.5);
          return (
            <BinNode
              key={m.label}
              at={pos}
              label={m.label}
              selected={i === selectedIndex}
            />
          );
        })}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: ordHeader(3), at: 0.9 },
          { to: ordHeader(1), at: 2.3 },
          { to: ordHeader(3), at: 3.7 },
        ]}
        leave={4.3}
      />
    ),
  };
});

/** Require every node to be placed: Next refuses while one waits in the drawer. */
function requireScene(kind: 'ordinal' | 'categorical') {
  return defineScene(5.6, ({ t, id }) => {
    const last: Move = {
      label: JO,
      to: kind === 'ordinal' ? ordSlot(1, 0) : catCentre(2),
      at: 2.7,
    };
    const from = drawerSlot(0, 1);
    const { pos, done } = moved(t, last, from);
    const toast =
      backOut(segment(t, 0.95, 0.4)) * (1 - smooth(segment(t, 2.5, 0.3)));
    return {
      rail: {
        progress: 0.45,
        press: segment(t, 0.8, 0.25) < 1 ? segment(t, 0.8, 0.25) : 0,
        pulse: done,
        pulseFrom: last.at + 0.7,
      },
      body: (
        <>
          {kind === 'ordinal' ? (
            <>
              <Prompt text={TEXT.ordinalPrompt} y={STAGE.y + 32} size={19} />
              <OrdinalBins id={id} labels={TEXT.closeness} />
              <BinNode at={ordSlot(2, 0)} label={SAM} />
              <BinNode at={ordSlot(4, 0)} label={ANA} />
            </>
          ) : (
            <>
              <Prompt
                text={TEXT.categoricalPrompt}
                y={STAGE.y + 32}
                size={19}
              />
              <CategoryCircles
                labels={TEXT.categories}
                members={[[SAM], [ANA], done ? [JO] : [], [], []]}
              />
            </>
          )}
          <Drawer />
          {done && kind === 'categorical' ? null : (
            <BinNode at={pos} label={last.label} />
          )}
          <Toast
            lines={TEXT.unplaced}
            variant="destructive"
            k={toast}
            t={t}
            from={0.95}
          />
        </>
      ),
      overlay: (
        <Click
          t={t}
          stops={[
            { to: [CONTENT.x + 33, CONTENT.bottom - 40], at: 0.8 },
            { to: from, at: last.at - 0.05, ring: false },
            { to: last.to, at: last.at + 0.7, glide: 0.7, ring: false },
          ]}
          leave={3.8}
        />
      ),
    };
  });
}

export const OrdinalBinRequireScene = requireScene('ordinal');

/** The colour gradient: the same bins shaded along three different colours. */
export const OrdinalBinGradientScene = defineScene(6.0, ({ t, id }) => {
  const steps = [0, 2, 5];
  const at = [0, 2.0, 4.0];
  const phase = t >= 4.0 ? 2 : t >= 2.0 ? 1 : 0;
  const start = at[phase] ?? 0;
  const blend = phase === 0 ? 0 : smooth(segment(t, start, 0.6));
  const from = steps[Math.max(0, phase - 1)] ?? 0;
  const to = steps[phase] ?? 0;
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Prompt text={TEXT.ordinalPrompt} y={STAGE.y + 32} size={19} />
        <OrdinalBins
          id={id}
          labels={TEXT.closeness}
          color={phase === 0 ? to : from}
          next={phase === 0 ? undefined : to}
          blend={blend}
        />
        <BinNode at={ordSlot(0, 0)} label={JO} />
        <BinNode at={ordSlot(2, 0)} label={SAM} />
        <BinNode at={ordSlot(3, 0)} label={ANA} />
        <Chip
          key={phase}
          x={STAGE_CENTER_X}
          y={STAGE.bottom - 40}
          text={TEXT.gradient(to + 1)}
          size={15}
          k={backOut(segment(t, start, 0.4))}
        />
      </>
    ),
  };
});

/* ------------------------------------------------------------ categorical */

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
              fillOpacity={highlight === i ? 0.4 : 0.15}
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

/** A categorical bin stage: alters dragged into circles, then a circle opened. */
export const CategoricalBinIntroScene = defineScene(6.0, ({ t }) => {
  const moves: Move[] = [
    { label: SAM, to: catCentre(0), at: 0.7, bin: 0 },
    { label: ANA, to: catCentre(1), at: 1.9, bin: 1 },
    { label: JO, to: catCentre(1), at: 3.1, bin: 1 },
  ];
  const from = (i: number) => drawerSlot(i, moves.length);
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
        <Drawer />
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

/** Tap to place, on circles: the selected alter goes to the circle tapped. */
export const CategoricalBinTapScene = defineScene(5.2, ({ t }) => {
  const moves: Move[] = [
    { label: SAM, to: catCentre(0), at: 1.0, bin: 0 },
    { label: ANA, to: catCentre(2), at: 2.4, bin: 2 },
    { label: JO, to: catCentre(0), at: 3.8, bin: 0 },
  ];
  const from = (i: number) => drawerSlot(i, moves.length);
  const placed = moves.map((m, i) => moved(t, m, from(i), 0.5));
  const selectedIndex = moves.findIndex((m) => t < m.at);
  const members = TEXT.categories.map((_, ci) =>
    moves
      .filter((m, mi) => placed[mi]?.done && m.bin === ci)
      .map((m) => m.label),
  );
  const tapped =
    t >= 0.8 && t < 1.1
      ? 0
      : t >= 2.2 && t < 2.5
        ? 2
        : t >= 3.6 && t < 3.9
          ? 0
          : undefined;
  return {
    rail: { progress: 0.5 },
    body: (
      <>
        <Prompt text={TEXT.categoricalPrompt} y={STAGE.y + 32} size={19} />
        <CategoryCircles
          labels={TEXT.categories}
          members={members}
          highlight={tapped}
        />
        <Drawer />
        {moves.map((m, i) => {
          const p = placed[i];
          if (p === undefined || p.done) return null;
          return (
            <BinNode
              key={m.label}
              at={p.pos}
              label={m.label}
              selected={i === selectedIndex}
            />
          );
        })}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: catCentre(0), at: 0.9 },
          { to: catCentre(2), at: 2.3 },
          { to: catCentre(0), at: 3.7 },
        ]}
        leave={4.3}
      />
    ),
  };
});

export const CategoricalBinRequireScene = requireScene('categorical');

/** The other circle: dropping an alter there asks the follow-up question. */
export const CategoricalBinOtherScene = defineScene(6.4, ({ t }) => {
  const labels = [...TEXT.categories.slice(0, 4), TEXT.other];
  const drop: Move = { label: KAI, to: catCentre(4), at: 0.6, bin: 4 };
  const from = drawerSlot(0, 1);
  const p = moved(t, drop, from);
  const dialog =
    backOut(segment(t, 1.4, 0.4)) * (1 - smooth(segment(t, 4.6, 0.3)));
  const typed = TEXT.otherAnswer.slice(
    0,
    Math.round(TEXT.otherAnswer.length * segment(t, 2.0, 1.4)),
  );
  const card = {
    x: STAGE_CENTER_X - 190,
    y: STAGE.y + 70,
    width: 380,
    height: 190,
  };
  const save: Point = [card.x + card.width - 70, card.y + card.height - 30];
  const after = t >= 4.6;
  return {
    rail: { progress: 0.5 },
    body: (
      <>
        <Prompt text={TEXT.categoricalPrompt} y={STAGE.y + 32} size={19} />
        <CategoryCircles
          labels={labels}
          members={[[SAM], [ANA], [], [], after ? [KAI] : []]}
          highlight={p.moving ? 4 : undefined}
        />
        <Drawer />
        {p.done ? null : <BinNode at={p.pos} label={KAI} />}
      </>
    ),
    modal:
      dialog > 0 ? (
        <g opacity={Math.min(1, dialog * 1.5)}>
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={CONTENT.right - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe/60"
          />
          <g transform={`translate(0 ${(1 - dialog) * 20})`}>
            <rect
              x={card.x}
              y={card.y}
              width={card.width}
              height={card.height}
              rx={18}
              className="fill-cyber-grape stroke-white/30"
              strokeWidth={3}
            />
            <text
              x={card.x + 26}
              y={card.y + 40}
              fontSize={21}
              fontWeight={900}
              className="fill-white"
            >
              {TEXT.other}
            </text>
            <BinNode at={[card.x + 50, card.y + 100]} label={KAI} />
            <text
              x={card.x + 88}
              y={card.y + 80}
              fontSize={15}
              fontWeight={700}
              className="fill-white"
            >
              {TEXT.otherQuestion}
            </text>
            <TextBox
              x={card.x + 88}
              y={card.y + 92}
              width={card.width - 116}
              text={typed}
              caret={t >= 2.0 && t < 3.6}
            />
            <Chip
              x={save[0]}
              y={save[1]}
              text={TEXT.save}
              size={16}
              width={100}
              fill="fill-sea-green"
              ink="fill-white"
            />
          </g>
        </g>
      ) : null,
    overlay: (
      <Click
        t={t}
        stops={[
          { to: from, at: drop.at - 0.05, ring: false },
          { to: drop.to, at: drop.at + 0.7, glide: 0.7, ring: false },
          { to: save, at: 4.4 },
        ]}
        leave={4.9}
      />
    ),
  };
});

/* -------------------------------------------------------- concept scenes */

function DataTable({
  x,
  y,
  columns,
  rows,
  reveal,
}: {
  x: number;
  y: number;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** 0 to 1 for each row, its arrival. */
  reveal: readonly number[];
}) {
  const colWidth = 120;
  const rowHeight = 40;
  const width = colWidth * columns.length;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={rowHeight}
        rx={10}
        className="fill-cyber-grape"
      />
      {columns.map((c, i) => (
        <text
          key={c}
          x={x + 16 + i * colWidth}
          y={y + 26}
          fontSize={15}
          fontWeight={800}
          className="fill-white"
        >
          {c}
        </text>
      ))}
      {rows.map((cells, r) => (
        <g key={cells[0]} opacity={reveal[r] ?? 0}>
          <rect
            x={x}
            y={y + rowHeight * (r + 1)}
            width={width}
            height={rowHeight}
            className={r % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
          />
          {cells.map((cell, i) => (
            <text
              key={`${cells[0]}-${i}`}
              x={x + 16 + i * colWidth}
              y={y + rowHeight * (r + 1) + 26}
              fontSize={15}
              fontWeight={700}
              className="fill-white"
            >
              {cell}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

function binDataScene(kind: 'ordinal' | 'categorical') {
  return defineScene(
    5.0,
    ({ t }) => {
      const people = [SAM, ANA, JO];
      const values =
        kind === 'ordinal' ? ['3', '4', '1'] : ['family', 'work', 'work'];
      const placesTo =
        kind === 'ordinal'
          ? [TEXT.closeness[2], TEXT.closeness[3], TEXT.closeness[0]]
          : [TEXT.categories[0], TEXT.categories[1], TEXT.categories[1]];
      const left = CONTENT.x + 40;
      const tableX = CONTENT.x + 360;
      const tableY = CONTENT.y + 70;
      const reveal = people.map((_, i) =>
        smooth(segment(t, 1.2 + i * 0.8, 0.4)),
      );
      return {
        body: (
          <>
            <text
              x={tableX}
              y={CONTENT.y + 44}
              fontSize={15}
              fontWeight={800}
              className="fill-white/60 uppercase"
            >
              {TEXT.exported}
            </text>
            {people.map((name, i) => {
              const y = CONTENT.y + 100 + i * 90;
              const k = backOut(segment(t, 0.2 + i * 0.15, 0.4));
              const fly = smooth(segment(t, 1.2 + i * 0.8, 0.5));
              return (
                <g key={name}>
                  <BinNode at={[left + 30, y]} label={name} k={k} />
                  <Chip
                    x={left + 160}
                    y={y}
                    text={placesTo[i] ?? ''}
                    size={13}
                    k={k}
                  />
                  {fly > 0 && fly < 1 ? (
                    <circle
                      cx={lerp(left + 230, tableX + 60, fly)}
                      cy={
                        lerp(y, tableY + 60 + i * 40, fly) -
                        Math.sin(Math.PI * fly) * 30
                      }
                      r={8}
                      className="fill-neon-coral"
                    />
                  ) : null}
                </g>
              );
            })}
            <DataTable
              x={tableX}
              y={tableY}
              columns={[
                TEXT.nameColumn,
                kind === 'ordinal'
                  ? TEXT.closenessColumn
                  : TEXT.relationshipColumn,
              ]}
              rows={people.map((p, i) => [p, values[i] ?? ''])}
              reveal={reveal}
            />
          </>
        ),
      };
    },
    { url: 'Exported data' },
  );
}

export const OrdinalBinDataScene = binDataScene('ordinal');
export const CategoricalBinDataScene = binDataScene('categorical');

const bucketSlot = (i: number): Point => [
  STAGE_CENTER_X + (i - 1.5) * 64,
  STAGE.bottom - 40,
];

/** Bucket order: the alters in the drawer reordered by a sort rule. */
export const BinBucketOrderScene = defineScene(4.8, ({ t }) => {
  const before = [KAI, ANA, SAM, JO];
  const after = [ANA, JO, KAI, SAM];
  const k = smooth(segment(t, 1.6, 0.9));
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Chip
          x={STAGE_CENTER_X}
          y={STAGE.y + 120}
          text={TEXT.bucketOrder}
          size={16}
          k={backOut(segment(t, 1.0, 0.4))}
        />
        <Drawer width={300} />
        {before.map((name, i) => {
          const j = after.indexOf(name);
          const a = bucketSlot(i);
          const b = bucketSlot(j);
          return (
            <BinNode
              key={name}
              at={[
                lerp(a[0], b[0], k),
                lerp(a[1], b[1], k) - Math.sin(Math.PI * k) * 26,
              ]}
              label={name}
            />
          );
        })}
      </>
    ),
  };
});

/** A stage filter: only the alters the rules match reach the stage. */
export const StageFilterScene = defineScene(
  5.0,
  ({ t }) => {
    const people = [
      { name: SAM, tagged: true },
      { name: ANA, tagged: false },
      { name: JO, tagged: true },
      { name: KAI, tagged: false },
      { name: LEE, tagged: true },
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
  { url: 'Stage filter' },
);
