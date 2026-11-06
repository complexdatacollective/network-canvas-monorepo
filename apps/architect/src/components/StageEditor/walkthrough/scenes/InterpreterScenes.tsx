import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NEXT_BUTTON,
  PersonNode,
  pressAt,
  PromptPips,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  TextBox,
  type Point,
} from './parts';

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';
const KAI = 'Kai';

const TEXT = {
  aboutYou: 'About you',
  age: 'How old are you?',
  partner: 'Do you live with a partner?',
  typedAge: '34',
  yes: 'Yes',
  no: 'No',
  more: ['Where were you born?', 'What is your job?', 'How many siblings?'],
  titleChip: 'Title',
  textChip: 'Introduction text',
  egoList: 'Ego list',
  egoRow: 'One row for the participant',
  egoColumns: ['age', 'has_partner'],
  trueValue: 'true',
  known: 'How long have you known each other?',
  typedKnown: '5 years',
  edgeList: 'Edge list',
  edgeColumns: ['from', 'to', 'type', 'known_for'],
  knows: 'knows',
  fromForm: 'From the form',
  oneForm: 'One form for each edge',
  ofThree: ['1 of 3', '2 of 3', '3 of 3'],
  noEdge: 'No edge, no form',
  censusQuestion: 'Do these two know each other?',
  censusWork: 'Do these two work together?',
  dyadColumns: ['from', 'to', 'type'],
  answered: 'Answers',
  noEdgeRow: 'No: no edge',
  fourAlters: '4 alters: 6 pairs',
  sixAlters: '6 alters: 15 pairs',
  already: 'Already connected',
  secondPrompt: 'Prompt 2 starts from the first pair',
} as const;

/* ------------------------------------------------------------- pieces */

function Card({
  x,
  y,
  width,
  height,
  opacity = 1,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={20}
      opacity={opacity}
      className="fill-cyber-grape"
    />
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fontSize={15} fontWeight={800} className="fill-white">
      {text}
    </text>
  );
}

/**
 * A yes and a no option card, as the interview's boolean field draws them: a
 * bordered card with a radio dot before its label. The chosen card's border
 * and dot take the primary colour, for No as much as for Yes.
 */
function YesNo({
  x,
  y,
  chosen,
  width = 110,
}: {
  x: number;
  y: number;
  chosen: 'yes' | 'no' | undefined;
  width?: number;
}) {
  const options = [
    { key: 'yes' as const, text: TEXT.yes },
    { key: 'no' as const, text: TEXT.no },
  ];
  return (
    <>
      {options.map(({ key, text }, i) => {
        const left = x + i * (width + 14);
        const picked = chosen === key;
        const dot: Point = [left + 24, y + 20];
        return (
          <g key={key}>
            <rect
              x={left}
              y={y}
              width={width}
              height={40}
              rx={8}
              className={cx(
                'fill-navy-taupe',
                picked ? 'stroke-sea-green' : 'stroke-white/20',
              )}
              strokeWidth={3}
            />
            <circle
              cx={dot[0]}
              cy={dot[1]}
              r={9}
              className="fill-none stroke-white/40"
              strokeWidth={2}
            />
            {picked ? (
              <circle
                cx={dot[0]}
                cy={dot[1]}
                r={6}
                className="fill-sea-green"
              />
            ) : null}
            <text
              x={left + 42}
              y={y + 26}
              fontSize={17}
              fontWeight={700}
              className="fill-white"
            >
              {text}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * Two nodes with the track between them that fills with the edge colour,
 * left to right, as the interview's dyad pair and joined pair draw it.
 */
function JoinedNodes({
  centre,
  from,
  to,
  fill,
  edge = 'fill-edge-1',
  gap = 220,
  r = 38,
  track = false,
}: {
  centre: Point;
  from: string | undefined;
  to: string | undefined;
  /** 0 to 1, how far the edge has filled. */
  fill: number;
  edge?: string;
  gap?: number;
  r?: number;
  track?: boolean;
}) {
  const [cxp, cy] = centre;
  const left = cxp - gap / 2;
  const right = cxp + gap / 2;
  const barX = left + r - 6;
  const barWidth = right - left - 2 * r + 12;
  return (
    <>
      {track ? (
        <rect
          x={barX}
          y={cy - 5}
          width={barWidth}
          height={10}
          className="fill-white/10"
        />
      ) : null}
      {fill > 0 ? (
        <rect
          x={barX}
          y={cy - 5}
          width={barWidth * Math.min(1, fill)}
          height={10}
          className={edge}
        />
      ) : null}
      {from ? <PersonNode x={left} y={cy} r={r} label={from} k={1} /> : null}
      {to ? <PersonNode x={right} y={cy} r={r} label={to} k={1} /> : null}
    </>
  );
}

function DataTable({
  x,
  y,
  columns,
  rows,
  reveal,
  colWidth = 110,
}: {
  x: number;
  y: number;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** For each row, 0 to 1 for each cell's arrival. */
  reveal: (row: number, cell: number) => number;
  colWidth?: number;
}) {
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
          x={x + 14 + i * colWidth}
          y={y + 26}
          fontSize={15}
          fontWeight={800}
          className="fill-white"
        >
          {c}
        </text>
      ))}
      {rows.map((cells, r) => (
        <g key={cells.join('-')}>
          <rect
            x={x}
            y={y + rowHeight * (r + 1)}
            width={width}
            height={rowHeight}
            opacity={reveal(r, 0)}
            className={r % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
          />
          {cells.map((cell, i) => (
            <text
              key={`${cells.join('-')}-${columns[i] ?? i}`}
              x={x + 14 + i * colWidth}
              y={y + rowHeight * (r + 1) + 26}
              fontSize={15}
              fontWeight={700}
              opacity={reveal(r, i)}
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

function Heading({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={14}
      fontWeight={800}
      className="fill-white/60 uppercase"
    >
      {text}
    </text>
  );
}

/* ----------------------------------------------------------- ego form */

const EGO = {
  x: STAGE_CENTER_X - 220,
  width: 440,
  introY: STAGE.y + 22,
  introHeight: 96,
} as const;
const EGO_FORM_Y = EGO.introY + EGO.introHeight + 16;

function EgoIntro({
  title = TEXT.aboutYou,
  lines = 2,
  short = false,
}: {
  title?: string;
  lines?: number;
  /** Shorter text lines, leaving room for a label beside them. */
  short?: boolean;
}) {
  return (
    <>
      <Card
        x={EGO.x}
        y={EGO.introY}
        width={EGO.width}
        height={EGO.introHeight}
      />
      <text
        x={EGO.x + 28}
        y={EGO.introY + 40}
        fontSize={24}
        fontWeight={900}
        className="fill-white"
      >
        {title}
      </text>
      {lines > 0 ? (
        <TextBar x={EGO.x + 28} y={EGO.introY + 62} width={short ? 200 : 300} />
      ) : null}
      {lines > 1 ? (
        <TextBar x={EGO.x + 28} y={EGO.introY + 80} width={short ? 150 : 220} />
      ) : null}
    </>
  );
}

/** The ego form: an introduction above one form about the participant. */
export const EgoFormIntroScene = defineScene(5.4, ({ t }) => {
  const typed = TEXT.typedAge.slice(
    0,
    Math.round(TEXT.typedAge.length * segment(t, 0.9, 0.5)),
  );
  const chosen = t >= 2.6 ? 'yes' : undefined;
  const formHeight = 200;
  const ready = t >= 3.4;
  return {
    rail: {
      progress: 0.12,
      pulse: ready,
      pulseFrom: 3.4,
      press: pressAt(t, [4.3]),
    },
    body: (
      <>
        <EgoIntro />
        <Card x={EGO.x} y={EGO_FORM_Y} width={EGO.width} height={formHeight} />
        <Label x={EGO.x + 28} y={EGO_FORM_Y + 34} text={TEXT.age} />
        <TextBox
          x={EGO.x + 28}
          y={EGO_FORM_Y + 46}
          width={EGO.width - 56}
          text={typed}
          caret={t >= 0.9 && t < 1.8}
        />
        <Label x={EGO.x + 28} y={EGO_FORM_Y + 124} text={TEXT.partner} />
        <YesNo x={EGO.x + 28} y={EGO_FORM_Y + 140} chosen={chosen} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: [EGO.x + 120, EGO_FORM_Y + 66], at: 0.8 },
          { to: [EGO.x + 83, EGO_FORM_Y + 160], at: 2.6 },
          { to: NEXT_BUTTON, at: 4.3 },
        ]}
        leave={4.8}
      />
    ),
  };
});

/** The introduction: a required title, then optional text below it. */
export const EgoFormIntroductionScene = defineScene(4.2, ({ t }) => {
  const title = TEXT.aboutYou.slice(
    0,
    Math.round(TEXT.aboutYou.length * segment(t, 0.4, 0.9)),
  );
  const lines = t >= 2.4 ? 2 : t >= 1.9 ? 1 : 0;
  return {
    rail: { progress: 0.12 },
    body: (
      <>
        <EgoIntro title={title} lines={lines} short />
        <Card
          x={EGO.x}
          y={EGO_FORM_Y}
          width={EGO.width}
          height={200}
          opacity={0.45}
        />
        <TextBar
          x={EGO.x + 28}
          y={EGO_FORM_Y + 34}
          width={180}
          className="stroke-white/20"
        />
        <TextBar
          x={EGO.x + 28}
          y={EGO_FORM_Y + 104}
          width={220}
          className="stroke-white/20"
        />
        <Chip
          x={EGO.x + EGO.width - 70}
          y={EGO.introY + 34}
          text={TEXT.titleChip}
          size={13}
          k={backOut(segment(t, 1.4, 0.4))}
        />
        <Chip
          x={EGO.x + EGO.width - 90}
          y={EGO.introY + 71}
          text={TEXT.textChip}
          size={13}
          k={backOut(segment(t, 2.6, 0.4))}
        />
      </>
    ),
  };
});

/** A long form: the arrow nudge appears, and following it shows the rest. */
export const EgoFormScrollScene = defineScene(5.8, ({ t, id }) => {
  const scroll = smooth(segment(t, 3.4, 0.8)) * 210;
  const nudge =
    backOut(segment(t, 1.2, 0.4)) * (1 - smooth(segment(t, 3.3, 0.3)));
  const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * 6;
  const questions = [TEXT.age, TEXT.partner, ...TEXT.more];
  const nudgeY = CONTENT.bottom - 36;
  const top = STAGE.y + 22 - scroll;
  const clip = `${id}-ego-scroll`;
  return {
    rail: { progress: 0.12, pulse: t >= 4.3, pulseFrom: 4.3 },
    body: (
      <>
        <clipPath id={clip}>
          <rect
            x={STAGE.x}
            y={STAGE.y}
            width={STAGE.right - STAGE.x}
            height={STAGE.bottom - STAGE.y - nudge * 64}
          />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <Card x={EGO.x} y={top} width={EGO.width} height={70} />
          <text
            x={EGO.x + 28}
            y={top + 44}
            fontSize={24}
            fontWeight={900}
            className="fill-white"
          >
            {TEXT.aboutYou}
          </text>
          <Card x={EGO.x} y={top + 86} width={EGO.width} height={470} />
          {questions.map((q, i) => (
            <g key={q}>
              <Label x={EGO.x + 28} y={top + 120 + i * 90} text={q} />
              <TextBox
                x={EGO.x + 28}
                y={top + 132 + i * 90}
                width={EGO.width - 56}
                text=""
              />
            </g>
          ))}
        </g>
        {nudge > 0 ? (
          <g transform={`translate(0 ${(1 - nudge) * 40})`} opacity={nudge}>
            <rect
              x={STAGE_CENTER_X - 46}
              y={nudgeY - 22}
              width={92}
              height={44}
              rx={22}
              className="fill-cyber-grape stroke-white/30"
              strokeWidth={2}
            />
            {[-16, 16].map((dx) => (
              <path
                key={dx}
                d={`M ${STAGE_CENTER_X + dx - 9} ${nudgeY - 6 + bounce} l 9 9 l 9 -9`}
                className="fill-none stroke-white"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ) : null}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[{ to: [STAGE_CENTER_X, nudgeY], at: 3.2 }]}
        leave={3.7}
      />
    ),
  };
});

/** The answers become one row of the ego list. */
export const EgoFormDataScene = defineScene(
  4.4,
  ({ t }) => {
    const left = CONTENT.x + 40;
    const top = CONTENT.y + 70;
    const tableX = CONTENT.x + 400;
    return {
      body: (
        <>
          <Card x={left} y={top} width={290} height={190} />
          <Label x={left + 24} y={top + 34} text={TEXT.age} />
          <TextBox
            x={left + 24}
            y={top + 46}
            width={240}
            text={TEXT.typedAge}
          />
          <Label x={left + 24} y={top + 120} text={TEXT.partner} />
          <YesNo x={left + 24} y={top + 134} chosen="yes" width={100} />
          <Heading x={tableX} y={CONTENT.y + 44} text={TEXT.egoList} />
          <DataTable
            x={tableX}
            y={top}
            columns={TEXT.egoColumns}
            rows={[[TEXT.typedAge, TEXT.trueValue]]}
            reveal={(_, cell) => smooth(segment(t, 1.0 + cell * 0.7, 0.4))}
            colWidth={130}
          />
          <Chip
            x={tableX + 130}
            y={top + 130}
            text={TEXT.egoRow}
            size={13}
            k={backOut(segment(t, 2.6, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/* ---------------------------------------------------------- edge form */

const PAIR_Y = STAGE.y + 64;
const EDGE_CARD = {
  x: STAGE_CENTER_X - 200,
  y: STAGE.y + 126,
  width: 400,
  height: 130,
} as const;

/**
 * The edge form: the two nodes an edge joins, above the form. After Next, a
 * node in the same place in the next edge stays; the other leaves, the next
 * one arrives from above, and the edge is drawn again from the first node.
 */
export const EdgeFormIntroScene = defineScene(5.8, ({ t }) => {
  const typed = TEXT.typedKnown.slice(
    0,
    Math.round(TEXT.typedKnown.length * segment(t, 0.9, 0.9)),
  );
  const change = smooth(segment(t, 3.3, 0.7));
  const leaving = smooth(segment(t, 3.3, 0.35));
  const arriving = smooth(segment(t, 3.6, 0.45));
  const drawn = smooth(segment(t, 3.9, 0.4));
  const gap = 220;
  const leftX = STAGE_CENTER_X - gap / 2;
  const rightX = STAGE_CENTER_X + gap / 2;
  const after = t >= 3.3;
  const barLeft = leftX + 32;
  const barWidth = gap - 64;
  const barShown = after ? (t < 3.9 ? 1 - leaving : drawn) : 1;
  return {
    rail: { progress: lerp(0.6, 0.66, change), press: pressAt(t, [3.1]) },
    body: (
      <>
        <rect
          x={barLeft}
          y={PAIR_Y - 5}
          width={barWidth * barShown}
          height={10}
          className="fill-edge-1"
        />
        <PersonNode x={leftX} y={PAIR_Y} r={38} label={SAM} k={1} />
        {leaving < 1 ? (
          <g opacity={1 - leaving}>
            <PersonNode
              x={rightX}
              y={PAIR_Y}
              r={38}
              label={ANA}
              k={1 - leaving * 0.3}
            />
          </g>
        ) : null}
        {after && arriving > 0 ? (
          <g opacity={arriving}>
            <PersonNode
              x={rightX}
              y={PAIR_Y - (1 - arriving) * 40}
              r={38}
              label={JO}
              k={0.85 + arriving * 0.15}
            />
          </g>
        ) : null}
        <Card
          x={EDGE_CARD.x}
          y={EDGE_CARD.y}
          width={EDGE_CARD.width}
          height={EDGE_CARD.height}
        />
        <Label x={EDGE_CARD.x + 28} y={EDGE_CARD.y + 38} text={TEXT.known} />
        <TextBox
          x={EDGE_CARD.x + 28}
          y={EDGE_CARD.y + 52}
          width={EDGE_CARD.width - 56}
          text={after ? '' : typed}
          caret={t >= 0.9 && t < 2.0}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: [EDGE_CARD.x + 120, EDGE_CARD.y + 72], at: 0.8 },
          { to: NEXT_BUTTON, at: 3.1 },
        ]}
        leave={3.6}
      />
    ),
  };
});

/** Each edge's answers fill a new column of the edge list. */
export const EdgeFormDataScene = defineScene(
  4.6,
  ({ t }) => {
    const rows = [
      [SAM, ANA, TEXT.knows, '5 years'],
      [ANA, JO, TEXT.knows, '2 years'],
      [JO, KAI, TEXT.knows, '10 years'],
    ] as const;
    const x = CONTENT.x + 130;
    const y = CONTENT.y + 70;
    return {
      body: (
        <>
          <Heading x={x} y={CONTENT.y + 44} text={TEXT.edgeList} />
          <DataTable
            x={x}
            y={y}
            columns={TEXT.edgeColumns}
            rows={rows}
            reveal={(row, cell) =>
              cell < 3
                ? smooth(segment(t, 0.2 + row * 0.15, 0.4))
                : smooth(segment(t, 1.4 + row * 0.6, 0.4))
            }
          />
          <Chip
            x={x + 385}
            y={y + 190}
            text={TEXT.fromForm}
            size={13}
            k={backOut(segment(t, 1.3, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/** One form for each edge of the type, and none for pairs with no edge. */
export const EdgeFormSourceScene = defineScene(
  5.2,
  ({ t }) => {
    const c: Point = [CONTENT.x + 230, CONTENT.y + 200];
    const nodes: Record<string, Point> = {
      [SAM]: [c[0] - 110, c[1] - 90],
      [ANA]: [c[0] + 110, c[1] - 90],
      [JO]: [c[0] + 110, c[1] + 90],
      [KAI]: [c[0] - 110, c[1] + 90],
    };
    const edges: readonly (readonly [string, string])[] = [
      [SAM, ANA],
      [ANA, JO],
      [JO, KAI],
    ];
    const current = t < 0.8 ? -1 : Math.min(2, Math.floor((t - 0.8) / 1.0));
    const missing = smooth(segment(t, 3.9, 0.4));
    const at = (name: string): Point => nodes[name] ?? c;
    const sam = at(SAM);
    const kai = at(KAI);
    return {
      body: (
        <>
          {edges.map(([a, b], i) => {
            const [x1, y1] = at(a);
            const [x2, y2] = at(b);
            return (
              <line
                key={`${a}-${b}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-edge-1"
                strokeWidth={i === current ? 12 : 6}
                opacity={current === -1 || i === current ? 1 : 0.45}
                strokeLinecap="round"
              />
            );
          })}
          <line
            x1={sam[0]}
            y1={sam[1]}
            x2={kai[0]}
            y2={kai[1]}
            className="stroke-white/40"
            strokeWidth={4}
            strokeDasharray="8 10"
            opacity={missing}
          />
          {Object.entries(nodes).map(([name, [x, y]]) => (
            <PersonNode key={name} x={x} y={y} r={32} label={name} k={1} />
          ))}
          <Chip
            x={CONTENT.x + 530}
            y={CONTENT.y + 140}
            text={TEXT.oneForm}
            size={14}
            k={backOut(segment(t, 0.6, 0.4))}
          />
          {current >= 0 ? (
            <Chip
              x={CONTENT.x + 530}
              y={CONTENT.y + 190}
              text={TEXT.ofThree[current] ?? ''}
              size={18}
              fill="fill-sea-green"
              ink="fill-white"
              k={1}
            />
          ) : null}
          <Chip
            x={CONTENT.x + 530}
            y={CONTENT.y + 270}
            text={TEXT.noEdge}
            size={14}
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 4.1, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Interview network' },
);

/* --------------------------------------------------------- dyad census */

const DYAD_Y = STAGE.y + 110;
const DYAD_CARD = {
  x: STAGE_CENTER_X - 190,
  y: STAGE.y + 200,
  width: 380,
  height: 120,
} as const;
const YES_AT: Point = [DYAD_CARD.x + 75 + 55, DYAD_CARD.y + 94];
const NO_AT: Point = [DYAD_CARD.x + 75 + 124 + 55, DYAD_CARD.y + 94];

function DyadCard({
  question,
  chosen,
}: {
  question: string;
  chosen: 'yes' | 'no' | undefined;
}) {
  return (
    <>
      <Card
        x={DYAD_CARD.x}
        y={DYAD_CARD.y}
        width={DYAD_CARD.width}
        height={DYAD_CARD.height}
      />
      <text
        x={STAGE_CENTER_X}
        y={DYAD_CARD.y + 42}
        textAnchor="middle"
        fontSize={19}
        fontWeight={600}
        className="fill-white"
      >
        {question}
      </text>
      <YesNo x={DYAD_CARD.x + 75} y={DYAD_CARD.y + 74} chosen={chosen} />
    </>
  );
}

type DyadPair = Readonly<{
  from: string;
  to: string;
  /** When the pair arrives, sliding up from below. */
  enter: number;
  /** When it leaves, sliding up and out. */
  leave: number;
  answer?: 'yes' | 'no';
  answerAt?: number;
  /** The pair already has the edge when it arrives. */
  existing?: boolean;
  edge?: string;
}>;

/** A run of pairs, each answered and replaced by the next. */
function DyadPairs({ t, pairs }: { t: number; pairs: readonly DyadPair[] }) {
  return (
    <>
      {pairs.map((pair) => {
        const enter = pair.enter <= 0 ? 1 : smooth(segment(t, pair.enter, 0.5));
        const leave = smooth(segment(t, pair.leave, 0.4));
        if (enter <= 0 || leave >= 1) return null;
        const answered =
          pair.answerAt !== undefined && t >= pair.answerAt
            ? pair.answer
            : undefined;
        const fill =
          answered === 'yes'
            ? pair.existing
              ? 1
              : smooth(segment(t, pair.answerAt ?? 0, 0.4))
            : answered === 'no'
              ? pair.existing
                ? 1 - smooth(segment(t, pair.answerAt ?? 0, 0.4))
                : 0
              : pair.existing
                ? 1
                : 0;
        const y = DYAD_Y + (1 - enter) * 120 - leave * 120;
        return (
          <g key={`${pair.from}-${pair.to}`} opacity={enter * (1 - leave)}>
            <JoinedNodes
              centre={[STAGE_CENTER_X, y]}
              from={pair.from}
              to={pair.to}
              fill={fill}
              edge={pair.edge}
            />
          </g>
        );
      })}
    </>
  );
}

function chosenAt(t: number, pairs: readonly DyadPair[]) {
  const current = pairs.findLast((p) => t >= p.enter);
  if (current === undefined) return undefined;
  if (current.answerAt !== undefined && t >= current.answerAt) {
    return current.answer;
  }
  return current.existing ? 'yes' : undefined;
}

/** Pairs in turn: yes fills the edge between them, no leaves it empty. */
export const DyadCensusIntroScene = defineScene(6.0, ({ t }) => {
  const pairs: readonly DyadPair[] = [
    { from: SAM, to: ANA, enter: 0, leave: 1.9, answer: 'yes', answerAt: 1.2 },
    { from: SAM, to: JO, enter: 2.0, leave: 4.1, answer: 'no', answerAt: 3.5 },
    { from: ANA, to: JO, enter: 4.2, leave: 99 },
  ];
  return {
    rail: { progress: t < 2 ? 0.7 : t < 4.2 ? 0.72 : 0.74 },
    body: (
      <>
        <DyadPairs t={t} pairs={pairs} />
        <DyadCard question={TEXT.censusQuestion} chosen={chosenAt(t, pairs)} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: YES_AT, at: 1.2 },
          { to: NO_AT, at: 3.5 },
        ]}
        leave={4.0}
      />
    ),
  };
});

/** A pair already joined arrives with Yes chosen; No removes the edge. */
export const DyadCensusExistingScene = defineScene(4.6, ({ t }) => {
  const pairs: readonly DyadPair[] = [
    {
      from: SAM,
      to: ANA,
      enter: 0,
      leave: 99,
      existing: true,
      answer: 'no',
      answerAt: 2.4,
    },
  ];
  return {
    rail: { progress: 0.7 },
    body: (
      <>
        <DyadPairs t={t} pairs={pairs} />
        <DyadCard question={TEXT.censusQuestion} chosen={chosenAt(t, pairs)} />
        <Chip
          x={STAGE_CENTER_X}
          y={DYAD_Y - 72}
          text={TEXT.already}
          size={13}
          k={backOut(segment(t, 0.6, 0.4)) * (1 - smooth(segment(t, 2.4, 0.3)))}
        />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: NO_AT, at: 2.4 }]} leave={3.0} />,
  };
});

/** The next prompt starts again from the first pair, with its own edge. */
export const DyadCensusPromptsScene = defineScene(5.6, ({ t }) => {
  const second = t >= 1.9;
  const pairs: readonly DyadPair[] = [
    { from: ANA, to: JO, enter: 0, leave: 1.8, answer: 'yes', answerAt: 0.9 },
    {
      from: SAM,
      to: ANA,
      enter: 1.9,
      leave: 99,
      answer: 'yes',
      answerAt: 3.6,
      edge: 'fill-edge-2',
    },
  ];
  return {
    rail: { progress: second ? 0.76 : 0.74 },
    body: (
      <>
        <PromptPips count={2} current={second ? 1 : 0} y={STAGE.y + 26} />
        <DyadPairs t={t} pairs={pairs} />
        <DyadCard
          question={second ? TEXT.censusWork : TEXT.censusQuestion}
          chosen={chosenAt(t, pairs)}
        />
        <Chip
          x={STAGE_CENTER_X}
          y={DYAD_CARD.y - 24}
          text={TEXT.secondPrompt}
          size={13}
          k={backOut(segment(t, 2.3, 0.4))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: YES_AT, at: 0.9 },
          { to: YES_AT, at: 3.6 },
        ]}
        leave={4.1}
      />
    ),
  };
});

/** Each yes becomes a row of the edge list; a no adds nothing. */
export const DyadCensusDataScene = defineScene(
  4.8,
  ({ t }) => {
    const answers = [
      { from: SAM, to: ANA, yes: true },
      { from: SAM, to: JO, yes: false },
      { from: ANA, to: JO, yes: true },
    ];
    const left = CONTENT.x + 30;
    const tableX = CONTENT.x + 380;
    const top = CONTENT.y + 70;
    const yesRows = answers.filter((a) => a.yes);
    return {
      body: (
        <>
          <Heading x={left} y={CONTENT.y + 44} text={TEXT.answered} />
          {answers.map((a, i) => {
            const y = top + 40 + i * 92;
            const k = backOut(segment(t, 0.2 + i * 0.15, 0.4));
            return (
              <g key={`${a.from}-${a.to}`} opacity={Math.min(1, k)}>
                <JoinedNodes
                  centre={[left + 110, y]}
                  from={a.from}
                  to={a.to}
                  gap={130}
                  r={26}
                  fill={a.yes ? smooth(segment(t, 0.6 + i * 0.2, 0.4)) : 0}
                />
                <Chip
                  x={left + 260}
                  y={y}
                  text={a.yes ? TEXT.yes : TEXT.noEdgeRow}
                  size={13}
                  fill={a.yes ? 'fill-sea-green' : 'fill-white/20'}
                  ink="fill-white"
                  k={backOut(segment(t, 0.8 + i * 0.2, 0.4))}
                />
              </g>
            );
          })}
          <Heading x={tableX} y={CONTENT.y + 44} text={TEXT.edgeList} />
          <DataTable
            x={tableX}
            y={top}
            columns={TEXT.dyadColumns}
            rows={yesRows.map((a) => [a.from, a.to, TEXT.knows])}
            reveal={(row) => smooth(segment(t, 1.8 + row * 0.8, 0.4))}
            colWidth={95}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

function ring(count: number, centre: Point, radius: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return [centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius];
  });
}

function pairsOf(count: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) out.push([a, b]);
  }
  return out;
}

const FOUR = ['Sam', 'Ana', 'Jo', 'Kai'];
const SIX = ['Sam', 'Ana', 'Jo', 'Kai', 'Lin', 'Bo'];

/** How fast the pairs grow: 4 alters make 6 pairs, 6 make 15. */
export const DyadCensusPairsScene = defineScene(
  5.6,
  ({ t }) => {
    const groups = [
      {
        names: FOUR,
        centre: [CONTENT.x + 180, CONTENT.y + 160] as Point,
        start: 0.4,
        span: 1.8,
        label: TEXT.fourAlters,
      },
      {
        names: SIX,
        centre: [CONTENT.x + 510, CONTENT.y + 160] as Point,
        start: 2.6,
        span: 2.0,
        label: TEXT.sixAlters,
      },
    ];
    return {
      body: (
        <>
          {groups.map((g) => {
            const points = ring(g.names.length, g.centre, 92);
            const pairs = pairsOf(g.names.length);
            const step = g.span / pairs.length;
            return (
              <g key={g.label}>
                {pairs.map(([a, b], i) => {
                  const k = smooth(segment(t, g.start + i * step, step * 1.5));
                  const p = points[a] ?? g.centre;
                  const q = points[b] ?? g.centre;
                  if (k <= 0) return null;
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={p[0]}
                      y1={p[1]}
                      x2={lerp(p[0], q[0], k)}
                      y2={lerp(p[1], q[1], k)}
                      className="stroke-white/40"
                      strokeWidth={3}
                    />
                  );
                })}
                {g.names.map((name, i) => {
                  const p = points[i] ?? g.centre;
                  return (
                    <PersonNode
                      key={name}
                      x={p[0]}
                      y={p[1]}
                      r={24}
                      label={name}
                      k={backOut(segment(t, g.start - 0.3 + i * 0.05, 0.4))}
                    />
                  );
                })}
                <Chip
                  x={g.centre[0]}
                  y={CONTENT.bottom - 34}
                  text={g.label}
                  size={14}
                  k={backOut(segment(t, g.start + g.span, 0.4))}
                />
              </g>
            );
          })}
        </>
      ),
    };
  },
  { url: 'Pairs' },
);
