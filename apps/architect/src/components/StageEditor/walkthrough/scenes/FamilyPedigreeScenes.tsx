import {
  Check,
  MousePointer2,
  Redo2,
  Scan,
  Speech,
  Undo2,
  Unlink,
  Waypoints,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut, segment } from '@codaco/art/illustration/motion';

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
} from './parts';
import {
  ChildLines,
  FAMILY,
  FAMILY_MEMBERS,
  FamilyLines,
  GENERATION_Y,
  PartnerLine,
  PedigreePerson,
  SYMBOL_R,
  TOOLBAR_Y,
  type PedigreeShape,
} from './pedigreeParts';

const TEXT = {
  save: 'Save',
  tools: [
    'Add and edit',
    'Connect',
    'Disconnect',
    'Wording',
    'Undo',
    'Redo',
    'Progress ring',
    'Zoom out',
    'Zoom in',
    'Show the whole family',
  ],
  percent: '%',
  nodes: 'Nodes',
  edges: 'Edges',
  sam: 'Sam',
  rose: 'Rose',
  mother: 'Mother',
  father: 'Father',
  you: 'You',
  words: ' words',
  done: '✓ ',
  todo: '• ',
  noSiblings: 'I have no biological siblings',
  framingQuestion: 'How should we describe your family?',
  nominationPrompt: 'Who in your family has had breast cancer?',
} as const;

const CX = STAGE_CENTER_X;
const [G0, G1, G2] = GENERATION_Y;

const midpoint = (a: Point, b: Point): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

/** The family the participant builds: parents, a brother, a partner, a child. */
const BUILT = {
  father: { at: [CX - 100, G0] as Point, shape: 'square', label: 'Father' },
  mother: { at: [CX, G0] as Point, shape: 'circle', label: 'Mother' },
  brother: { at: [CX - 100, G1] as Point, shape: 'square', label: 'Brother' },
  you: { at: [CX, G1] as Point, shape: 'circle', label: 'You' },
  partner: { at: [CX + 100, G1] as Point, shape: 'square', label: 'Partner' },
  daughter: { at: [CX + 50, G2] as Point, shape: 'circle', label: 'Daughter' },
} as const satisfies Record<
  string,
  { at: Point; shape: PedigreeShape; label: string }
>;

type Built = keyof typeof BUILT;

/** A person of the built family, popping in as `k` runs from 0 to 1. */
function Person({
  who,
  k = 1,
  label,
  ring = 0,
  dim = false,
  warning = false,
  labelBelow = false,
  shape,
}: {
  who: Built;
  k?: number;
  label?: string;
  ring?: number;
  dim?: boolean;
  warning?: boolean;
  labelBelow?: boolean;
  shape?: PedigreeShape;
}) {
  const person = BUILT[who];
  return (
    <PedigreePerson
      at={person.at}
      shape={shape ?? person.shape}
      label={label ?? person.label}
      k={k}
      ring={ring}
      dim={dim}
      warning={warning}
      labelBelow={labelBelow}
    />
  );
}

/** The lines of the built family, each shown by its own `k`. */
function BuiltLines({
  parents = 1,
  siblings = 1,
  partner = 1,
  child = 1,
  withBrother = true,
}: {
  parents?: number;
  siblings?: number;
  partner?: number;
  child?: number;
  withBrother?: boolean;
}) {
  const b = BUILT;
  return (
    <>
      <PartnerLine a={b.father.at} b={b.mother.at} k={parents} />
      <ChildLines
        from={midpoint(b.father.at, b.mother.at)}
        kids={
          withBrother && siblings > 0 ? [b.brother.at, b.you.at] : [b.you.at]
        }
        k={parents}
      />
      <PartnerLine a={b.you.at} b={b.partner.at} k={partner} />
      <ChildLines
        from={midpoint(b.you.at, b.partner.at)}
        kids={[b.daughter.at]}
        k={child}
      />
    </>
  );
}

const ADD_BUTTONS = [
  { label: 'Parent', d: [0, -48] },
  { label: 'Sibling', d: [-48, 0] },
  { label: 'Partner', d: [48, 0] },
  { label: 'Child', d: [0, 48] },
] as const;

type AddChoice = (typeof ADD_BUTTONS)[number]['label'];

/** Where an add button sits around a person. */
const addButtonAt = (at: Point, choice: AddChoice): Point => {
  const d = ADD_BUTTONS.find((b) => b.label === choice)?.d ?? [0, 0];
  return [at[0] + d[0], at[1] + d[1]];
};

/**
 * The add buttons around a person the participant points at: white
 * circles, a parent above, a sibling to the left, a partner to the right
 * and a child below.
 */
function AddButtons({ at, k }: { at: Point; k: number }) {
  if (k <= 0) return null;
  return (
    <g opacity={Math.min(1, k * 2)}>
      {ADD_BUTTONS.map(({ label }) => {
        const [x, y] = addButtonAt(at, label);
        return (
          <g key={label}>
            <circle cx={x} cy={y} r={19} className="fill-white" />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={800}
              className="fill-navy-taupe"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The buttons of the two toolbars, and the gaps between their groups. */
type ToolKey =
  | 'edit'
  | 'connect'
  | 'disconnect'
  | 'wording'
  | 'undo'
  | 'redo'
  | 'ring'
  | 'zoomOut'
  | 'zoomIn'
  | 'fit';

const ICONS: Readonly<Record<Exclude<ToolKey, 'ring'>, LucideIcon>> = {
  edit: MousePointer2,
  connect: Waypoints,
  disconnect: Unlink,
  wording: Speech,
  undo: Undo2,
  redo: Redo2,
  zoomOut: ZoomOut,
  zoomIn: ZoomIn,
  fit: Scan,
};

const ICON_KEYS: readonly Exclude<ToolKey, 'ring'>[] = [
  'edit',
  'connect',
  'disconnect',
  'wording',
  'undo',
  'redo',
  'zoomOut',
  'zoomIn',
  'fit',
];

const BUTTON = 40;
const SEPARATOR = 14;
const INSET = 6;
const TOOLBAR_HEIGHT = 48;

type ToolbarOptions = Readonly<{ speech?: boolean; ring?: boolean }>;

type ToolbarLayout = Readonly<{
  mainLeft: number;
  mainWidth: number;
  viewLeft: number;
  viewWidth: number;
  at: Readonly<Partial<Record<ToolKey, Point>>>;
  separators: readonly number[];
}>;

/**
 * Where each button sits: add and edit, connect and disconnect; the wording
 * control when the participant chooses the words; undo and redo; the
 * progress ring when completeness is set; then, in a toolbar of its own,
 * zoom out, zoom in and show the whole family.
 */
function toolbarLayout({
  speech = false,
  ring = false,
}: ToolbarOptions = {}): ToolbarLayout {
  const main: readonly (ToolKey | '|')[] = [
    'edit',
    'connect',
    'disconnect',
    '|',
    ...(speech ? (['wording', '|'] as const) : []),
    'undo',
    'redo',
    ...(ring ? (['|', 'ring'] as const) : []),
  ];
  const view: readonly ToolKey[] = ['zoomOut', 'zoomIn', 'fit'];
  const widthOf = (items: readonly (ToolKey | '|')[]) =>
    INSET * 2 +
    items.reduce((sum, item) => sum + (item === '|' ? SEPARATOR : BUTTON), 0);
  const mainWidth = widthOf(main);
  const viewWidth = widthOf(view);
  const mainLeft = CX - (mainWidth + 12 + viewWidth) / 2;
  const viewLeft = mainLeft + mainWidth + 12;
  const at: Partial<Record<ToolKey, Point>> = {};
  const separators: number[] = [];
  let x = mainLeft + INSET;
  for (const item of main) {
    if (item === '|') {
      separators.push(x + SEPARATOR / 2);
      x += SEPARATOR;
    } else {
      at[item] = [x + BUTTON / 2, TOOLBAR_Y];
      x += BUTTON;
    }
  }
  x = viewLeft + INSET;
  for (const item of view) {
    at[item] = [x + BUTTON / 2, TOOLBAR_Y];
    x += BUTTON;
  }
  return { mainLeft, mainWidth, viewLeft, viewWidth, at, separators };
}

const pointOf = (layout: ToolbarLayout, key: ToolKey): Point =>
  layout.at[key] ?? [CX, TOOLBAR_Y];

/**
 * The two toolbars at the bottom of the stage, drawn as the interview draws
 * them: a raised pill on the dark canvas, the tool in use in a white
 * circle, and undo and redo greyed out while there is nothing to undo or
 * redo.
 */
function Toolbars({
  active = 'edit',
  dimmed = ['undo', 'redo'],
  speech = false,
  ring,
}: {
  active?: ToolKey;
  dimmed?: readonly ToolKey[];
  speech?: boolean;
  /** The ring's fill, 0 to 1; absent when no completeness is set. */
  ring?: number;
}) {
  const layout = toolbarLayout({ speech, ring: ring !== undefined });
  const top = TOOLBAR_Y - TOOLBAR_HEIGHT / 2;
  return (
    <g>
      {[
        [layout.mainLeft, layout.mainWidth],
        [layout.viewLeft, layout.viewWidth],
      ].map(([left = 0, width = 0]) => (
        <rect
          key={left}
          x={left}
          y={top}
          width={width}
          height={TOOLBAR_HEIGHT}
          rx={TOOLBAR_HEIGHT / 2}
          className="fill-white/10 stroke-white/20"
          strokeWidth={2}
        />
      ))}
      {layout.separators.map((x) => (
        <line
          key={x}
          x1={x}
          y1={TOOLBAR_Y - 11}
          x2={x}
          y2={TOOLBAR_Y + 11}
          className="stroke-white/20"
          strokeWidth={1.5}
        />
      ))}
      {ICON_KEYS.map((key) => {
        const at = layout.at[key];
        if (at === undefined) return null;
        const Glyph = ICONS[key];
        const on = key === active;
        return (
          <g key={key}>
            {on ? (
              <circle cx={at[0]} cy={at[1]} r={19} className="fill-white" />
            ) : null}
            <Glyph
              x={at[0] - 9}
              y={at[1] - 9}
              width={18}
              height={18}
              strokeWidth={2.2}
              className={on ? 'text-navy-taupe' : 'text-white'}
              opacity={dimmed.includes(key) && !on ? 0.4 : 1}
            />
          </g>
        );
      })}
      {ring === undefined ? null : (
        <CompletenessRing at={pointOf(layout, 'ring')} k={ring} />
      )}
    </g>
  );
}

/** The completeness ring: fills as the family nears what is required. */
function CompletenessRing({ at, k }: { at: Point; k: number }) {
  const r = 15;
  const circumference = Math.PI * 2 * r;
  return (
    <g>
      <circle
        cx={at[0]}
        cy={at[1]}
        r={r}
        className="fill-none stroke-white/15"
        strokeWidth={4}
      />
      <circle
        cx={at[0]}
        cy={at[1]}
        r={r}
        className="stroke-sea-green fill-none"
        strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - k)}
        transform={`rotate(-90 ${at[0]} ${at[1]})`}
      />
      {k >= 1 ? (
        <Check
          x={at[0] - 7}
          y={at[1] - 7}
          width={14}
          height={14}
          strokeWidth={3}
          className="text-sea-green"
        />
      ) : (
        <text
          x={at[0]}
          y={at[1] + 3.5}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          className="fill-white"
        >
          {Math.round(k * 100)}
          {TEXT.percent}
        </text>
      )}
    </g>
  );
}

const PANEL = { x: CONTENT.right - 210, width: 210 } as const;

/** The side panel that asks about a person, sliding in from the right. */
function SidePanel({ k, children }: { k: number; children: ReactNode }) {
  if (k <= 0) return null;
  return (
    <g transform={`translate(${(1 - k) * (PANEL.width + 10)} 0)`}>
      <rect
        x={PANEL.x}
        y={CONTENT.y}
        width={PANEL.width}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-white"
      />
      {children}
    </g>
  );
}

function PanelLabel({ y, text }: { y: number; text: string }) {
  return (
    <text
      x={PANEL.x + 16}
      y={y}
      fontSize={12}
      fontWeight={800}
      className="fill-navy-taupe"
    >
      {text}
    </text>
  );
}

function PanelBox({ y, text }: { y: number; text: string }) {
  return (
    <g>
      <rect
        x={PANEL.x + 16}
        y={y}
        width={PANEL.width - 32}
        height={28}
        rx={7}
        className="stroke-navy-taupe/30 fill-none"
        strokeWidth={2}
      />
      <text
        x={PANEL.x + 26}
        y={y + 19}
        fontSize={12}
        fontWeight={700}
        className="fill-navy-taupe"
      >
        {text}
      </text>
    </g>
  );
}

/** How wide an answer chip is, for its label. */
const chipWidth = (label: string) => label.length * 6.4 + 18;

/** Where each answer chip in a row starts. */
const chipLefts = (labels: readonly string[]) =>
  labels.map(
    (_, i) =>
      PANEL.x +
      16 +
      labels.slice(0, i).reduce((sum, label) => sum + chipWidth(label) + 6, 0),
  );

/** A row of answer chips in the side panel, `chosen` filled once picked. */
function PanelChoices({
  y,
  labels,
  chosen,
}: {
  y: number;
  labels: readonly string[];
  chosen?: number;
}) {
  const lefts = chipLefts(labels);
  return (
    <>
      {labels.map((label, i) => {
        const width = chipWidth(label);
        const left = lefts[i] ?? PANEL.x;
        const on = i === chosen;
        return (
          <g key={label}>
            <rect
              x={left}
              y={y}
              width={width}
              height={24}
              rx={12}
              className={on ? 'fill-sea-serpent' : 'fill-navy-taupe/10'}
            />
            <text
              x={left + width / 2}
              y={y + 16}
              textAnchor="middle"
              fontSize={11}
              fontWeight={800}
              className={on ? 'fill-white' : 'fill-navy-taupe'}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

const choiceAt = (y: number, labels: readonly string[], i: number): Point => [
  (chipLefts(labels)[i] ?? PANEL.x) + chipWidth(labels[i] ?? '') / 2,
  y + 12,
];

const SAVE_AT: Point = [PANEL.x + PANEL.width - 50, CONTENT.bottom - 30];

function PanelSave() {
  return (
    <g>
      <rect
        x={SAVE_AT[0] - 34}
        y={SAVE_AT[1] - 15}
        width={68}
        height={30}
        rx={8}
        className="fill-sea-green"
      />
      <text
        x={SAVE_AT[0]}
        y={SAVE_AT[1] + 4.5}
        textAnchor="middle"
        fontSize={12}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.save}
      </text>
    </g>
  );
}

const SEX_OPTIONS = ['Female', 'Male', 'Intersex'] as const;

/** A tap that shows the add buttons while the cursor rests on a person. */
const showing = (t: number, windows: readonly (readonly [number, number])[]) =>
  windows.some(([from, to]) => t >= from && t < to) ? 1 : 0;

/**
 * Drawing a family: starting from the participant, each relative is added
 * from the buttons around a person, and the family is laid out as a
 * pedigree.
 */
export const FamilyPedigreeIntroScene = defineScene(7.4, ({ t }) => {
  const adds = [
    { choice: 'Parent', at: 1.2 },
    { choice: 'Sibling', at: 2.6 },
    { choice: 'Partner', at: 4.0 },
    { choice: 'Child', at: 5.4 },
  ] as const;
  const pop = (i: number) =>
    backOut(segment(t, (adds[i]?.at ?? 0) + 0.15, 0.4));
  const grow = (i: number) =>
    smooth(segment(t, (adds[i]?.at ?? 0) + 0.15, 0.4));
  const you = BUILT.you.at;
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <BuiltLines
          parents={grow(0)}
          siblings={grow(1)}
          partner={grow(2)}
          child={grow(3)}
        />
        <Person who="father" k={pop(0)} />
        <Person who="mother" k={pop(0)} />
        <Person who="brother" k={pop(1)} />
        <Person who="you" />
        <Person who="partner" k={pop(2)} />
        <Person who="daughter" k={pop(3)} />
        <AddButtons
          at={you}
          k={showing(
            t,
            adds.map((a) => [a.at - 0.6, a.at + 0.1] as const),
          )}
        />
        <Toolbars />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={adds.flatMap((a) => [
          { to: you, at: a.at - 0.6, ring: false },
          { to: addButtonAt(you, a.choice), at: a.at, glide: 0.35 },
        ])}
        leave={6.0}
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
  width,
}: {
  x: number;
  y: number;
  title: string;
  columns: readonly string[];
  offsets: readonly number[];
  rows: readonly (readonly string[])[];
  t: number;
  from: number;
  width: number;
}) {
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
        height={28}
        rx={8}
        className="fill-cyber-grape"
      />
      {columns.map((c, i) => (
        <text
          key={c}
          x={x + 10 + (offsets[i] ?? 0)}
          y={y + 19}
          fontSize={11}
          fontWeight={800}
          className="fill-white"
        >
          {c}
        </text>
      ))}
      {rows.map((cells, r) => (
        <g
          key={cells.join('-')}
          opacity={smooth(segment(t, from + r * 0.25, 0.3))}
        >
          <rect
            x={x}
            y={y + 28 * (r + 1)}
            width={width}
            height={28}
            className={r % 2 === 0 ? 'fill-white/5' : 'fill-white/10'}
          />
          {cells.map((cell, i) => (
            <text
              key={`${columns[i] ?? i}`}
              x={x + 10 + (offsets[i] ?? 0)}
              y={y + 28 * (r + 1) + 19}
              fontSize={11}
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

/**
 * What the stage leaves in the data: a node for each person, with their
 * details, and an edge for each partnership and parent, with its kind.
 */
export const FamilyPedigreeDataScene = defineScene(
  5.2,
  ({ t }) => {
    const x = CONTENT.x + 40;
    return {
      body: (
        <>
          <Table
            x={x}
            y={CONTENT.y + 40}
            width={300}
            title={TEXT.nodes}
            columns={['name', 'sex_at_birth', 'relationship']}
            offsets={[0, 90, 190]}
            rows={[
              ['You', 'female', ''],
              ['Mother', 'female', 'parent'],
              ['Father', 'male', 'parent'],
              ['Brother', 'male', 'sibling'],
            ]}
            t={t}
            from={0.5}
          />
          <Table
            x={x + 330}
            y={CONTENT.y + 40}
            width={300}
            title={TEXT.edges}
            columns={['from', 'to', 'kind']}
            offsets={[0, 90, 180]}
            rows={[
              ['Mother', 'Father', 'partner'],
              ['Mother', 'You', 'biological'],
              ['Father', 'You', 'biological'],
              ['Mother', 'Brother', 'biological'],
            ]}
            t={t}
            from={1.6}
          />
          <Chip
            x={CX}
            y={CONTENT.bottom - 60}
            text="Siblings share a parent: no edge between them"
            size={13}
            k={backOut(segment(t, 2.9, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/** The toolbar's buttons in the order the walkthrough numbers them. */
const NUMBERED: readonly ToolKey[] = [
  'edit',
  'connect',
  'disconnect',
  'wording',
  'undo',
  'redo',
  'ring',
  'zoomOut',
  'zoomIn',
  'fit',
];

/**
 * Every button the toolbars can show, numbered as the list beside it in the
 * walkthrough numbers them; each is pointed out in turn.
 */
export const FamilyPedigreeToolsScene = defineScene(13.0, ({ t }) => {
  const scale = 1.25;
  const middle = (CONTENT.y + CONTENT.bottom) / 2 + 40;
  const layout = toolbarLayout({ speech: true, ring: true });
  const place = ([x, y]: Point): Point => [
    CX + (x - CX) * scale,
    middle + (y - TOOLBAR_Y) * scale,
  ];
  const lit = t >= 2.6 ? Math.floor((t - 2.6) / 1.0) : -1;
  const litKey = NUMBERED[lit];
  return {
    body: (
      <>
        <g
          transform={`translate(${CX} ${middle}) scale(${scale}) translate(${-CX} ${-TOOLBAR_Y})`}
        >
          <Toolbars
            speech
            ring={0.92}
            active={litKey === undefined || litKey === 'ring' ? 'edit' : litKey}
            dimmed={[]}
          />
        </g>
        {NUMBERED.map((key, i) => {
          const [x, y] = place(pointOf(layout, key));
          return (
            <CalloutPin
              key={key}
              n={i + 1}
              at={[x, middle - 100]}
              to={[x, y - 22 * scale]}
              k={smooth(segment(t, 0.3 + i * 0.16, 0.35))}
              lit={i === lit ? smooth(segment(t, 2.6 + i * 1.0, 0.2)) : 0}
              label={TEXT.tools[i] ?? ''}
              labelSide="above"
            />
          );
        })}
      </>
    ),
  };
});

/**
 * Adding a relative: the buttons around a person, then the side panel that
 * asks about the new person before they are saved.
 */
export const FamilyPedigreeAddScene = defineScene(6.2, ({ t }) => {
  const hoverAt = 0.6;
  const pickAt = 1.2;
  const openAt = pickAt + 0.1;
  const nameAt = openAt + 0.6;
  const sexAt = openAt + 1.6;
  const saveAt = openAt + 2.4;
  const panel =
    smooth(segment(t, openAt, 0.4)) *
    (1 - smooth(segment(t, saveAt + 0.1, 0.4)));
  const added = backOut(segment(t, saveAt + 0.3, 0.4));
  const typed =
    t < nameAt ? '' : 'Sam'.slice(0, Math.floor((t - nameAt) / 0.12) + 1);
  const you = BUILT.you.at;
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <BuiltLines child={0} partner={0} siblings={added} />
        <Person who="father" />
        <Person who="mother" />
        <Person who="you" />
        <Person who="brother" label={TEXT.sam} k={added} />
        <AddButtons at={you} k={showing(t, [[hoverAt, pickAt + 0.05]])} />
        <Toolbars />
        <SidePanel k={panel}>
          <PanelLabel y={CONTENT.y + 34} text="Name (optional)" />
          <PanelBox y={CONTENT.y + 44} text={typed} />
          <PanelLabel y={CONTENT.y + 100} text="Sex assigned at birth" />
          <PanelChoices
            y={CONTENT.y + 110}
            labels={SEX_OPTIONS}
            {...(t >= sexAt ? { chosen: 1 } : {})}
          />
          <PanelSave />
        </SidePanel>
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: you, at: hoverAt, ring: false },
          { to: addButtonAt(you, 'Sibling'), at: pickAt, glide: 0.35 },
          { to: [PANEL.x + 60, CONTENT.y + 58], at: nameAt - 0.1 },
          { to: choiceAt(CONTENT.y + 110, SEX_OPTIONS, 1), at: sexAt },
          { to: SAVE_AT, at: saveAt },
        ]}
        leave={saveAt + 0.5}
      />
    ),
  };
});

/** A menu floating over the canvas: a question and its choices. */
function Menu({
  at,
  title,
  items,
  k,
  chosen,
}: {
  at: Point;
  title: string;
  items: readonly string[];
  k: number;
  chosen?: number;
}) {
  if (k <= 0) return null;
  const width = Math.max(220, title.length * 6.9 + 28);
  return (
    <g opacity={Math.min(1, k * 2)}>
      <rect
        x={at[0]}
        y={at[1]}
        width={width}
        height={36 + items.length * 28}
        rx={12}
        className="fill-white"
      />
      <text
        x={at[0] + 14}
        y={at[1] + 23}
        fontSize={12}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {title}
      </text>
      {items.map((item, i) => (
        <g key={item}>
          {i === chosen ? (
            <rect
              x={at[0] + 6}
              y={at[1] + 34 + i * 28}
              width={width - 12}
              height={26}
              rx={7}
              className="fill-sea-serpent/20"
            />
          ) : null}
          <text
            x={at[0] + 14}
            y={at[1] + 52 + i * 28}
            fontSize={12}
            fontWeight={700}
            className="fill-navy-taupe"
          >
            {item}
          </text>
        </g>
      ))}
    </g>
  );
}

const menuItemAt = (at: Point, i: number): Point => [
  at[0] + 80,
  at[1] + 47 + i * 28,
];

/**
 * A relative left unnamed is labeled by how they are related; given a name,
 * they are shown by it.
 */
export const FamilyPedigreeLabelsScene = defineScene(6.0, ({ t }) => {
  const openAt = 0.8;
  const nameAt = 1.6;
  const saveAt = 2.8;
  const panel =
    smooth(segment(t, openAt + 0.1, 0.4)) *
    (1 - smooth(segment(t, saveAt + 0.1, 0.4)));
  const typed =
    t < nameAt ? '' : 'Rose'.slice(0, Math.floor((t - nameAt) / 0.12) + 1);
  const named = t >= saveAt + 0.2;
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <BuiltLines child={0} partner={0} />
        <Person who="father" />
        <Person
          who="mother"
          label={named ? TEXT.rose : TEXT.mother}
          ring={panel > 0 ? 1 : 0}
        />
        <Person who="brother" />
        <Person who="you" />
        <Chip
          x={BUILT.brother.at[0] - 10}
          y={G2}
          text="Unnamed: labeled by relationship"
          size={12}
          k={backOut(segment(t, 0.3, 0.4))}
        />
        <Chip
          x={BUILT.mother.at[0] + 10}
          y={G0 - 40}
          text="Named: shown by name"
          size={12}
          k={backOut(segment(t, saveAt + 0.4, 0.4))}
        />
        <SidePanel k={panel}>
          <PanelLabel y={CONTENT.y + 34} text="Name (optional)" />
          <PanelBox y={CONTENT.y + 44} text={typed} />
          <PanelSave />
        </SidePanel>
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: BUILT.mother.at, at: openAt },
          { to: [PANEL.x + 60, CONTENT.y + 58], at: nameAt - 0.1 },
          { to: SAVE_AT, at: saveAt },
        ]}
        leave={saveAt + 0.5}
      />
    ),
  };
});

const GENDER_OPTIONS = [
  { option: 'Woman', words: 'Feminine', label: 'Mother', shape: 'circle' },
  { option: 'Man', words: 'Masculine', label: 'Father', shape: 'square' },
  { option: 'Non-binary', words: 'Neutral', label: 'Parent', shape: 'diamond' },
  {
    option: 'Don’t know',
    words: 'Not known',
    label: 'Parent',
    shape: 'diamond',
  },
] as const;

/**
 * Each gender identity option takes a set of kinship words, and a parent
 * left unnamed is called by the words of the option chosen for them.
 */
export const FamilyPedigreeGenderScene = defineScene(7.0, ({ t }) => {
  const current = Math.min(
    GENDER_OPTIONS.length - 1,
    Math.max(0, Math.floor((t - 0.6) / 1.4)),
  );
  const entry = GENDER_OPTIONS[current] ?? GENDER_OPTIONS[0];
  const listX = CONTENT.x + 70;
  const parent: Point = [CONTENT.right - 170, CONTENT.y + 130];
  const child: Point = [CONTENT.right - 170, CONTENT.y + 250];
  return {
    body: (
      <>
        {GENDER_OPTIONS.map((g, i) => {
          const y = CONTENT.y + 60 + i * 64;
          const on = i === current;
          return (
            <g key={g.option} opacity={on ? 1 : 0.45}>
              <rect
                x={listX}
                y={y}
                width={280}
                height={46}
                rx={12}
                className={on ? 'fill-cyber-grape' : 'fill-white/10'}
              />
              <text
                x={listX + 16}
                y={y + 29}
                fontSize={15}
                fontWeight={800}
                className="fill-white"
              >
                {g.option}
              </text>
              <text
                x={listX + 264}
                y={y + 28}
                textAnchor="end"
                fontSize={12}
                fontWeight={800}
                className="fill-mustard"
              >
                {g.words}
                {TEXT.words}
              </text>
            </g>
          );
        })}
        <ChildLines from={[parent[0], parent[1] + SYMBOL_R]} kids={[child]} />
        <PedigreePerson
          at={parent}
          shape={entry.shape}
          label={entry.label}
          labelBelow
          k={backOut(segment(t, 0.6 + current * 1.4, 0.4))}
        />
        <PedigreePerson at={child} shape="circle" label={TEXT.you} />
      </>
    ),
  };
});

/** Eli, a trans man, with his family, drawn by each symbol setting. */
const ELI = [
  { label: 'Mother', at: [CX - 120, G0], bySex: 'circle', byGender: 'circle' },
  { label: 'Father', at: [CX - 20, G0], bySex: 'square', byGender: 'square' },
  { label: 'Mara', at: [CX - 120, G1], bySex: 'square', byGender: 'circle' },
  { label: 'Eli', at: [CX - 20, G1], bySex: 'circle', byGender: 'square' },
  { label: 'Robin', at: [CX + 80, G1], bySex: 'square', byGender: 'diamond' },
  { label: 'Wren', at: [CX + 30, G2], bySex: 'diamond', byGender: 'diamond' },
] as const satisfies readonly {
  label: string;
  at: Point;
  bySex: PedigreeShape;
  byGender: PedigreeShape;
}[];

const eliAt = (label: string): Point =>
  ELI.find((p) => p.label === label)?.at ?? [CX, G1];

/**
 * Symbols following gender identity, then sex assigned at birth: the same
 * family, drawn two ways.
 */
export const FamilyPedigreeSymbolsScene = defineScene(6.4, ({ t }) => {
  const bySex = t >= 3.2;
  const swap = backOut(segment(t, bySex ? 3.2 : 0.2, 0.45));
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <PartnerLine a={eliAt('Mother')} b={eliAt('Father')} />
        <ChildLines
          from={midpoint(eliAt('Mother'), eliAt('Father'))}
          kids={[eliAt('Mara'), eliAt('Eli')]}
        />
        <PartnerLine a={eliAt('Eli')} b={eliAt('Robin')} />
        <ChildLines
          from={midpoint(eliAt('Eli'), eliAt('Robin'))}
          kids={[eliAt('Wren')]}
        />
        {ELI.map((p) => (
          <PedigreePerson
            key={p.label}
            at={p.at}
            shape={bySex ? p.bySex : p.byGender}
            label={p.label}
            k={p.bySex === p.byGender ? 1 : swap}
          />
        ))}
        <Chip
          x={CX + 150}
          y={STAGE.y + 30}
          text={
            bySex
              ? 'Symbols: Sex assigned at birth'
              : 'Symbols: Gender identity'
          }
          size={13}
          k={swap}
        />
      </>
    ),
  };
});

const RELATIONSHIP_VALUES: Partial<
  Record<(typeof FAMILY_MEMBERS)[number], string>
> = {
  george: 'grandparent',
  eleanor: 'grandparent',
  rose: 'parent',
  david: 'parent',
  tom: 'parentsSibling',
  sam: 'sibling',
};

/** Each relative is given a fixed value saying how they are related. */
export const FamilyPedigreeRelationshipScene = defineScene(5.4, ({ t }) => ({
  rail: { progress: 0.4 },
  body: (
    <>
      <FamilyLines />
      {FAMILY_MEMBERS.map((member, i) => {
        const person = FAMILY[member];
        const value = RELATIONSHIP_VALUES[member];
        return (
          <g key={member}>
            <PedigreePerson
              at={person.at}
              shape={person.shape}
              label={person.label}
            />
            {value === undefined ? null : (
              <Chip
                x={person.at[0]}
                y={person.at[1] + SYMBOL_R + 14}
                text={value}
                size={10}
                k={backOut(segment(t, 0.6 + i * 0.3, 0.35))}
              />
            )}
          </g>
        );
      })}
    </>
  ),
}));

/**
 * How relationships are drawn: biological parents with solid lines,
 * adoptive and social parents dashed, a partnership as a line between
 * partners, broken once it has ended.
 */
export const FamilyPedigreeRelationshipsScene = defineScene(5.6, ({ t }) => {
  const width = (CONTENT.right - CONTENT.x) / 4;
  const col = (i: number) => CONTENT.x + width * i + width / 2;
  const top = CONTENT.y + 110;
  const bottom = CONTENT.y + 230;
  const k = (i: number) => backOut(segment(t, 0.4 + i * 0.9, 0.4));
  const g = (i: number) => smooth(segment(t, 0.4 + i * 0.9, 0.4));
  const panels = [
    { title: 'Biological parent', dashed: false, adopted: false },
    { title: 'Adoptive parent', dashed: true, adopted: true },
  ] as const;
  return {
    body: (
      <>
        {panels.map((p, i) => (
          <g key={p.title}>
            <ChildLines
              from={[col(i), top]}
              kids={[[col(i), bottom]]}
              dashed={p.dashed}
              k={g(i)}
            />
            <PedigreePerson
              at={[col(i), top]}
              shape="circle"
              label=""
              k={k(i)}
            />
            <PedigreePerson
              at={[col(i), bottom]}
              shape="square"
              label=""
              k={k(i)}
              adopted={p.adopted}
            />
            <Chip
              x={col(i)}
              y={CONTENT.y + 300}
              text={p.title}
              size={12}
              k={k(i)}
            />
          </g>
        ))}
        {[
          { title: 'Current partners', ended: false },
          { title: 'Former partners', ended: true },
        ].map((p, j) => {
          const i = j + 2;
          return (
            <g key={p.title}>
              <PartnerLine
                a={[col(i) - 45, top + 60]}
                b={[col(i) + 45, top + 60]}
                k={g(i)}
                ended={p.ended}
              />
              <PedigreePerson
                at={[col(i) - 45, top + 60]}
                shape="circle"
                label=""
                k={k(i)}
              />
              <PedigreePerson
                at={[col(i) + 45, top + 60]}
                shape="square"
                label=""
                k={k(i)}
              />
              <Chip
                x={col(i)}
                y={CONTENT.y + 300}
                text={p.title}
                size={12}
                k={k(i)}
              />
            </g>
          );
        })}
      </>
    ),
  };
});

const WORDS = {
  everyday: { father: 'Father', mother: 'Mother', brother: 'Brother' },
  gamete: { father: 'Sperm parent', mother: 'Egg parent', brother: 'Sibling' },
} as const;

const FRAMING_CHOICES = [
  'Mother, father, sister, brother',
  'Egg parent, sperm parent, sibling',
] as const;
const QUESTION: Point = [CX - 130, CONTENT.y + 110];

/**
 * Letting the participant choose: the question opens before anything else,
 * the labels follow the answer, and the toolbar's wording control changes
 * it later.
 */
export const FamilyPedigreeFramingScene = defineScene(8.0, ({ t }) => {
  const askAt = 0.4;
  const answerAt = 1.8;
  const reopenAt = 4.2;
  const changeAt = 5.0;
  const everyday = t >= answerAt && t < changeAt;
  const words = everyday ? WORDS.everyday : WORDS.gamete;
  const question = t >= askAt && t < answerAt + 0.1 ? 1 : 0;
  const popover = t >= reopenAt && t < changeAt + 0.1 ? 1 : 0;
  const swap = backOut(segment(t, t >= changeAt ? changeAt : answerAt, 0.4));
  const speechAt: Point = pointOf(toolbarLayout({ speech: true }), 'wording');
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <BuiltLines child={0} partner={0} />
        <Person
          who="father"
          label={words.father}
          k={t < answerAt ? 1 : swap}
          labelBelow
        />
        <Person
          who="mother"
          label={words.mother}
          k={t < answerAt ? 1 : swap}
          labelBelow
        />
        <Person
          who="brother"
          label={words.brother}
          k={t < answerAt ? 1 : swap}
          labelBelow
        />
        <Person who="you" />
        <Toolbars speech />
        <Menu
          at={QUESTION}
          title={TEXT.framingQuestion}
          items={FRAMING_CHOICES}
          k={question}
          {...(t >= answerAt ? { chosen: 0 } : {})}
        />
        <Menu
          at={[speechAt[0] - 110, TOOLBAR_Y - 120]}
          title={TEXT.framingQuestion}
          items={FRAMING_CHOICES}
          k={popover}
          {...(t >= changeAt ? { chosen: 1 } : {})}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: menuItemAt(QUESTION, 0), at: answerAt },
          { to: speechAt, at: reopenAt },
          {
            to: menuItemAt([speechAt[0] - 110, TOOLBAR_Y - 120], 1),
            at: changeAt,
            glide: 0.4,
          },
        ]}
        leave={changeAt + 0.5}
      />
    ),
  };
});

const CHECKLIST = [
  'Add your biological parents',
  'Add your biological brothers and sisters, or say you have none',
] as const;

/**
 * Completeness: the ring in the toolbar fills as the family nears what is
 * required, its list says what is still needed, and a person missing a
 * detail carries a warning.
 */
export const FamilyPedigreeCompletenessScene = defineScene(7.0, ({ t }) => {
  const parentsAt = 1.0;
  const listAt = 2.4;
  const noneAt = 3.6;
  const fill =
    t < parentsAt
      ? 0.3
      : t < noneAt
        ? lerp(0.3, 0.7, smooth(segment(t, parentsAt, 0.5)))
        : lerp(0.7, 0.85, smooth(segment(t, noneAt, 0.5)));
  const parents = backOut(segment(t, parentsAt, 0.4));
  const list = t >= listAt && t < noneAt + 0.8 ? 1 : 0;
  const ringAt: Point = pointOf(toolbarLayout({ ring: true }), 'ring');
  const listTop = TOOLBAR_Y - 140;
  const listX = ringAt[0] - 220;
  const noneButton: Point = [listX + 120, listTop + 92];
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <PartnerLine
          a={BUILT.father.at}
          b={BUILT.mother.at}
          k={smooth(segment(t, parentsAt, 0.4))}
        />
        <ChildLines
          from={midpoint(BUILT.father.at, BUILT.mother.at)}
          kids={[BUILT.you.at]}
          k={smooth(segment(t, parentsAt, 0.4))}
        />
        <Person who="father" k={parents} warning />
        <Person who="mother" k={parents} />
        <Person who="you" />
        <Toolbars ring={fill} />
        {list > 0 ? (
          <g>
            <rect
              x={listX}
              y={listTop}
              width={370}
              height={118}
              rx={12}
              className="fill-white"
            />
            {CHECKLIST.map((item, i) => {
              const done = i === 0 || t >= noneAt;
              return (
                <g key={item} opacity={done ? 0.55 : 1}>
                  <text
                    x={listX + 14}
                    y={listTop + 26 + i * 30}
                    fontSize={10.5}
                    fontWeight={700}
                    className="fill-navy-taupe"
                    textDecoration={done ? 'line-through' : undefined}
                  >
                    {done ? TEXT.done : TEXT.todo}
                    {item}
                  </text>
                </g>
              );
            })}
            {t < noneAt ? (
              <g>
                <rect
                  x={noneButton[0] - 96}
                  y={noneButton[1] - 13}
                  width={192}
                  height={26}
                  rx={8}
                  className="fill-navy-taupe/10"
                />
                <text
                  x={noneButton[0]}
                  y={noneButton[1] + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  className="fill-navy-taupe"
                >
                  {TEXT.noSiblings}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
        <Chip
          x={BUILT.father.at[0] - 30}
          y={G0 - 40}
          text="Missing a detail"
          size={11}
          k={backOut(segment(t, parentsAt + 0.5, 0.4))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: ringAt, at: listAt, ring: false },
          { to: noneButton, at: noneAt },
        ]}
        leave={noneAt + 0.6}
      />
    ),
  };
});

/**
 * A nomination prompt: once the family is drawn, the participant selects
 * everyone the question applies to. A limit by sex assigned at birth makes
 * the others unavailable.
 */
export const FamilyPedigreeNominationScene = defineScene(6.6, ({ t }) => {
  const taps = [
    { member: 'eleanor', at: 1.2 },
    { member: 'rose', at: 1.8 },
    { member: 'you', at: 2.4 },
  ] as const;
  const limited = t >= 3.8;
  const selected = (member: string) =>
    taps.some((tap) => tap.member === member && t >= tap.at);
  return {
    rail: { progress: 0.4 },
    body: (
      <>
        <rect
          x={CX - 170}
          y={STAGE.y + 4}
          width={340}
          height={30}
          rx={15}
          className="fill-cyber-grape"
        />
        <text
          x={CX}
          y={STAGE.y + 24}
          textAnchor="middle"
          fontSize={13}
          fontWeight={800}
          className="fill-white"
        >
          {TEXT.nominationPrompt}
        </text>
        <g transform="translate(0 12)">
          <FamilyLines />
          {FAMILY_MEMBERS.map((member) => {
            const person = FAMILY[member];
            const unavailable = limited && person.shape === 'square';
            return (
              <PedigreePerson
                key={member}
                at={person.at}
                shape={person.shape}
                label={person.label}
                ring={selected(member) ? 1 : 0}
                dim={unavailable}
              />
            );
          })}
        </g>
        <Chip
          x={CX}
          y={STAGE.bottom - 40}
          text="Anyone except people assigned male at birth"
          size={11}
          k={backOut(segment(t, 3.8, 0.4))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={taps.map((tap) => ({
          to: [FAMILY[tap.member].at[0], FAMILY[tap.member].at[1] + 12],
          at: tap.at,
        }))}
        leave={3.0}
      />
    ),
  };
});
