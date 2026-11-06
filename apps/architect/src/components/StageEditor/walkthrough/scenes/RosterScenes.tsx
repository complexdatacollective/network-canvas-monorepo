import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NEXT_BUTTON,
  PersonNode,
  pressAt,
  Prompt,
  SidePanel,
  smooth,
  STAGE,
  Toast,
  travel,
  type Point,
  type Stop,
} from './parts';

const TEXT = {
  prompt: 'Which classmates do you spend time with?',
  panel: 'Your classmates',
  class: 'CLASS',
  cardDisplay: 'Card display: Class',
  name: 'Name',
  classButton: 'Class',
  search: 'Search...',
  typed: 'Rossa',
  low: 'Search accuracy: Low',
  exact: 'Search accuracy: Exact',
  // The interview's own message for a search that finds nothing.
  noMatch: 'Nothing matched your search term.',
  // The interview's own notices for a minimum of 2 and for a maximum.
  minimum: ['You must create at least 2', 'items before you can', 'continue.'],
  maximum: [
    'You have completed this',
    'task. Click the next',
    'arrow to continue.',
  ],
  rosterFile: 'Roster file',
  inInterview: 'In the interview',
  exported: 'Exported data',
  columns: ['name', 'class', 'club'],
} as const;

type Detail = Readonly<{ label: string; value: string }>;
type Entry = Readonly<{ key: string; label: string; detail?: Detail }>;

const PANEL = {
  x: STAGE.x + 14,
  y: STAGE.y + 66,
  width: 300,
  height: STAGE.bottom - STAGE.y - 76,
} as const;
const CARD = { width: 134, gap: 8, head: 34, detail: 28 } as const;
const GRID_X = PANEL.x + 12;
const GRID_TOP = PANEL.y + 54;
const NETWORK = {
  x: PANEL.x + PANEL.width + 24,
  right: STAGE.right - 16,
  y: (PANEL.y + PANEL.y + PANEL.height) / 2,
} as const;
const NETWORK_CENTRE = (NETWORK.x + NETWORK.right) / 2;
const NODE_R = 30;

const netSlot = (i: number, count = 3): Point => [
  NETWORK_CENTRE + (i - (count - 1) / 2) * 88,
  NETWORK.y,
];

const cardHeight = (detailK: number) => CARD.head + CARD.detail * detailK;

const gridSlot = (i: number, top: number, height: number): Point => [
  GRID_X + (i % 2) * (CARD.width + CARD.gap),
  top + Math.floor(i / 2) * (height + CARD.gap),
];

/** The centre of a card, where the cursor takes hold of it. */
const centreOf = ([x, y]: Point, height: number): Point => [
  x + CARD.width / 2,
  y + height / 2,
];

type Placed = Readonly<{ at: Point; k: number }>;

/**
 * Where each card sits as the roster changes: `states` are the card orders
 * in turn, and each change happens at the matching time in `changes`. Cards
 * slide to their new places, and appear or leave in place.
 */
function flow(
  states: readonly (readonly string[])[],
  changes: readonly number[],
  t: number,
  slot: (i: number) => Point,
): Map<string, Placed> {
  const keys = new Set(states.flat());
  const placed = new Map<string, Placed>();
  for (const key of keys) {
    const first = states[0]?.indexOf(key) ?? -1;
    let at: Point = slot(Math.max(first, 0));
    let k = first === -1 ? 0 : 1;
    changes.forEach((change, i) => {
      const m = smooth(segment(t, change, 0.35));
      if (m <= 0) return;
      const next = states[i + 1]?.indexOf(key) ?? -1;
      if (next === -1) {
        k = 0;
        return;
      }
      const target = slot(next);
      at =
        k > 0 ? [lerp(at[0], target[0], m), lerp(at[1], target[1], m)] : target;
      k = lerp(k, 1, m);
    });
    placed.set(key, { at, k });
  }
  return placed;
}

/** A roster card as the interview draws it: a name over its details. */
function Card({
  at,
  label,
  detail,
  detailK = 0,
  opacity = 1,
}: Readonly<{
  at: Point;
  label: string;
  detail?: Detail;
  detailK?: number;
  opacity?: number;
}>) {
  if (opacity <= 0) return null;
  const [x, y] = at;
  const shown = detail === undefined ? 0 : detailK;
  const height = cardHeight(shown);
  return (
    <g opacity={opacity}>
      <rect
        x={x}
        y={y}
        width={CARD.width}
        height={height}
        rx={6}
        className="fill-platinum-dark"
      />
      <rect
        x={x}
        y={y}
        width={CARD.width}
        height={CARD.head}
        rx={6}
        className="fill-platinum"
      />
      {shown > 0 ? (
        <rect
          x={x}
          y={y + CARD.head - 6}
          width={CARD.width}
          height={6}
          className="fill-platinum"
        />
      ) : null}
      <text
        x={x + 12}
        y={y + 22}
        fontSize={14}
        fontWeight={800}
        className="fill-charcoal"
      >
        {label}
      </text>
      {detail !== undefined && shown > 0 ? (
        <g opacity={shown}>
          <text
            x={x + 48}
            y={y + CARD.head + 18}
            textAnchor="end"
            fontSize={9}
            fontWeight={800}
            className="fill-charcoal"
          >
            {detail.label}
          </text>
          <text
            x={x + 56}
            y={y + CARD.head + 18}
            fontSize={12}
            fontWeight={600}
            className="fill-charcoal"
          >
            {detail.value}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** The roster panel the cards sit in, with its title. */
function RosterPanel({
  id,
  children,
}: Readonly<{ id: string; children?: ReactNode }>) {
  return (
    <SidePanel
      id={id}
      x={PANEL.x}
      y={PANEL.y}
      width={PANEL.width}
      height={PANEL.height}
      title={TEXT.panel}
      bar="fill-cat-1"
    >
      {children}
    </SidePanel>
  );
}

/** The overlay over the roster while an added node is dragged back to it. */
function DropBack({ k }: Readonly<{ k: number }>) {
  if (k <= 0) return null;
  const cx = PANEL.x + PANEL.width / 2;
  const cy = PANEL.y + PANEL.height / 2;
  return (
    <g opacity={k}>
      <rect
        x={PANEL.x}
        y={PANEL.y + 43}
        width={PANEL.width}
        height={PANEL.height - 53}
        className="fill-navy-taupe/80"
      />
      <circle cx={cx} cy={cy - 18} r={22} className="fill-neon-coral" />
      <path
        d={`M ${cx} ${cy + 18} v 22 m -9 -9 l 9 9 l 9 -9 M ${cx - 11} ${cy + 46} h 22`}
        className="fill-none stroke-white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

type Drag = Readonly<{
  key: string;
  label: string;
  pick: number;
  drop: number;
  from: Point;
  to: Point;
}>;

const carried = (t: number, drag: Drag): Point | null =>
  t < drag.pick || t >= drag.drop
    ? null
    : travel(t, drag.from, [
        { to: drag.to, at: drag.drop, glide: drag.drop - drag.pick },
      ]);

const dragStops = (drags: readonly Drag[]): Stop[] =>
  drags.flatMap((drag) => [
    { to: drag.from, at: drag.pick, ring: false },
    {
      to: drag.to,
      at: drag.drop,
      glide: drag.drop - drag.pick,
      ring: false,
    },
  ]);

const INTRO_CARDS: readonly Entry[] = [
  'Kwame',
  'Lin',
  'Rosa',
  'Sam',
  'Ana',
  'Jo',
].map((label) => ({ key: label, label }));

/**
 * The roster screen: cards beside the participant's network. A card dragged
 * across becomes a node and leaves the list; dragged back, it returns.
 */
export const RosterIntroScene = defineScene(6.0, ({ t, id }) => {
  const order = INTRO_CARDS.map((c) => c.key);
  const states = [
    order,
    order.filter((k) => k !== 'Rosa'),
    order.filter((k) => k !== 'Rosa' && k !== 'Lin'),
    order.filter((k) => k !== 'Lin'),
  ];
  const slot = (i: number) => gridSlot(i, GRID_TOP, cardHeight(0));
  const placed = flow(states, [1.8, 3.2, 4.8], t, slot);
  const at = (key: string) => placed.get(key)?.at ?? slot(0);
  const drags: Drag[] = [
    {
      key: 'Rosa',
      label: 'Rosa',
      pick: 0.9,
      drop: 1.8,
      from: centreOf(slot(2), cardHeight(0)),
      to: netSlot(0, 2),
    },
    {
      key: 'Lin',
      label: 'Lin',
      pick: 2.4,
      drop: 3.2,
      from: centreOf(slot(0), cardHeight(0)),
      to: netSlot(1, 2),
    },
    {
      key: 'Rosa',
      label: 'Rosa',
      pick: 3.9,
      drop: 4.8,
      from: netSlot(0, 2),
      to: [PANEL.x + PANEL.width / 2, PANEL.y + PANEL.height / 2],
    },
  ];
  const back = drags[2];
  const overlay =
    back === undefined
      ? 0
      : segment(t, back.pick, 0.2) * (1 - segment(t, back.drop, 0.2));
  const inNetwork = [
    { label: 'Rosa', at: netSlot(0, 2), from: 1.8, to: 3.9 },
    { label: 'Lin', at: netSlot(1, 2), from: 3.2, to: Infinity },
  ];
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={20} y={STAGE.y + 40} />
        <RosterPanel id={id}>
          {INTRO_CARDS.map((card) => {
            const p = placed.get(card.key);
            const lifted = drags.some(
              (d) =>
                d.key === card.key &&
                t >= d.pick &&
                t < d.drop &&
                d.from[0] < NETWORK.x,
            );
            return (
              <Card
                key={card.key}
                at={at(card.key)}
                label={card.label}
                opacity={(p?.k ?? 0) * (lifted ? 0.4 : 1)}
              />
            );
          })}
          <DropBack k={overlay} />
        </RosterPanel>
        {inNetwork.map((node) =>
          t >= node.from && t < node.to ? (
            <PersonNode
              key={node.label}
              x={node.at[0]}
              y={node.at[1]}
              r={NODE_R}
              label={node.label}
              k={backOut(segment(t, node.from, 0.3))}
            />
          ) : null,
        )}
        {drags.map((drag) => {
          const p = carried(t, drag);
          return p ? (
            <PersonNode
              key={`${drag.key}-${drag.pick}`}
              x={p[0]}
              y={p[1]}
              r={26}
              label={drag.label}
              k={1}
            />
          ) : null;
        })}
      </>
    ),
    overlay: <Click t={t} stops={dragStops(drags)} leave={5.2} />,
  };
});

const DISPLAY_CARDS: readonly Entry[] = [
  { key: 'alex-a', label: 'Alex', detail: { label: TEXT.class, value: '7A' } },
  { key: 'alex-b', label: 'Alex', detail: { label: TEXT.class, value: '7B' } },
  { key: 'lin', label: 'Lin', detail: { label: TEXT.class, value: '7A' } },
  { key: 'rosa', label: 'Rosa', detail: { label: TEXT.class, value: '7B' } },
];

/**
 * Two cards with the same name, told apart once the card display shows each
 * one's class beneath it.
 */
export const RosterCardDisplayScene = defineScene(5.2, ({ t, id }) => {
  const detailK = smooth(segment(t, 1.4, 0.6));
  const height = cardHeight(detailK);
  const order = DISPLAY_CARDS.map((c) => c.key);
  const slot = (i: number) => gridSlot(i, GRID_TOP, height);
  const placed = flow(
    [order, order.filter((k) => k !== 'alex-b')],
    [3.5],
    t,
    slot,
  );
  const drag: Drag = {
    key: 'alex-b',
    label: 'Alex',
    pick: 2.6,
    drop: 3.5,
    from: centreOf(gridSlot(1, GRID_TOP, cardHeight(1)), cardHeight(1)),
    to: netSlot(0, 1),
  };
  const p = carried(t, drag);
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={20} y={STAGE.y + 40} />
        <RosterPanel id={id}>
          {DISPLAY_CARDS.map((card) => {
            const placedCard = placed.get(card.key);
            const lifted =
              card.key === drag.key && t >= drag.pick && t < drag.drop;
            return (
              <Card
                key={card.key}
                at={placedCard?.at ?? slot(0)}
                label={card.label}
                detail={card.detail}
                detailK={detailK}
                opacity={(placedCard?.k ?? 0) * (lifted ? 0.4 : 1)}
              />
            );
          })}
        </RosterPanel>
        <Chip
          x={NETWORK_CENTRE}
          y={PANEL.y + 20}
          text={TEXT.cardDisplay}
          size={13}
          k={backOut(segment(t, 1.1, 0.4))}
        />
        {t >= drag.drop ? (
          <PersonNode
            x={netSlot(0, 1)[0]}
            y={netSlot(0, 1)[1]}
            r={NODE_R}
            label={drag.label}
            k={backOut(segment(t, drag.drop, 0.3))}
          />
        ) : null}
        {p ? (
          <PersonNode x={p[0]} y={p[1]} r={26} label={drag.label} k={1} />
        ) : null}
      </>
    ),
    overlay: <Click t={t} stops={dragStops([drag])} leave={4.0} />,
  };
});

const SORT_CARDS: readonly Entry[] = [
  { key: 'Rosa', label: 'Rosa', detail: { label: TEXT.class, value: '7B' } },
  { key: 'Kwame', label: 'Kwame', detail: { label: TEXT.class, value: '7A' } },
  { key: 'Lin', label: 'Lin', detail: { label: TEXT.class, value: '7B' } },
  { key: 'Ana', label: 'Ana', detail: { label: TEXT.class, value: '7A' } },
];

const BUTTON_Y = PANEL.y + 68;
const BUTTONS = [
  { label: TEXT.name, x: PANEL.x + 14, width: 96 },
  { label: TEXT.classButton, x: PANEL.x + 118, width: 96 },
] as const;

/** A sort button: the active one takes the accent fill and an arrow. */
function SortButton({
  x,
  width,
  label,
  active,
  descending,
  press,
}: Readonly<{
  x: number;
  width: number;
  label: string;
  active: number;
  descending: number;
  press: number;
}>) {
  const cy = BUTTON_Y;
  const squash = 1 - 0.08 * Math.sin(Math.PI * press);
  const ax = x + width - 20;
  return (
    <g
      transform={`translate(${x + width / 2} ${cy}) scale(${squash}) translate(${-(x + width / 2)} ${-cy})`}
    >
      <rect
        x={x}
        y={cy - 16}
        width={width}
        height={32}
        rx={16}
        className="fill-white/15"
      />
      <rect
        x={x}
        y={cy - 16}
        width={width}
        height={32}
        rx={16}
        className="fill-slate-blue"
        opacity={active}
      />
      <text
        x={x + 16}
        y={cy + 5}
        fontSize={14}
        fontWeight={700}
        className="fill-white"
      >
        {label}
      </text>
      {active > 0 ? (
        <g
          opacity={active}
          transform={`rotate(${descending * 180} ${ax} ${cy})`}
        >
          <path
            d={`M ${ax} ${cy + 7} v -14 m -5 5 l 5 -5 l 5 5`}
            className="fill-none stroke-white"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </g>
  );
}

/** Sort buttons reordering the cards, by name each way and then by class. */
export const RosterSortScene = defineScene(5.6, ({ t, id }) => {
  const clicks = [1.0, 2.4, 3.8];
  const states = [
    ['Rosa', 'Kwame', 'Lin', 'Ana'],
    ['Ana', 'Kwame', 'Lin', 'Rosa'],
    ['Rosa', 'Lin', 'Kwame', 'Ana'],
    ['Kwame', 'Ana', 'Rosa', 'Lin'],
  ];
  const height = cardHeight(1);
  const slot = (i: number) => gridSlot(i, BUTTON_Y + 30, height);
  const placed = flow(
    states,
    clicks.map((c) => c + 0.1),
    t,
    slot,
  );
  const nameOn =
    smooth(segment(t, 1.0, 0.2)) * (1 - smooth(segment(t, 3.8, 0.2)));
  const classOn = smooth(segment(t, 3.8, 0.2));
  const nameDown = smooth(segment(t, 2.4, 0.3));
  const target = (b: (typeof BUTTONS)[number]): Point => [
    b.x + b.width / 2,
    BUTTON_Y,
  ];
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={20} y={STAGE.y + 40} />
        <RosterPanel id={id}>
          <SortButton
            {...BUTTONS[0]}
            active={nameOn}
            descending={nameDown}
            press={pressAt(t, [1.0, 2.4])}
          />
          <SortButton
            {...BUTTONS[1]}
            active={classOn}
            descending={0}
            press={pressAt(t, [3.8])}
          />
          {SORT_CARDS.map((card) => (
            <Card
              key={card.key}
              at={placed.get(card.key)?.at ?? slot(0)}
              label={card.label}
              detail={card.detail}
              detailK={1}
            />
          ))}
        </RosterPanel>
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: target(BUTTONS[0]), at: clicks[0] ?? 0 },
          { to: target(BUTTONS[0]), at: clicks[1] ?? 0 },
          { to: target(BUTTONS[1]), at: clicks[2] ?? 0 },
        ]}
        leave={4.6}
      />
    ),
  };
});

const SEARCH_CARDS = ['Kwame', 'Lin', 'Rosa', 'Sam', 'Ana', 'Jo'];
const SEARCH_Y = PANEL.y + 68;

/** The search box above the cards, with what the participant has typed. */
function SearchBox({
  typed,
  caret,
}: Readonly<{ typed: string; caret: boolean }>) {
  const x = PANEL.x + 14;
  const width = PANEL.width - 28;
  return (
    <g>
      <rect
        x={x}
        y={SEARCH_Y - 17}
        width={width}
        height={34}
        rx={8}
        className="fill-white/15"
      />
      <circle
        cx={x + 18}
        cy={SEARCH_Y - 2}
        r={6}
        className="fill-none stroke-white/70"
        strokeWidth={2}
      />
      <path
        d={`M ${x + 22} ${SEARCH_Y + 2} l 5 5`}
        className="stroke-white/70"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <text
        x={x + 36}
        y={SEARCH_Y + 5}
        fontSize={14}
        fontWeight={600}
        className={typed === '' ? 'fill-white/50' : 'fill-white'}
      >
        {typed === '' ? TEXT.search : typed}
      </text>
      {caret ? (
        <rect
          x={x + 37 + typed.length * 8.2}
          y={SEARCH_Y - 9}
          width={2}
          height={18}
          className="fill-white"
        />
      ) : null}
    </g>
  );
}

const typedAt = (t: number, from: number, to: number) => {
  const letters = Math.floor(
    TEXT.typed.length * Math.min(1, Math.max(0, (t - from) / (to - from))),
  );
  return TEXT.typed.slice(0, letters);
};

/**
 * Typing filters the cards. A misspelled "Rossa" still finds Rosa at low
 * accuracy, and finds nothing at exact accuracy.
 */
export const RosterSearchScene = defineScene(7.0, ({ t, id }) => {
  const second = t >= 3.4;
  const typed = second ? typedAt(t, 3.9, 4.7) : typedAt(t, 0.7, 1.5);
  const slot = (i: number) => gridSlot(i, SEARCH_Y + 30, cardHeight(0));
  const placed = flow(
    [SEARCH_CARDS, ['Rosa'], SEARCH_CARDS, []],
    [1.6, 3.4, 4.8],
    t,
    slot,
  );
  const noMatch = segment(t, 5.0, 0.3);
  const caret = (t > 0.6 && t < 2.2) || (t > 3.8 && t < 5.4);
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={20} y={STAGE.y + 40} />
        <RosterPanel id={id}>
          <SearchBox
            typed={typed}
            caret={caret && Math.floor(t * 3) % 2 === 0}
          />
          {SEARCH_CARDS.map((label) => {
            const p = placed.get(label);
            return (
              <Card
                key={label}
                at={p?.at ?? slot(0)}
                label={label}
                opacity={p?.k ?? 0}
              />
            );
          })}
          {noMatch > 0 ? (
            <text
              x={PANEL.x + PANEL.width / 2}
              y={SEARCH_Y + 80}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              opacity={noMatch}
              className="fill-white/70"
            >
              {TEXT.noMatch}
            </text>
          ) : null}
        </RosterPanel>
        <Chip
          x={NETWORK_CENTRE}
          y={PANEL.y + 20}
          text={second ? TEXT.exact : TEXT.low}
          size={13}
          k={backOut(segment(t, second ? 3.4 : 0.2, 0.4))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: [PANEL.x + 230, SEARCH_Y], at: 0.6 },
          { to: [PANEL.x + 230, SEARCH_Y], at: 3.8 },
        ]}
        leave={5.4}
      />
    ),
  };
});

const LIMIT_CARDS = ['Kwame', 'Lin', 'Rosa', 'Sam', 'Ana'];

/**
 * The limits on a roster stage: under the minimum, the notice by Next; at
 * the maximum the cards stop dragging, the success notice appears and Next
 * glows.
 */
export const RosterLimitsScene = defineScene(6.4, ({ t, id }) => {
  const slot = (i: number) => gridSlot(i, GRID_TOP, cardHeight(0));
  const states = [
    LIMIT_CARDS,
    LIMIT_CARDS.filter((k) => k !== 'Rosa'),
    LIMIT_CARDS.filter((k) => k !== 'Rosa' && k !== 'Lin'),
    LIMIT_CARDS.filter((k) => !['Rosa', 'Lin', 'Sam'].includes(k)),
  ];
  const drags: Drag[] = [
    {
      key: 'Rosa',
      label: 'Rosa',
      pick: 0.4,
      drop: 1.1,
      from: centreOf(slot(2), cardHeight(0)),
      to: netSlot(0),
    },
    {
      key: 'Lin',
      label: 'Lin',
      pick: 3.0,
      drop: 3.7,
      from: centreOf(slot(1), cardHeight(0)),
      to: netSlot(1),
    },
    {
      key: 'Sam',
      label: 'Sam',
      pick: 4.1,
      drop: 4.8,
      from: centreOf(slot(1), cardHeight(0)),
      to: netSlot(2),
    },
  ];
  const placed = flow(
    states,
    drags.map((d) => d.drop),
    t,
    slot,
  );
  const minMet = 3.7;
  const full = t >= 4.8;
  const early = segment(t, 1.7, 0.3) * (1 - segment(t, 2.8, 0.3));
  const disabled = smooth(segment(t, 4.8, 0.3));
  return {
    rail: {
      progress: 0.3,
      pulse: t >= minMet,
      pulseFrom: minMet,
      press: pressAt(t, [1.7]),
    },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={20} y={STAGE.y + 40} />
        <RosterPanel id={id}>
          {LIMIT_CARDS.map((label) => {
            const p = placed.get(label);
            const lifted = drags.some(
              (d) => d.key === label && t >= d.pick && t < d.drop,
            );
            return (
              <Card
                key={label}
                at={p?.at ?? slot(0)}
                label={label}
                opacity={
                  (p?.k ?? 0) * (lifted ? 0.4 : 1) * (1 - 0.45 * disabled)
                }
              />
            );
          })}
        </RosterPanel>
        {drags.map((drag, i) =>
          t >= drag.drop ? (
            <PersonNode
              key={drag.key}
              x={netSlot(i)[0]}
              y={netSlot(i)[1]}
              r={NODE_R}
              label={drag.label}
              k={backOut(segment(t, drag.drop, 0.3))}
            />
          ) : null,
        )}
        {drags.map((drag) => {
          const p = carried(t, drag);
          return p ? (
            <PersonNode
              key={`${drag.key}-carried`}
              x={p[0]}
              y={p[1]}
              r={26}
              label={drag.label}
              k={1}
            />
          ) : null;
        })}
        <Toast
          lines={TEXT.minimum}
          variant="destructive"
          k={early}
          t={t}
          from={1.7}
        />
        <Toast
          lines={TEXT.maximum}
          variant="success"
          k={full ? segment(t, 4.9, 0.3) : 0}
          t={t}
          from={4.9}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          ...dragStops(drags.slice(0, 1)),
          { to: NEXT_BUTTON, at: 1.7 },
          ...dragStops(drags.slice(1)),
        ]}
        leave={5.2}
      />
    ),
  };
});

/** A dot hopping from `a` to `b` as `k` runs from 0 to 1. */
const hop = (k: number, a: Point, b: Point): Point => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k) - Math.sin(Math.PI * k) * 40,
];

const ROSTER_ROWS = [
  ['Kwame', '7A', 'chess'],
  ['Lin', '7B', 'art'],
  ['Rosa', '7A', 'drama'],
] as const;

/** A small table: a header row of column names, then its rows. */
function Table({
  x,
  y,
  width,
  rows,
  highlight,
  rowK,
}: Readonly<{
  x: number;
  y: number;
  width: number;
  rows: readonly (readonly string[])[];
  highlight?: number;
  /** How far each row has appeared, 0 to 1. */
  rowK: readonly number[];
}>) {
  const rowH = 34;
  const col = width / TEXT.columns.length;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={rowH}
        rx={8}
        className="fill-cyber-grape"
      />
      {TEXT.columns.map((name, c) => (
        <text
          key={name}
          x={x + 14 + c * col}
          y={y + 22}
          fontSize={13}
          fontWeight={800}
          className="fill-white"
        >
          {name}
        </text>
      ))}
      {rows.map((cells, r) => {
        const k = rowK[r] ?? 0;
        if (k <= 0) return null;
        const ry = y + rowH * (r + 1);
        return (
          <g key={cells[0]} opacity={k}>
            <rect
              x={x}
              y={ry}
              width={width}
              height={rowH}
              className={
                highlight === r
                  ? 'fill-mustard/40'
                  : r % 2 === 0
                    ? 'fill-white/5'
                    : 'fill-white/10'
              }
            />
            {cells.map((cell, c) => (
              <text
                key={`${cells[0]}-${TEXT.columns[c]}`}
                x={x + 14 + c * col}
                y={ry + 22}
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
    </g>
  );
}

/**
 * A roster row becomes a node that carries the row's columns as attributes,
 * and the node becomes a row of the exported data with the same columns.
 */
export const RosterDataScene = defineScene(
  5.0,
  ({ t }) => {
    const headingY = CONTENT.y + 34;
    const left = { x: CONTENT.x + 20, width: 210 };
    const right = { x: CONTENT.right - 230, width: 210 };
    const tableY = CONTENT.y + 90;
    const node: Point = [(CONTENT.x + CONTENT.right) / 2, tableY + 80];
    const rosa = ROSTER_ROWS[2];
    const fromRow: Point = [left.x + left.width - 20, tableY + 34 * 3 + 17];
    const toRow: Point = [right.x + 20, tableY + 34 + 17];
    const flyIn = smooth(segment(t, 1.1, 0.6));
    const flyOut = smooth(segment(t, 2.9, 0.6));
    const headings = [
      { x: left.x + left.width / 2, text: TEXT.rosterFile },
      { x: node[0], text: TEXT.inInterview },
      { x: right.x + right.width / 2, text: TEXT.exported },
    ];
    return {
      body: (
        <>
          {headings.map(({ x, text }, i) => (
            <text
              key={text}
              x={x}
              y={headingY}
              textAnchor="middle"
              fontSize={14}
              fontWeight={800}
              opacity={segment(t, 0.1 + i * 0.1, 0.3)}
              className="fill-white/60 uppercase"
            >
              {text}
            </text>
          ))}
          <Table
            x={left.x}
            y={tableY}
            width={left.width}
            rows={ROSTER_ROWS}
            highlight={t >= 0.8 ? 2 : undefined}
            rowK={ROSTER_ROWS.map((_, i) => segment(t, 0.2 + i * 0.1, 0.3))}
          />
          <PersonNode
            x={node[0]}
            y={node[1]}
            r={40}
            label={rosa[0]}
            k={backOut(segment(t, 1.7, 0.4))}
          />
          <Chip
            x={node[0]}
            y={node[1] + 66}
            text={`${TEXT.columns[1]}: ${rosa[1]}`}
            size={13}
            k={backOut(segment(t, 2.0, 0.4))}
          />
          <Chip
            x={node[0]}
            y={node[1] + 102}
            text={`${TEXT.columns[2]}: ${rosa[2]}`}
            size={13}
            k={backOut(segment(t, 2.2, 0.4))}
          />
          <Table
            x={right.x}
            y={tableY}
            width={right.width}
            rows={[rosa]}
            rowK={[segment(t, 3.5, 0.3)]}
          />
          {flyIn > 0 && flyIn < 1 ? (
            <circle
              cx={hop(flyIn, fromRow, node)[0]}
              cy={hop(flyIn, fromRow, node)[1]}
              r={10}
              className="fill-neon-coral"
            />
          ) : null}
          {flyOut > 0 && flyOut < 1 ? (
            <circle
              cx={hop(flyOut, node, toRow)[0]}
              cy={hop(flyOut, node, toRow)[1]}
              r={10}
              className="fill-neon-coral"
            />
          ) : null}
        </>
      ),
    };
  },
  { url: 'Roster to data' },
);
