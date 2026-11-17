import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Chip,
  CONTENT,
  defineScene,
  lerp,
  PersonNode,
  pivot,
  smooth,
  TextBar,
  type Point,
} from './parts';

const TEXT = {
  addPerson: 'Add a person',
  movingOn: 'Trying to move on with no answer',
  accepted: 'Answer accepted',
  important: 'Who do you talk to about important things?',
  discuss: 'Who do you discuss important matters with?',
  work: 'Who do you work with?',
  study: 'Who do you study with?',
  lunch: 'Who do you have lunch with?',
  classmates: 'Your classmates',
  filter: 'Filter: class is 7B',
  name: 'What is their name?',
  required: ['You must answer this question', 'before continuing.'],
  saves: 'Saves',
  columns: ['name', 'relationship'],
  rowPerPerson: 'A row for each person',
  columnPerField: 'A column for each field',
  exported: 'Exported data',
  protocol: 'Protocol',
  rule: 'Show if: has a partner',
  hasPartner: 'Participant A: has a partner',
  noPartner: 'Participant B: no partner',
  stages: ['Information', 'This stage', 'Next stage', 'Finish'],
} as const;

const dataNodeY = (i: number) => CONTENT.y + 78 + i * 96;

const PEOPLE = [
  { name: 'Sam', relationship: 'Friend' },
  { name: 'Ana', relationship: 'Family' },
  { name: 'Jo', relationship: 'Work' },
] as const;

/**
 * Shows how a name generator's data is exported: each alter becomes a row, and
 * each question on the form becomes a column.
 */
export const NameGeneratorDataScene = defineScene(
  5.0,
  ({ t }) => {
    const nodeX = CONTENT.x + 110;
    const table = { x: 290, y: CONTENT.y + 56, width: 380, row: 52 };
    const colX = [table.x + 24, table.x + 200];
    const rowY = (i: number) => table.y + table.row * (i + 1);
    const header = backOut(segment(t, 0.5, 0.45));
    return {
      body: (
        <>
          {PEOPLE.map(({ name, relationship }, i) => {
            const at = 1.0 + i * 0.7;
            const fly = smooth(segment(t, at, 0.5));
            const from: Point = [nodeX, dataNodeY(i)];
            const to: Point = [colX[0] ?? 0, rowY(i) + table.row / 2];
            return (
              <g key={name}>
                <PersonNode
                  x={from[0]}
                  y={from[1]}
                  r={36}
                  label={name}
                  k={backOut(segment(t, 0.2 + i * 0.12, 0.4))}
                />
                <Chip
                  x={from[0] + 70}
                  y={from[1] + 30}
                  text={relationship}
                  size={13}
                  k={backOut(segment(t, 0.4 + i * 0.12, 0.4))}
                />
                {fly > 0 && fly < 1 ? (
                  <circle
                    cx={lerp(from[0], to[0], fly)}
                    cy={
                      lerp(from[1], to[1], fly) - Math.sin(Math.PI * fly) * 40
                    }
                    r={lerp(14, 6, fly)}
                    className="fill-neon-coral"
                  />
                ) : null}
                <g opacity={segment(t, at + 0.45, 0.25)}>
                  <rect
                    x={table.x}
                    y={rowY(i)}
                    width={table.width}
                    height={table.row}
                    className={i % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
                  />
                  <text
                    x={colX[0]}
                    y={rowY(i) + 33}
                    fontSize={20}
                    fontWeight={700}
                    className="fill-white"
                  >
                    {name}
                  </text>
                  <text
                    x={colX[1]}
                    y={rowY(i) + 33}
                    fontSize={20}
                    fontWeight={700}
                    className="fill-white"
                  >
                    {relationship}
                  </text>
                </g>
              </g>
            );
          })}
          <g opacity={header}>
            <rect
              x={table.x}
              y={table.y}
              width={table.width}
              height={table.row}
              rx={10}
              className="fill-cyber-grape"
            />
            {TEXT.columns.map((column, i) => (
              <text
                key={column}
                x={colX[i]}
                y={table.y + 33}
                fontSize={20}
                fontWeight={900}
                className="fill-mustard"
              >
                {column}
              </text>
            ))}
          </g>
        </>
      ),
      overlay: (
        <>
          <Chip
            x={table.x + table.width / 2}
            y={table.y - 26}
            text={TEXT.columnPerField}
            size={15}
            outlined
            k={backOut(segment(t, 3.4, 0.45))}
          />
          <Chip
            x={table.x + table.width / 2}
            y={rowY(3) + 28}
            text={TEXT.rowPerPerson}
            size={15}
            outlined
            k={backOut(segment(t, 3.8, 0.45))}
          />
        </>
      ),
    };
  },
  { url: TEXT.exported },
);

/**
 * Shows skip logic on a protocol's stages: the interview visits this stage for
 * a participant who has a partner, and goes straight past it to the next stage
 * for a participant who does not.
 */
export const NameGeneratorSkipLogicScene = defineScene(
  5.8,
  ({ t }) => {
    const CARD = { width: 140, height: 150, gap: 28 };
    const startX =
      CONTENT.x +
      (CONTENT.right - CONTENT.x - (CARD.width * 4 + CARD.gap * 3)) / 2;
    const cardX = (i: number) => startX + i * (CARD.width + CARD.gap);
    const cardY = CONTENT.y + 96;
    const centre = (i: number) => cardX(i) + CARD.width / 2;
    const lineY = cardY + CARD.height + 44;
    const runs = [
      { at: 0.7, visits: [0, 1, 2, 3], label: TEXT.hasPartner },
      { at: 3.2, visits: [0, 2, 3], label: TEXT.noPartner },
    ];
    const second = t >= 3.0;
    const run = runs[second ? 1 : 0] ?? runs[0];
    const step = 0.6;
    const progress = (t - (run?.at ?? 0)) / step;
    const index = Math.max(
      0,
      Math.min((run?.visits.length ?? 1) - 1, progress),
    );
    const from = run?.visits[Math.floor(index)] ?? 0;
    const to =
      run?.visits[
        Math.min(Math.floor(index) + 1, (run?.visits.length ?? 1) - 1)
      ] ?? 0;
    const k = smooth(index - Math.floor(index));
    const skipping = from === 0 && to === 2;
    const dot: Point = [
      lerp(centre(from), centre(to), k),
      lineY + (skipping ? Math.sin(Math.PI * k) * 30 : 0),
    ];
    const here = progress >= 0 ? (run?.visits[Math.round(index)] ?? -1) : -1;
    const fade = second ? smooth(segment(t, 3.0, 0.3)) : 0;
    return {
      body: (
        <>
          <Chip
            x={CONTENT.x + (CONTENT.right - CONTENT.x) / 2}
            y={CONTENT.y + 34}
            text={run?.label ?? ''}
            size={17}
            fill={second ? 'fill-slate-blue' : 'fill-sea-green'}
            ink="fill-white"
            k={backOut(segment(t, second ? 3.0 : 0.2, 0.4))}
          />
          <line
            x1={centre(0)}
            y1={lineY}
            x2={centre(3)}
            y2={lineY}
            className="stroke-white/20"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={1 - fade}
          />
          <path
            d={`M${centre(0)} ${lineY} Q${centre(1)} ${lineY + 60} ${centre(2)} ${lineY}`}
            className="stroke-white/40"
            fill="none"
            strokeWidth={5}
            strokeDasharray="10 10"
            opacity={fade}
          />
          <line
            x1={centre(2)}
            y1={lineY}
            x2={centre(3)}
            y2={lineY}
            className="stroke-white/20"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={fade}
          />
          {TEXT.stages.map((stage, i) => {
            const isStage = i === 1;
            const pop = backOut(segment(t, 0.1 + i * 0.08, 0.4));
            return (
              <g
                key={stage}
                transform={pivot(centre(i), cardY + CARD.height / 2, pop)}
                opacity={isStage ? 1 - fade * 0.65 : 1}
              >
                <rect
                  x={cardX(i)}
                  y={cardY}
                  width={CARD.width}
                  height={CARD.height}
                  rx={16}
                  className={cx(
                    'fill-cyber-grape',
                    here === i
                      ? 'stroke-sea-green'
                      : isStage
                        ? 'stroke-mustard'
                        : 'stroke-white/20',
                  )}
                  strokeWidth={here === i ? 6 : 4}
                />
                <TextBar
                  x={cardX(i) + 24}
                  y={cardY + 40}
                  width={CARD.width - 48}
                  className="stroke-white/25"
                />
                <TextBar
                  x={cardX(i) + 24}
                  y={cardY + 64}
                  width={CARD.width - 80}
                  className="stroke-white/15"
                />
                <text
                  x={centre(i)}
                  y={cardY + CARD.height - 24}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={800}
                  className="fill-white"
                >
                  {stage}
                </text>
                <circle
                  cx={centre(i)}
                  cy={lineY}
                  r={9}
                  className="fill-white/40"
                />
              </g>
            );
          })}
          <Chip
            x={centre(1)}
            y={cardY - 22}
            text={TEXT.rule}
            size={13}
            k={backOut(segment(t, 0.4, 0.4))}
          />
          {progress >= -0.5 ? (
            <circle
              cx={dot[0]}
              cy={dot[1]}
              r={14}
              className="fill-neon-coral stroke-white"
              strokeWidth={4}
            />
          ) : null}
        </>
      ),
    };
  },
  { url: TEXT.protocol },
);
