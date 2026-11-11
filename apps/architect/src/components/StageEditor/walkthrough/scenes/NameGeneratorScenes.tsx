import { backOut, segment } from '@codaco/art/illustration/motion';

import {
  ADD_BUTTON,
  AddButton,
  Chip,
  Click,
  CONTENT,
  defineScene,
  FORM_CARD,
  FORM_SUBMIT,
  FormCard,
  lerp,
  NEXT_BUTTON,
  PersonNode,
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
  Toast,
  travel,
  type Point,
} from './parts';

const TEXT = {
  important: 'Who do you talk to about important things?',
  named: '3 people named',
  addPerson: 'Add a person',
  live: 'Who do you live with?',
  work: 'Who do you work with?',
  friends: 'Who are your closest friends?',
  classmates: 'Who do you study with?',
  alreadyNamed: 'Already named',
  yourClassmates: 'Your classmates',
  fromInterview: 'From this interview',
  fromRoster: 'From a roster file',
  // The interview's own notices for a minimum of 2 and for a maximum.
  minimum: ['You must create at least 2', 'items before you can', 'continue.'],
  maximum: [
    'You have completed this',
    'task. Click the next',
    'arrow to continue.',
  ],
} as const;

const NAMES = { sam: 'Sam', alex: 'Alex' } as const;

const ROW_Y = STAGE.y + 190;

/**
 * Shows a name generator where the participant adds alters one at a time with
 * the add button, and each one appears on screen as a node.
 */
export const NameGeneratorIntroScene = defineScene(3.6, ({ t, id }) => {
  const names = ['Sam', 'Ana', 'Jo'];
  const xs = row(3);
  const clicks = [1, 1.7, 2.4];
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.important} opacity={segment(t, 0.4, 0.4)} />
        {names.map((name, i) => (
          <PersonNode
            key={name}
            x={xs[i] ?? 0}
            y={ROW_Y}
            label={name}
            k={backOut(segment(t, (clicks[i] ?? 0) + 0.15, 0.45))}
          />
        ))}
        <AddButton
          id={id}
          k={backOut(segment(t, 0.3, 0.4))}
          press={pressAt(t, clicks)}
        />
      </>
    ),
    overlay: (
      <>
        <Chip
          x={STAGE_CENTER_X}
          y={ROW_Y + 92}
          text={TEXT.named}
          outlined
          k={backOut(segment(t, 3.0, 0.5))}
        />
        <Click
          t={t}
          stops={clicks.map((at) => ({ to: ADD_BUTTON, at }))}
          leave={3.0}
        />
      </>
    ),
  };
});

const CHIPS = ['Family', 'Friend', 'Work'];
const chipX = (i: number) => FORM_CARD.x + 34 + i * 112 + 50;
const CHIP_Y = FORM_CARD.y + 195;

/**
 * Shows a name generator where the participant clicks the add button, fills in
 * a form about the new alter, and saves it to create the node.
 */
export const NameGeneratorFormScene = defineScene(4.4, ({ t, id }) => {
  const nodeAt: Point = [STAGE_CENTER_X + 90, ROW_Y + 30];
  const chosen: Point = [chipX(1), CHIP_Y];
  const typed = 'Alex'.slice(0, Math.floor(segment(t, 1.6, 0.6) * 4));
  return {
    rail: { progress: 0.3 },
    body: (
      <>
        <Prompt text={TEXT.important} />
        <PersonNode
          x={STAGE_CENTER_X - 90}
          y={ROW_Y + 30}
          label={NAMES.sam}
          k={1}
        />
        <PersonNode
          x={nodeAt[0]}
          y={nodeAt[1]}
          label={NAMES.alex}
          k={backOut(segment(t, 3.45, 0.45))}
        />
        <AddButton id={id} press={pressAt(t, [0.9])} />
      </>
    ),
    modal: (
      <FormCard
        title={TEXT.addPerson}
        k={backOut(segment(t, 1.05, 0.45))}
        settle={smooth(segment(t, 3.25, 0.35))}
        to={nodeAt}
      >
        <TextBar x={FORM_CARD.x + 34} y={FORM_CARD.y + 80} width={90} />
        <TextBox
          x={FORM_CARD.x + 34}
          y={FORM_CARD.y + 96}
          width={FORM_CARD.width - 68}
          text={typed}
          caret={t > 1.4 && t < 2.3 && Math.floor(t * 3) % 2 === 0}
        />
        <TextBar x={FORM_CARD.x + 34} y={FORM_CARD.y + 164} width={170} />
        {CHIPS.map((chip, i) => (
          <Chip
            key={chip}
            x={chipX(i)}
            y={CHIP_Y}
            text={chip}
            size={18}
            width={100}
            fill={t >= 2.45 && i === 1 ? 'fill-sea-green' : 'fill-white/15'}
            ink="fill-white"
          />
        ))}
      </FormCard>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: ADD_BUTTON, at: 0.9 },
          { to: chosen, at: 2.4, glide: 0.5 },
          { to: FORM_SUBMIT, at: 3.1, glide: 0.45 },
        ]}
        leave={3.35}
      />
    ),
  };
});

/** Several prompts on one stage, each collecting its own nodes. */
export const NameGeneratorPromptsScene = defineScene(4.4, ({ t, id }) => {
  const swap = smooth(segment(t, 1.9, 0.5));
  const span = 420;
  const xs = row(2, 160);
  const groups = [
    {
      names: ['Mum', 'Dad'],
      k: (i: number) =>
        backOut(segment(t, 0.7 + i * 0.25, 0.45)) *
        (1 - smooth(segment(t, 1.95, 0.3))),
    },
    {
      names: ['Kai', 'Lee'],
      k: (i: number) => backOut(segment(t, 2.8 + i * 0.3, 0.45)),
    },
  ];
  return {
    rail: { progress: lerp(0.3, 0.36, swap), press: pressAt(t, [1.8]) },
    body: (
      <>
        <PromptPips count={2} current={swap < 0.5 ? 0 : 1} />
        <Prompt
          text={TEXT.live}
          offset={-swap * span}
          opacity={segment(t, 0.3, 0.4) * (1 - swap)}
        />
        <Prompt text={TEXT.work} offset={(1 - swap) * span} opacity={swap} />
        {groups.map(({ names, k }) =>
          names.map((name, i) => (
            <PersonNode
              key={name}
              x={xs[i] ?? 0}
              y={ROW_Y + 20}
              label={name}
              k={k(i)}
            />
          )),
        )}
        <AddButton id={id} />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: NEXT_BUTTON, at: 1.8 }]} leave={2.1} />,
  };
});

/**
 * Shows a name generator where trying to move on before naming the minimum
 * number of alters brings up a notice, and naming the maximum turns off the add
 * button and tells the participant to continue.
 */
export const NameGeneratorLimitsScene = defineScene(6.2, ({ t, id }) => {
  const adds = [0.6, 3.2, 3.9];
  const xs = row(3);
  const names = ['Sam', 'Ana', 'Jo'];
  const minMet = 3.35;
  const full = t >= 4.05;
  const early = segment(t, 1.6, 0.3) * (1 - segment(t, 3.0, 0.3));
  return {
    rail: {
      progress: 0.3,
      pulse: t >= minMet,
      pulseFrom: minMet,
      press: pressAt(t, [1.6]),
    },
    body: (
      <>
        <Prompt text={TEXT.friends} />
        {names.map((name, i) => (
          <PersonNode
            key={name}
            x={xs[i] ?? 0}
            y={ROW_Y - 20}
            label={name}
            k={backOut(segment(t, (adds[i] ?? 0) + 0.15, 0.45))}
          />
        ))}
        <AddButton id={id} disabled={full} press={pressAt(t, adds)} />
        <Toast
          lines={TEXT.minimum}
          variant="destructive"
          k={early}
          t={t}
          from={1.6}
        />
        <Toast
          lines={TEXT.maximum}
          variant="success"
          k={segment(t, 4.1, 0.3)}
          t={t}
          from={4.1}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: ADD_BUTTON, at: adds[0] ?? 0 },
          { to: NEXT_BUTTON, at: 1.6 },
          { to: ADD_BUTTON, at: adds[1] ?? 0 },
          { to: ADD_BUTTON, at: adds[2] ?? 0 },
        ]}
        leave={4.5}
      />
    ),
  };
});

/** The side panels a name generator puts beside its list of people. */
export const PANEL = {
  x: STAGE.x + 14,
  width: 214,
  top: STAGE.y + 76,
  bottom: STAGE.bottom - 10,
} as const;

const SOURCES = {
  interview: 'Earlier in this interview',
  file: 'classmates.csv',
  heading: 'Sources',
  panels: 'Side panels',
  list: 'This prompt',
  again: 'Same person, added again',
  created: 'New person from the roster',
} as const;

const INTERVIEW_PEOPLE = ['Sam', 'Ana'] as const;
const ROSTER_PEOPLE = ['Kwame', 'Lin', 'Rosa'] as const;

/**
 * Shows where a side panel's nodes come from: alters named earlier in the
 * interview fill one panel and the rows of a roster file fill another, and
 * dragging Sam from the first panel adds the same alter to this prompt while
 * dragging Rosa from the second creates a new node from the roster.
 */
export const NameGeneratorPanelSourcesScene = defineScene(
  6.4,
  ({ t, id }) => {
    const top = CONTENT.y + 56;
    const bottom = CONTENT.bottom - 36;
    const gap = 18;
    const height = (bottom - top - gap) / 2;
    const rowTop = (i: number) => top + i * (height + gap);
    const source = { x: CONTENT.x + 24, width: 176 };
    const panel = { x: source.x + source.width + 56, width: 190 };
    const list = {
      x: panel.x + panel.width + 40,
      right: CONTENT.right - 24,
    };
    const listCentre = (list.x + list.right) / 2;
    const headingY = CONTENT.y + 34;
    const R = 22;
    const panelSlot = (band: number, i: number): Point => [
      panel.x + 37 + i * 58,
      rowTop(band) + height / 2 + 22,
    ];
    const interviewSlot = (i: number): Point => [
      source.x + 56 + i * 64,
      rowTop(0) + height / 2 + 12,
    ];
    const fileRow = (i: number) => rowTop(1) + 44 + i * 24;
    const listSlot = (i: number): Point => [listCentre, top + 62 + i * 92];

    const fly = (from: Point, to: Point, at: number): Point | null => {
      const k = smooth(segment(t, at, 0.6));
      if (k <= 0 || k >= 1) return null;
      return [
        lerp(from[0], to[0], k),
        lerp(from[1], to[1], k) - Math.sin(Math.PI * k) * 26,
      ];
    };
    const arrived = (at: number) => t >= at + 0.6;

    const pickSam = 3.0;
    const dropSam = 3.8;
    const pickRosa = 4.6;
    const dropRosa = 5.4;
    const samStart = panelSlot(0, 0);
    const rosaStart = panelSlot(1, 2);
    const stops = [
      { to: samStart, at: pickSam, ring: false },
      { to: listSlot(0), at: dropSam, glide: 0.8, ring: false },
      { to: rosaStart, at: pickRosa, ring: false },
      { to: listSlot(1), at: dropRosa, glide: 0.8, ring: false },
    ];
    const carry = (pick: number, drop: number, from: Point, to: Point) =>
      t < pick
        ? null
        : t >= drop
          ? to
          : travel(t, from, [{ to, at: drop, glide: drop - pick }]);
    const sam = carry(pickSam, dropSam, samStart, listSlot(0));
    const rosa = carry(pickRosa, dropRosa, rosaStart, listSlot(1));
    const caption =
      t >= dropRosa ? SOURCES.created : t >= dropSam ? SOURCES.again : null;

    const arrow = (band: number, at: number) => {
      const y = rowTop(band) + height / 2;
      const x1 = source.x + source.width + 8;
      const x2 = panel.x - 10;
      const k = smooth(segment(t, at, 0.4));
      if (k <= 0) return null;
      const end = lerp(x1, x2, k);
      return (
        <g className="fill-white/50 stroke-white/50">
          <line
            x1={x1}
            y1={y}
            x2={end}
            y2={y}
            strokeWidth={3}
            strokeDasharray="6 6"
          />
          <path
            d={`M ${end} ${y} l -10 -7 v 14 z`}
            strokeWidth={0}
            opacity={k}
          />
        </g>
      );
    };

    const headings = [
      { x: source.x + source.width / 2, text: SOURCES.heading },
      { x: panel.x + panel.width / 2, text: SOURCES.panels },
      { x: listCentre, text: SOURCES.list },
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

          <g opacity={backOut(segment(t, 0.3, 0.45))}>
            <rect
              x={source.x}
              y={rowTop(0)}
              width={source.width}
              height={height}
              rx={14}
              className="fill-white/10"
            />
            <text
              x={source.x + source.width / 2}
              y={rowTop(0) + 28}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              className="fill-white"
            >
              {SOURCES.interview}
            </text>
            {INTERVIEW_PEOPLE.map((name, i) => {
              const [x, y] = interviewSlot(i);
              return (
                <PersonNode key={name} x={x} y={y} r={R} label={name} k={1} />
              );
            })}
          </g>

          <g opacity={backOut(segment(t, 0.45, 0.45))}>
            <path
              d={`M ${source.x} ${rowTop(1)} h ${source.width - 26} l 26 26 v ${height - 26} h ${-source.width} z`}
              className="fill-white"
            />
            <path
              d={`M ${source.x + source.width - 26} ${rowTop(1)} v 26 h 26 z`}
              className="fill-white/60"
            />
            <text
              x={source.x + 16}
              y={rowTop(1) + 30}
              fontSize={15}
              fontWeight={800}
              className="fill-navy-taupe"
            >
              {SOURCES.file}
            </text>
            {ROSTER_PEOPLE.map((name, i) => (
              <g key={name}>
                <rect
                  x={source.x + 12}
                  y={fileRow(i) - 4}
                  width={source.width - 24}
                  height={22}
                  rx={4}
                  className="fill-navy-taupe/10"
                />
                <text
                  x={source.x + 22}
                  y={fileRow(i) + 12}
                  fontSize={14}
                  fontWeight={700}
                  className="fill-navy-taupe"
                >
                  {name}
                </text>
              </g>
            ))}
          </g>

          {arrow(0, 0.8)}
          {arrow(1, 1.6)}

          <SidePanel
            id={id}
            x={panel.x}
            y={rowTop(0)}
            width={panel.width}
            height={height}
            title={TEXT.alreadyNamed}
            bar="fill-cat-1"
            slide={backOut(segment(t, 0.6, 0.5))}
          >
            {INTERVIEW_PEOPLE.map((name, i) => {
              const at = 1.0 + i * 0.15;
              if (!arrived(at) || (i === 0 && sam !== null)) return null;
              const [x, y] = panelSlot(0, i);
              return (
                <PersonNode key={name} x={x} y={y} r={R} label={name} k={1} />
              );
            })}
          </SidePanel>
          <SidePanel
            id={id}
            x={panel.x}
            y={rowTop(1)}
            width={panel.width}
            height={height}
            title={TEXT.yourClassmates}
            bar="fill-cat-2"
            slide={backOut(segment(t, 1.4, 0.5))}
          >
            {ROSTER_PEOPLE.map((name, i) => {
              const at = 1.8 + i * 0.15;
              if (!arrived(at) || (i === 2 && rosa !== null)) return null;
              const [x, y] = panelSlot(1, i);
              return (
                <PersonNode key={name} x={x} y={y} r={R} label={name} k={1} />
              );
            })}
          </SidePanel>

          {INTERVIEW_PEOPLE.map((name, i) => {
            const p = fly(interviewSlot(i), panelSlot(0, i), 1.0 + i * 0.15);
            return p ? (
              <circle
                key={name}
                cx={p[0]}
                cy={p[1]}
                r={9}
                className="fill-neon-coral"
              />
            ) : null;
          })}
          {ROSTER_PEOPLE.map((name, i) => {
            const p = fly(
              [source.x + source.width - 30, fileRow(i) + 7],
              panelSlot(1, i),
              1.8 + i * 0.15,
            );
            return p ? (
              <circle
                key={name}
                cx={p[0]}
                cy={p[1]}
                r={9}
                className="fill-neon-coral"
              />
            ) : null;
          })}

          <rect
            x={list.x}
            y={top}
            width={list.right - list.x}
            height={bottom - top}
            rx={14}
            strokeDasharray="8 8"
            strokeWidth={3}
            className="fill-none stroke-white/30"
            opacity={segment(t, 0.4, 0.3)}
          />
          {sam ? (
            <PersonNode
              x={sam[0]}
              y={sam[1]}
              r={lerp(R, 30, smooth(segment(t, pickSam, dropSam - pickSam)))}
              label={INTERVIEW_PEOPLE[0]}
              k={1}
            />
          ) : null}
          {rosa ? (
            <PersonNode
              x={rosa[0]}
              y={rosa[1]}
              r={lerp(R, 30, smooth(segment(t, pickRosa, dropRosa - pickRosa)))}
              label={ROSTER_PEOPLE[2]}
              k={1}
            />
          ) : null}
          {caption ? (
            <Chip
              key={caption}
              x={listCentre}
              y={bottom - 34}
              text={caption}
              size={12}
              width={list.right - list.x - 20}
              k={backOut(
                segment(
                  t,
                  caption === SOURCES.created ? dropRosa : dropSam,
                  0.4,
                ),
              )}
            />
          ) : null}
        </>
      ),
      overlay: <Click t={t} stops={stops} leave={5.8} />,
    };
  },
  { url: 'Side panels' },
);
