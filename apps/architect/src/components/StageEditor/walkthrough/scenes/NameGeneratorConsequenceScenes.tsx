import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { PANEL } from './NameGeneratorScenes';
import {
  AddButton,
  Chip,
  Click,
  CONTENT,
  defineScene,
  FORM_CARD,
  FormCard,
  lerp,
  NEXT_BUTTON,
  PersonNode,
  pivot,
  pressAt,
  Prompt,
  PromptPips,
  row,
  SidePanel,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  TextBox,
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

const ROW_Y = STAGE.y + 190;
const dataNodeY = (i: number) => CONTENT.y + 78 + i * 96;

const PEOPLE = [
  { name: 'Sam', relationship: 'Friend' },
  { name: 'Ana', relationship: 'Family' },
  { name: 'Jo', relationship: 'Work' },
] as const;

/**
 * What a name generator leaves in the data: each person becomes a row, and
 * each field of the form a column.
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

const CONTROLS = [
  {
    name: 'Text Input',
    question: 'What do they like to be called?',
    value: 'Sunny',
  },
  { name: 'Toggle', question: 'Do you live together?', value: 'true' },
  { name: 'Likert Scale', question: 'How close are you?', value: '4' },
] as const;
const PHASE = 2.2;

/**
 * The input control decides what the participant uses to answer, and so what
 * kind of answer the attribute records.
 */
/** The same question answered with different controls, on a form of any kind. */
export const FormFieldInputControlsScene = defineScene(
  CONTROLS.length * PHASE,
  ({ t }) => {
    const phase = Math.min(CONTROLS.length - 1, Math.floor(t / PHASE));
    const local = t - phase * PHASE;
    const control = CONTROLS[phase] ?? CONTROLS[0];
    const show =
      segment(local, 0.1, 0.3) * (1 - segment(local, PHASE - 0.3, 0.3));
    const answered = local >= 1.1;
    const left = FORM_CARD.x + 34;
    const width = FORM_CARD.width - 68;
    const controlY = FORM_CARD.y + 104;
    const toggleAt: Point = [left + 36, controlY + 21];
    const likert = (i: number): Point => [
      left + 20 + (i * (width - 40)) / 4,
      controlY + 21,
    ];
    const clickAt: Point | undefined =
      phase === 1 ? toggleAt : phase === 2 ? likert(3) : undefined;
    const knob = smooth(segment(local, 1.1, 0.25));
    return {
      rail: { progress: 0.3 },
      body: null,
      modal: (
        <FormCard submit={false} k={1}>
          <Chip
            x={FORM_CARD.x + FORM_CARD.width - 90}
            y={FORM_CARD.y + 36}
            text={control.name}
            size={14}
            k={backOut(segment(local, 0.1, 0.4))}
          />
          <g opacity={show}>
            <text
              x={left}
              y={FORM_CARD.y + 88}
              fontSize={18}
              fontWeight={700}
              className="fill-white"
            >
              {control.question}
            </text>
            {phase === 0 ? (
              <TextBox
                x={left}
                y={controlY}
                width={width}
                text={control.value.slice(
                  0,
                  Math.floor(segment(local, 0.6, 0.6) * control.value.length),
                )}
                caret={
                  local > 0.5 && local < 1.3 && Math.floor(local * 3) % 2 === 0
                }
              />
            ) : null}
            {phase === 1 ? (
              <g>
                <rect
                  x={left}
                  y={controlY + 3}
                  width={72}
                  height={36}
                  rx={18}
                  className={answered ? 'fill-sea-green' : 'fill-white/20'}
                />
                <circle
                  cx={lerp(left + 18, left + 54, knob)}
                  cy={controlY + 21}
                  r={14}
                  className="fill-white"
                />
              </g>
            ) : null}
            {phase === 2 ? (
              <g>
                <line
                  x1={likert(0)[0]}
                  y1={controlY + 21}
                  x2={likert(4)[0]}
                  y2={controlY + 21}
                  className="stroke-white/30"
                  strokeWidth={6}
                  strokeLinecap="round"
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <circle
                    key={i}
                    cx={likert(i)[0]}
                    cy={controlY + 21}
                    r={i === 3 && answered ? 14 : 9}
                    className={
                      i === 3 && answered
                        ? 'fill-sea-green stroke-white'
                        : 'fill-white'
                    }
                    strokeWidth={3}
                  />
                ))}
              </g>
            ) : null}
            <g opacity={segment(local, 1.3, 0.3)}>
              <text
                x={left}
                y={FORM_CARD.y + 196}
                fontSize={16}
                fontWeight={700}
                className="fill-white/70"
              >
                {TEXT.saves}
              </text>
              <Chip
                x={left + 60}
                y={FORM_CARD.y + 190}
                text={control.value}
                size={15}
                align="start"
                fill="fill-white"
              />
            </g>
          </g>
        </FormCard>
      ),
      overlay: clickAt ? (
        <Click
          t={local}
          from={[clickAt[0] + 140, clickAt[1] + 120]}
          stops={[{ to: clickAt, at: 1.0, glide: 0.5 }]}
          leave={1.4}
        />
      ) : null,
    };
  },
);

/**
 * A required question left empty: Done shows the form's own message, and the
 * form stays open until it is answered.
 */
export const FormFieldValidationScene = defineScene(4.8, ({ t }) => {
  const left = FORM_CARD.x + 34;
  const width = FORM_CARD.width - 68;
  const fieldY = FORM_CARD.y + 104;
  const field: Point = [left + width - 40, fieldY + 21];
  const tried = 1.8;
  const error = t >= tried + 0.1 && t < 2.9;
  const shake = segment(t, tried + 0.1, 0.5);
  const typed = 'Alex'.slice(0, Math.floor(segment(t, 2.9, 0.5) * 4));
  return {
    rail: { progress: 0.3 },
    body: null,
    modal: (
      <FormCard submit={false} k={backOut(segment(t, 0.65, 0.45))}>
        <Chip
          x={STAGE_CENTER_X}
          y={FORM_CARD.y + 40}
          text={t < 3.6 ? TEXT.movingOn : TEXT.accepted}
          size={14}
          k={backOut(segment(t, t < 3.6 ? tried - 0.3 : 3.6, 0.4))}
        />
        <text
          x={left}
          y={FORM_CARD.y + 88}
          fontSize={18}
          fontWeight={700}
          className="fill-white"
        >
          {TEXT.name}
        </text>
        <TextBox
          x={left}
          y={fieldY}
          width={width}
          text={typed}
          invalid={error}
          caret={t > 2.7 && t < 3.6 && Math.floor(t * 3) % 2 === 0}
        />
        {error ? (
          <g
            transform={`translate(${Math.sin(shake * Math.PI * 5) * 6 * (1 - shake)} 0)`}
          >
            <rect
              x={left}
              y={fieldY + 52}
              width={width}
              height={60}
              rx={6}
              className="fill-destructive"
            />
            {TEXT.required.map((line, i) => (
              <text
                key={line}
                x={left + 16}
                y={fieldY + 76 + i * 22}
                fontSize={16}
                fontWeight={600}
                className="fill-white"
              >
                {line}
              </text>
            ))}
          </g>
        ) : null}
      </FormCard>
    ),
    overlay: (
      <Click t={t} stops={[{ to: field, at: 2.7, glide: 0.5 }]} leave={4.0} />
    ),
  };
});

const TAGS = { first: 'discuss_matters', second: 'work_with' } as const;

/**
 * An additional attribute on each prompt marks the people named for it, so
 * the data says which question named whom.
 */
export const NameGeneratorAdditionalAttributesScene = defineScene(
  5.0,
  ({ t }) => {
    const swap = smooth(segment(t, 2.3, 0.5));
    const span = 460;
    const xs = row(2, 180);
    const groups = [
      { names: ['Sam', 'Ana'], tag: TAGS.first, at: 0.6, out: 2.3 },
      {
        names: ['Kai', 'Lee'],
        tag: TAGS.second,
        at: 3.0,
        out: Number.POSITIVE_INFINITY,
      },
    ];
    return {
      rail: { progress: lerp(0.3, 0.36, swap), press: pressAt(t, [2.2]) },
      body: (
        <>
          <PromptPips count={2} current={swap < 0.5 ? 0 : 1} />
          <Prompt
            text={TEXT.discuss}
            size={24}
            offset={-swap * span}
            opacity={1 - swap}
          />
          <Prompt
            text={TEXT.work}
            size={24}
            offset={(1 - swap) * span}
            opacity={swap}
          />
          {groups.map(({ names, tag, at, out }) =>
            names.map((name, i) => {
              const leave = 1 - smooth(segment(t, out, 0.3));
              return (
                <g key={name}>
                  <PersonNode
                    x={xs[i] ?? 0}
                    y={ROW_Y}
                    label={name}
                    k={backOut(segment(t, at + i * 0.3, 0.45)) * leave}
                  />
                  <Chip
                    x={xs[i] ?? 0}
                    y={ROW_Y + 64}
                    text={tag}
                    size={14}
                    k={backOut(segment(t, at + i * 0.3 + 0.4, 0.4)) * leave}
                  />
                </g>
              );
            }),
          )}
        </>
      ),
      overlay: (
        <Click t={t} stops={[{ to: NEXT_BUTTON, at: 2.2 }]} leave={3.4} />
      ),
    };
  },
);

const ROSTER = [
  { name: 'Kwame', match: true },
  { name: 'Lin', match: false },
  { name: 'Rosa', match: true },
  { name: 'Tom', match: false },
] as const;

/**
 * Without a filter, a roster panel lists everyone on every prompt. A filter
 * narrows it, on every prompt of the stage.
 */
export const NameGeneratorFilterScene = defineScene(6.0, ({ t, id }) => {
  const swap = smooth(segment(t, 1.7, 0.5));
  const span = 420;
  const filtered = smooth(segment(t, 3.2, 0.5));
  const panelY = PANEL.top;
  const height = PANEL.bottom - PANEL.top;
  const grid = (i: number): Point => [
    PANEL.x + 60 + (i % 2) * 94,
    panelY + 120 + Math.floor(i / 2) * 84,
  ];
  const kept = ROSTER.filter((person) => person.match);
  return {
    rail: { progress: lerp(0.3, 0.36, swap), press: pressAt(t, [1.6]) },
    body: (
      <>
        <PromptPips count={2} current={swap < 0.5 ? 0 : 1} />
        <Prompt text={TEXT.study} offset={-swap * span} opacity={1 - swap} />
        <Prompt text={TEXT.lunch} offset={(1 - swap) * span} opacity={swap} />
        <SidePanel
          id={id}
          x={PANEL.x}
          y={panelY}
          width={PANEL.width}
          height={height}
          title={TEXT.classmates}
          bar="fill-cat-2"
          slide={backOut(segment(t, 0.2, 0.5))}
        >
          <Chip
            x={PANEL.x + PANEL.width / 2}
            y={panelY + 72}
            text={TEXT.filter}
            size={13}
            k={backOut(segment(t, 3.0, 0.45))}
          />
          {ROSTER.map((person, i) => {
            const from = grid(i);
            const to = grid(kept.findIndex((k) => k.name === person.name));
            const at: Point = person.match
              ? [lerp(from[0], to[0], filtered), lerp(from[1], to[1], filtered)]
              : from;
            // The same list shows on both prompts, so it settles again with
            // each one, until the filter takes out who does not match.
            const resettle =
              1 - Math.sin(Math.PI * segment(t, 1.9, 0.4)) * 0.15;
            return (
              <PersonNode
                key={person.name}
                x={at[0]}
                y={at[1]}
                r={30}
                label={person.name}
                k={
                  backOut(segment(t, 0.5 + i * 0.1, 0.4)) *
                  resettle *
                  (person.match ? 1 : 1 - filtered)
                }
              />
            );
          })}
        </SidePanel>
        <AddButton id={id} />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: NEXT_BUTTON, at: 1.6 }]} leave={1.9} />,
  };
});

/**
 * Skip logic decides, for each participant, whether the stage is shown. When
 * its rule is not met the interview goes straight past it.
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
