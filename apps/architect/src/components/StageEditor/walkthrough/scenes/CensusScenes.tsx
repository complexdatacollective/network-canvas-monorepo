import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Card,
  DataTable,
  DyadPairs,
  DYAD_Y,
  Heading,
  JoinedNodes,
  type DyadPair,
} from './InterpreterScenes';
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
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type Point,
} from './parts';

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';
const KAI = 'Kai';
const LIN = 'Lin';

const TEXT = {
  closeness: 'How close are these two?',
  scale: ['Not close', 'Close', 'Very close'],
  decline: 'No tie',
  values: ['1', '2', '3'],
  declineChip: 'Decline option',
  already: 'Already connected: Close',
  answered: 'Answers',
  edgeList: 'Edge list',
  columns: ['from', 'to', 'type', 'closeness'],
  knows: 'knows',
  noRow: 'No tie: no edge',
  focalQuestion: 'Which of these people does Sam know?',
  focalQuestionAna: 'Which of these people does Ana know?',
  oneToManyColumns: ['from', 'to', 'type'],
  tapped: 'Tapped',
  removeMode: 'Remove them from the list',
  keepMode: 'Keep them in the list',
} as const;

/* ------------------------------------------------- tie-strength census */

const SCALE_CARD = {
  x: STAGE_CENTER_X - 280,
  y: STAGE.y + 200,
  width: 560,
  height: 120,
} as const;
const OPTION = { width: 124, height: 40, gap: 10 } as const;
const OPTIONS_X = STAGE_CENTER_X - (4 * OPTION.width + 3 * OPTION.gap) / 2;
const OPTIONS_Y = SCALE_CARD.y + 66;

/** Where the participant clicks to choose option `i`; 3 is the decline. */
const optionAt = (i: number): Point => [
  OPTIONS_X + i * (OPTION.width + OPTION.gap) + OPTION.width / 2,
  OPTIONS_Y + OPTION.height / 2,
];

/**
 * The scale's options as the interview draws them: a horizontal row of
 * bordered cards with a radio dot, in the attribute's order, the decline
 * option last. The chosen card's border and dot take the primary color.
 */
function ScaleOptions({
  chosen,
  reveal = () => 1,
}: {
  chosen: number | undefined;
  reveal?: (i: number) => number;
}) {
  const labels = [...TEXT.scale, TEXT.decline];
  return (
    <>
      {labels.map((label, i) => {
        const k = reveal(i);
        if (k <= 0) return null;
        const left = OPTIONS_X + i * (OPTION.width + OPTION.gap);
        const picked = chosen === i;
        const dot: Point = [left + 22, OPTIONS_Y + OPTION.height / 2];
        return (
          <g
            key={label}
            opacity={Math.min(1, k)}
            transform={`translate(0 ${(1 - Math.min(1, k)) * 14})`}
          >
            <rect
              x={left}
              y={OPTIONS_Y}
              width={OPTION.width}
              height={OPTION.height}
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
              x={left + 38}
              y={OPTIONS_Y + 26}
              fontSize={15}
              fontWeight={700}
              className="fill-white"
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

function ScaleCard({
  chosen,
  reveal,
}: {
  chosen: number | undefined;
  reveal?: (i: number) => number;
}) {
  return (
    <>
      <Card
        x={SCALE_CARD.x}
        y={SCALE_CARD.y}
        width={SCALE_CARD.width}
        height={SCALE_CARD.height}
      />
      <text
        x={STAGE_CENTER_X}
        y={SCALE_CARD.y + 40}
        textAnchor="middle"
        fontSize={19}
        fontWeight={600}
        className="fill-white"
      >
        {TEXT.closeness}
      </text>
      <ScaleOptions chosen={chosen} reveal={reveal} />
    </>
  );
}

type Rated = Readonly<{
  pair: DyadPair;
  /** The option chosen, 3 for the decline. */
  option?: number;
  /** The option already chosen when the pair arrives. */
  preset?: number;
}>;

const DECLINE = 3;

const toPair = ({ pair, option }: Rated): DyadPair =>
  option === undefined
    ? pair
    : { ...pair, answer: option === DECLINE ? 'no' : 'yes' };

function chosenOption(t: number, rated: readonly Rated[]) {
  const current = rated.findLast((r) => t >= r.pair.enter);
  if (current === undefined) return undefined;
  const { answerAt } = current.pair;
  if (answerAt !== undefined && t >= answerAt) return current.option;
  return current.preset;
}

/** Pairs in turn: a point on the scale fills the edge, the decline does not. */
export const TieStrengthIntroScene = defineScene(6.0, ({ t }) => {
  const rated: readonly Rated[] = [
    {
      pair: { from: SAM, to: ANA, enter: 0, leave: 1.9, answerAt: 1.2 },
      option: 1,
    },
    {
      pair: { from: SAM, to: JO, enter: 2.0, leave: 4.1, answerAt: 3.5 },
      option: DECLINE,
    },
    { pair: { from: ANA, to: JO, enter: 4.2, leave: 99 } },
  ];
  return {
    rail: { progress: t < 2 ? 0.7 : t < 4.2 ? 0.72 : 0.74 },
    body: (
      <>
        <DyadPairs t={t} pairs={rated.map(toPair)} />
        <ScaleCard chosen={chosenOption(t, rated)} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: optionAt(1), at: 1.2 },
          { to: optionAt(DECLINE), at: 3.5 },
        ]}
        leave={4.0}
      />
    ),
  };
});

/** The attribute's values become the options, in order, the decline last. */
export const TieStrengthScaleScene = defineScene(5.0, ({ t }) => {
  const reveal = (i: number) => backOut(segment(t, 0.5 + i * 0.45, 0.4));
  const pair: DyadPair = {
    from: SAM,
    to: KAI,
    enter: 0,
    leave: 99,
    answer: 'yes',
    answerAt: 3.9,
  };
  return {
    rail: { progress: 0.7 },
    body: (
      <>
        <DyadPairs t={t} pairs={[pair]} />
        <ScaleCard chosen={t >= 3.9 ? 2 : undefined} reveal={reveal} />
        {TEXT.values.map((value, i) => {
          const [x] = optionAt(i);
          return (
            <Chip
              key={value}
              x={x}
              y={OPTIONS_Y + OPTION.height + 26}
              text={value}
              size={12}
              k={backOut(segment(t, 0.8 + i * 0.45, 0.4))}
            />
          );
        })}
        <Chip
          x={optionAt(DECLINE)[0]}
          y={OPTIONS_Y + OPTION.height + 26}
          text={TEXT.declineChip}
          size={12}
          fill="fill-white/20"
          ink="fill-white"
          k={backOut(segment(t, 2.2, 0.4))}
        />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: optionAt(2), at: 3.9 }]} leave={4.4} />,
  };
});

/** A pair already rated arrives with its point chosen; the decline removes it. */
export const TieStrengthDeclineScene = defineScene(4.6, ({ t }) => {
  const rated: readonly Rated[] = [
    {
      pair: {
        from: SAM,
        to: ANA,
        enter: 0,
        leave: 99,
        existing: true,
        answerAt: 2.4,
      },
      option: DECLINE,
      preset: 1,
    },
  ];
  return {
    rail: { progress: 0.7 },
    body: (
      <>
        <DyadPairs t={t} pairs={rated.map(toPair)} />
        <ScaleCard chosen={chosenOption(t, rated)} />
        <Chip
          x={STAGE_CENTER_X}
          y={DYAD_Y - 72}
          text={TEXT.already}
          size={13}
          k={backOut(segment(t, 0.6, 0.4)) * (1 - smooth(segment(t, 2.4, 0.3)))}
        />
      </>
    ),
    overlay: (
      <Click t={t} stops={[{ to: optionAt(DECLINE), at: 2.4 }]} leave={3.0} />
    ),
  };
});

/** Each rated pair becomes a row with the value chosen; the decline adds none. */
export const TieStrengthDataScene = defineScene(
  4.8,
  ({ t }) => {
    const answers = [
      { from: SAM, to: ANA, option: 1 },
      { from: SAM, to: JO, option: DECLINE },
      { from: ANA, to: JO, option: 2 },
    ];
    const left = CONTENT.x + 30;
    const tableX = CONTENT.x + 340;
    const top = CONTENT.y + 70;
    const edges = answers.filter((a) => a.option !== DECLINE);
    return {
      body: (
        <>
          <Heading x={left} y={CONTENT.y + 44} text={TEXT.answered} />
          {answers.map((a, i) => {
            const y = top + 40 + i * 92;
            const k = backOut(segment(t, 0.2 + i * 0.15, 0.4));
            const declined = a.option === DECLINE;
            return (
              <g key={`${a.from}-${a.to}`} opacity={Math.min(1, k)}>
                <JoinedNodes
                  centre={[left + 100, y]}
                  from={a.from}
                  to={a.to}
                  gap={120}
                  r={24}
                  fill={declined ? 0 : smooth(segment(t, 0.6 + i * 0.2, 0.4))}
                />
                <Chip
                  x={left + 240}
                  y={y}
                  text={
                    declined
                      ? TEXT.noRow
                      : (TEXT.scale[a.option] ?? TEXT.decline)
                  }
                  size={13}
                  fill={declined ? 'fill-white/20' : 'fill-sea-green'}
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
            columns={TEXT.columns}
            rows={edges.map((a) => [
              a.from,
              a.to,
              TEXT.knows,
              TEXT.values[a.option] ?? '',
            ])}
            reveal={(row, cell) =>
              smooth(segment(t, 1.8 + row * 0.8 + (cell === 3 ? 0.3 : 0), 0.4))
            }
            colWidth={86}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/* ------------------------------------------- one to many dyad census */

const FOCAL: Point = [STAGE_CENTER_X, STAGE.y + 132];
const LIST = {
  x: STAGE_CENTER_X - 240,
  y: STAGE.y + 204,
  width: 480,
  height: 130,
} as const;
const TARGET_R = 28;

/** Where target `i` of `count` sits in the list below the focal node. */
const targetAt = (i: number, count: number): Point => [
  STAGE_CENTER_X + (i - (count - 1) / 2) * 92,
  LIST.y + LIST.height / 2,
];

/** A node in the target list, with the white ring of a selected one. */
function Target({
  at,
  label,
  selected,
  k = 1,
}: {
  at: Point;
  label: string;
  /** 0 to 1, the ring arriving. */
  selected: number;
  k?: number;
}) {
  if (k <= 0) return null;
  return (
    <g opacity={Math.min(1, k)}>
      {selected > 0 ? (
        <circle
          cx={at[0]}
          cy={at[1]}
          r={TARGET_R + 5 * backOut(selected)}
          className="fill-white"
        />
      ) : null}
      <PersonNode x={at[0]} y={at[1]} r={TARGET_R} label={label} k={1} />
    </g>
  );
}

function TargetPanel() {
  return (
    <rect
      x={LIST.x}
      y={LIST.y}
      width={LIST.width}
      height={LIST.height}
      rx={20}
      className="fill-cyber-grape"
    />
  );
}

/**
 * One focal node above the others: the participant taps each one the
 * question applies to, then Next brings the next focal node, without the
 * one just considered.
 */
export const OneToManyIntroScene = defineScene(6.4, ({ t }) => {
  const turn = smooth(segment(t, 3.6, 0.6));
  const first = [ANA, JO, KAI, LIN];
  const second = [JO, KAI, LIN];
  const taps: Record<string, number> = { [ANA]: 1.0, [KAI]: 1.8 };
  const secondTaps: Record<string, number> = { [JO]: 5.0 };
  return {
    rail: { progress: t < 3.6 ? 0.6 : 0.62, press: pressAt(t, [3.3]) },
    body: (
      <>
        <g opacity={1 - turn}>
          <Prompt text={TEXT.focalQuestion} y={STAGE.y + 50} size={22} />
          <PersonNode x={FOCAL[0]} y={FOCAL[1]} label={SAM} k={1} r={42} />
        </g>
        <g opacity={turn}>
          <Prompt text={TEXT.focalQuestionAna} y={STAGE.y + 50} size={22} />
          <PersonNode x={FOCAL[0]} y={FOCAL[1]} label={ANA} k={1} r={42} />
        </g>
        <TargetPanel />
        {(turn < 0.5 ? first : second).map((label, i, list) => {
          const at = targetAt(i, list.length);
          const tapAt = (turn < 0.5 ? taps : secondTaps)[label];
          const ring = tapAt === undefined ? 0 : smooth(segment(t, tapAt, 0.3));
          return (
            <Target
              key={label}
              at={at}
              label={label}
              selected={ring}
              k={turn < 0.5 ? 1 - turn * 2 : turn * 2 - 1}
            />
          );
        })}
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: targetAt(0, 4), at: 1.0 },
          { to: targetAt(2, 4), at: 1.8 },
          { to: NEXT_BUTTON, at: 3.3 },
          { to: targetAt(0, 3), at: 5.0 },
        ]}
        leave={5.6}
      />
    ),
  };
});

/** Each alter tapped becomes a row of the edge list, from the focal node. */
export const OneToManyDataScene = defineScene(
  4.6,
  ({ t }) => {
    const focal: Point = [CONTENT.x + 160, CONTENT.y + 120];
    const tapped = [
      { label: ANA, at: [CONTENT.x + 70, CONTENT.y + 290] as Point },
      { label: KAI, at: [CONTENT.x + 250, CONTENT.y + 290] as Point },
    ];
    const tableX = CONTENT.x + 360;
    const top = CONTENT.y + 70;
    return {
      body: (
        <>
          <Heading x={CONTENT.x + 30} y={CONTENT.y + 44} text={TEXT.tapped} />
          {tapped.map((n, i) => {
            const k = smooth(segment(t, 0.6 + i * 0.5, 0.5));
            return (
              <line
                key={n.label}
                x1={focal[0]}
                y1={focal[1]}
                x2={lerp(focal[0], n.at[0], k)}
                y2={lerp(focal[1], n.at[1], k)}
                className="stroke-edge-1"
                strokeWidth={8}
                strokeLinecap="round"
                opacity={k > 0 ? 1 : 0}
              />
            );
          })}
          <PersonNode x={focal[0]} y={focal[1]} label={SAM} k={1} r={36} />
          {tapped.map((n, i) => (
            <PersonNode
              key={n.label}
              x={n.at[0]}
              y={n.at[1]}
              label={n.label}
              r={30}
              k={backOut(segment(t, 0.2 + i * 0.15, 0.4))}
            />
          ))}
          <Heading x={tableX} y={CONTENT.y + 44} text={TEXT.edgeList} />
          <DataTable
            x={tableX}
            y={top}
            columns={TEXT.oneToManyColumns}
            rows={tapped.map((n) => [SAM, n.label, TEXT.knows])}
            reveal={(row) => smooth(segment(t, 1.4 + row * 0.6, 0.4))}
            colWidth={100}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/**
 * The two removal behaviors side by side: removed, each turn's list is
 * shorter; kept, every alter is listed on every turn.
 */
export const OneToManyRemoveScene = defineScene(
  6.0,
  ({ t }) => {
    const names = [SAM, ANA, JO, KAI];
    const width = (CONTENT.right - CONTENT.x) / 2;
    const columns = [
      { x: CONTENT.x + width / 2, label: TEXT.removeMode, remove: true },
      { x: CONTENT.x + width * 1.5, label: TEXT.keepMode, remove: false },
    ];
    const turnLength = 1.6;
    const turn = Math.min(2, Math.floor(Math.max(0, t - 0.6) / turnLength));
    const within = segment(t - 0.6 - turn * turnLength, 0, 0.4);
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
          {columns.map((c) => {
            const focal = names[turn] ?? SAM;
            const others = names.filter(
              (n, i) => n !== focal && (!c.remove || i > turn),
            );
            const listWidth = 280;
            const listY = CONTENT.y + 200;
            return (
              <g key={c.label}>
                <Chip x={c.x} y={CONTENT.y + 30} text={c.label} size={14} />
                <g opacity={smooth(within)}>
                  <PersonNode
                    x={c.x}
                    y={CONTENT.y + 110}
                    label={focal}
                    k={1}
                    r={34}
                  />
                  <rect
                    x={c.x - listWidth / 2}
                    y={listY}
                    width={listWidth}
                    height={110}
                    rx={18}
                    className="fill-cyber-grape"
                  />
                  {others.map((n, i) => (
                    <PersonNode
                      key={n}
                      x={c.x + (i - (others.length - 1) / 2) * 70}
                      y={listY + 55}
                      label={n}
                      k={1}
                      r={24}
                    />
                  ))}
                </g>
              </g>
            );
          })}
        </>
      ),
    };
  },
  { url: 'Turns' },
);
