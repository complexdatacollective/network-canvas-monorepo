import { Camera, ChevronUp, Scan, ZoomIn, ZoomOut } from 'lucide-react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import {
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
  BottomToolbar,
  FAMILY,
  FAMILY_MEMBERS,
  FamilyLines,
  PedigreePerson,
  TOOLBAR_Y,
  type FamilyMember,
  type PedigreeShape,
  type PedigreeStatus,
} from './pedigreeParts';

const TEXT = {
  select: 'Select a condition',
  snapshot: 'Save snapshot',
  key: 'Key',
  atRisk: 'Show possible (at-risk) statuses',
  rows: {
    affected: 'Has this condition',
    obligateAffected: 'Will develop this condition',
    obligateCarrier: 'Carries this condition',
    atRiskAffected: 'May develop this condition',
    atRiskCarrier: 'May carry this condition',
    unknown: 'Not known',
  },
  nominated: 'has_cf: set by the Family Pedigree',
  nothing: 'Nothing from this stage',
  savedImage: 'Saved as an image',
  nodes: 'Nodes',
  stages: ['Your family', 'How it runs', 'Later family'],
} as const;

type Condition = Readonly<{
  name: string;
  pattern: string;
  fill: string;
  stroke: string;
  statuses: Partial<Record<FamilyMember, PedigreeStatus>>;
}>;

/** Three conditions, each with the statuses the stage works out. */
const CONDITIONS = {
  cf: {
    name: 'Cystic fibrosis',
    pattern: 'Autosomal recessive',
    fill: 'fill-sea-green',
    stroke: 'stroke-sea-green',
    statuses: {
      sam: 'affected',
      rose: 'obligateCarrier',
      david: 'obligateCarrier',
      you: 'atRiskAffected',
      george: 'atRiskCarrier',
      eleanor: 'atRiskCarrier',
      tom: 'atRiskCarrier',
    },
  },
  hd: {
    name: "Huntington's disease",
    pattern: 'Autosomal dominant',
    fill: 'fill-mustard',
    stroke: 'stroke-mustard',
    statuses: {
      george: 'affected',
      rose: 'atRiskAffected',
      tom: 'atRiskAffected',
      you: 'atRiskAffected',
      sam: 'atRiskAffected',
    },
  },
  ha: {
    name: 'Hemophilia A',
    pattern: 'X-linked recessive',
    fill: 'fill-neon-coral',
    stroke: 'stroke-neon-coral',
    statuses: {
      sam: 'affected',
      rose: 'atRiskCarrier',
      eleanor: 'atRiskCarrier',
      tom: 'atRiskAffected',
    },
  },
} as const satisfies Record<string, Condition>;

type ConditionKey = keyof typeof CONDITIONS;
const CONDITION_ORDER: readonly ConditionKey[] = ['cf', 'hd', 'ha'];

const isAtRisk = (status: PedigreeStatus) =>
  status === 'atRiskAffected' || status === 'atRiskCarrier';

/** A person's status, with possible statuses shown as not known when off. */
const statusOf = (
  condition: Condition,
  member: FamilyMember,
  atRisk: boolean,
): PedigreeStatus => {
  const status = condition.statuses[member] ?? 'unknown';
  return !atRisk && isAtRisk(status) ? 'unknown' : status;
};

/** The family, plain or marked for a condition. */
function Family({
  condition,
  atRisk = false,
  dim = () => false,
  k = () => 1,
}: {
  condition?: Condition;
  atRisk?: boolean;
  dim?: (member: FamilyMember) => boolean;
  k?: (member: FamilyMember) => number;
}) {
  return (
    <>
      <FamilyLines />
      {FAMILY_MEMBERS.map((member) => {
        const person = FAMILY[member];
        return (
          <PedigreePerson
            key={member}
            at={person.at}
            shape={person.shape}
            label={person.label}
            k={k(member)}
            dim={dim(member)}
            {...(condition === undefined
              ? {}
              : {
                  condition: {
                    status: statusOf(condition, member, atRisk),
                    fill: condition.fill,
                    stroke: condition.stroke,
                  },
                })}
          />
        );
      })}
    </>
  );
}

const TOOLBAR_WIDTH = 400;
const TOOLBAR_X = STAGE_CENTER_X - TOOLBAR_WIDTH / 2;
const SELECT_AT: Point = [TOOLBAR_X + 90, TOOLBAR_Y];
const SNAPSHOT_AT: Point = [TOOLBAR_X + 330, TOOLBAR_Y];

/** The toolbar: the condition menu, the zoom buttons and Save snapshot. */
function Toolbar({ chosen }: { chosen?: Condition }) {
  const icons = [ZoomOut, ZoomIn, Scan];
  return (
    <BottomToolbar width={TOOLBAR_WIDTH}>
      <rect
        x={TOOLBAR_X + 8}
        y={TOOLBAR_Y - 15}
        width={164}
        height={30}
        rx={15}
        className="fill-white/10"
      />
      {chosen === undefined ? null : (
        <circle
          cx={TOOLBAR_X + 24}
          cy={TOOLBAR_Y}
          r={6}
          className={chosen.fill}
        />
      )}
      <text
        x={TOOLBAR_X + (chosen === undefined ? 20 : 36)}
        y={TOOLBAR_Y + 4.5}
        fontSize={12}
        fontWeight={800}
        className="fill-white"
      >
        {chosen?.name ?? TEXT.select}
      </text>
      <ChevronUp
        x={TOOLBAR_X + 150}
        y={TOOLBAR_Y - 8}
        width={16}
        height={16}
        strokeWidth={2.6}
        className="text-white"
      />
      {icons.map((Glyph, i) => (
        <Glyph
          key={i}
          x={TOOLBAR_X + 186 + i * 30}
          y={TOOLBAR_Y - 9}
          width={18}
          height={18}
          strokeWidth={2.4}
          className="text-white"
        />
      ))}
      <line
        x1={TOOLBAR_X + 278}
        y1={TOOLBAR_Y - 12}
        x2={TOOLBAR_X + 278}
        y2={TOOLBAR_Y + 12}
        className="stroke-white/20"
        strokeWidth={2}
      />
      <Camera
        x={TOOLBAR_X + 290}
        y={TOOLBAR_Y - 8}
        width={16}
        height={16}
        strokeWidth={2.4}
        className="text-white"
      />
      <text
        x={TOOLBAR_X + 312}
        y={TOOLBAR_Y + 4.5}
        fontSize={12}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.snapshot}
      </text>
    </BottomToolbar>
  );
}

/** The condition menu, opening upward from the toolbar. */
function ConditionMenu({ k }: { k: number }) {
  if (k <= 0) return null;
  const top = TOOLBAR_Y - 30 - CONDITION_ORDER.length * 30 - 8;
  return (
    <g opacity={Math.min(1, k * 2)}>
      <rect
        x={TOOLBAR_X + 8}
        y={top}
        width={190}
        height={CONDITION_ORDER.length * 30 + 8}
        rx={12}
        className="fill-white"
      />
      {CONDITION_ORDER.map((key, i) => {
        const condition = CONDITIONS[key];
        return (
          <g key={key}>
            <circle
              cx={TOOLBAR_X + 26}
              cy={top + 19 + i * 30}
              r={6}
              className={condition.fill}
            />
            <text
              x={TOOLBAR_X + 40}
              y={top + 23.5 + i * 30}
              fontSize={13}
              fontWeight={700}
              className="fill-navy-taupe"
            >
              {condition.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const menuItemAt = (i: number): Point => [
  TOOLBAR_X + 90,
  TOOLBAR_Y - 30 - CONDITION_ORDER.length * 30 - 8 + 19 + i * 30,
];

const KEY = { x: CONTENT.right - 196, width: 196 } as const;

/** The key: a side panel naming each symbol, shown once a condition is chosen. */
function Key({
  condition,
  atRisk,
  k,
}: {
  condition: Condition;
  atRisk: boolean;
  k: number;
}) {
  if (k <= 0) return null;
  const rows: PedigreeStatus[] = atRisk
    ? [
        'affected',
        'obligateCarrier',
        'atRiskAffected',
        'atRiskCarrier',
        'unknown',
      ]
    : ['affected', 'obligateCarrier', 'unknown'];
  const shape: PedigreeShape = 'square';
  return (
    <g transform={`translate(${(1 - k) * (KEY.width + 10)} 0)`}>
      <rect
        x={KEY.x}
        y={CONTENT.y}
        width={KEY.width}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-cyber-grape"
      />
      <text
        x={KEY.x + 14}
        y={CONTENT.y + 28}
        fontSize={15}
        fontWeight={900}
        className="fill-white"
      >
        {TEXT.key}
      </text>
      {rows.map((status, i) => {
        const y = CONTENT.y + 62 + i * 46;
        return (
          <g key={status}>
            <g
              transform={`translate(${KEY.x + 26} ${y}) scale(0.55) translate(${-(KEY.x + 26)} ${-y})`}
            >
              <PedigreePerson
                at={[KEY.x + 26, y]}
                shape={shape}
                label=""
                condition={{
                  status,
                  fill: condition.fill,
                  stroke: condition.stroke,
                }}
              />
            </g>
            <text
              x={KEY.x + 46}
              y={y + 4}
              fontSize={10.5}
              fontWeight={700}
              className="fill-white"
            >
              {TEXT.rows[status]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Shifts the family left, clear of the key. */
const KEY_SHIFT = -75;

/** Centres the toolbar in the space the key leaves. */
const TOOLBAR_SHIFT = -KEY.width / 2;

/**
 * Shows a narrative pedigree where the participant picks a condition from the
 * toolbar menu, each relative is marked with their status and a key appears,
 * and selecting the participant's own node highlights the relatives the
 * condition could have passed through.
 */
export const NarrativePedigreeIntroScene = defineScene(7.2, ({ t }) => {
  const menu = t >= 0.9 && t < 1.7 ? 1 : 0;
  const chosen = t >= 1.7 ? CONDITIONS.cf : undefined;
  const key = smooth(segment(t, 1.9, 0.5));
  const focused = t >= 4.2;
  const contributors: readonly FamilyMember[] = ['you', 'rose', 'david'];
  const shift = lerp(0, KEY_SHIFT, key);
  return {
    rail: { progress: 0.9 },
    body: (
      <>
        <g transform={`translate(${shift} 0)`}>
          <Family
            {...(chosen === undefined ? {} : { condition: chosen })}
            k={() => (chosen === undefined ? 1 : backOut(segment(t, 1.7, 0.4)))}
            dim={(member) => focused && !contributors.includes(member)}
          />
          {focused ? (
            <path
              d={`M ${FAMILY.you.at[0] - 8} ${FAMILY.you.at[1] - 40} h 16 l -8 10 Z`}
              className="fill-white"
            />
          ) : null}
        </g>
        <g transform={`translate(${lerp(0, TOOLBAR_SHIFT, key)} 0)`}>
          <Toolbar {...(chosen === undefined ? {} : { chosen })} />
          <ConditionMenu k={menu} />
        </g>
        <Key condition={CONDITIONS.cf} atRisk={false} k={key} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: SELECT_AT, at: 0.9 },
          { to: menuItemAt(0), at: 1.7, glide: 0.4 },
          { to: [FAMILY.you.at[0] + KEY_SHIFT, FAMILY.you.at[1]], at: 4.2 },
        ]}
        leave={4.8}
      />
    ),
  };
});

/** A row of the exported data table. */
function Row({
  x,
  y,
  cells,
  header = false,
  offsets,
  width,
}: {
  x: number;
  y: number;
  cells: readonly string[];
  header?: boolean;
  offsets: readonly number[];
  width: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={30}
        rx={header ? 8 : 0}
        className={header ? 'fill-cyber-grape' : 'fill-white/5'}
      />
      {cells.map((cell, i) => (
        <text
          key={`${i}-${cell}`}
          x={x + 12 + (offsets[i] ?? 0)}
          y={y + 20}
          fontSize={12}
          fontWeight={header ? 800 : 700}
          className="fill-white"
        >
          {cell}
        </text>
      ))}
    </g>
  );
}

/**
 * Shows how a narrative pedigree's data is exported: the nodes and the
 * condition attribute all come from the Family Pedigree, and this stage adds
 * nothing.
 */
export const NarrativePedigreeDataScene = defineScene(
  4.6,
  ({ t }) => {
    const x = CONTENT.x + 150;
    const width = 400;
    const offsets = [0, 140, 270];
    const rows = [
      ['Sam', 'male', 'true'],
      ['Rose', 'female', ''],
      ['David', 'male', ''],
    ];
    return {
      body: (
        <>
          <text
            x={x}
            y={CONTENT.y + 40}
            fontSize={12}
            fontWeight={800}
            className="fill-white/60 uppercase"
          >
            {TEXT.nodes}
          </text>
          <Row
            x={x}
            y={CONTENT.y + 50}
            cells={['name', 'sex_at_birth', 'has_cf']}
            header
            offsets={offsets}
            width={width}
          />
          {rows.map((cells, i) => (
            <g key={cells[0]} opacity={smooth(segment(t, 0.4 + i * 0.3, 0.3))}>
              <Row
                x={x}
                y={CONTENT.y + 80 + i * 30}
                cells={cells}
                offsets={offsets}
                width={width}
              />
            </g>
          ))}
          <Chip
            x={x + width / 2}
            y={CONTENT.y + 220}
            text={TEXT.nominated}
            size={13}
            k={backOut(segment(t, 1.6, 0.4))}
          />
          <Chip
            x={x + width / 2}
            y={CONTENT.y + 270}
            text={TEXT.nothing}
            size={14}
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 2.4, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/** A stage card in the protocol timeline. */
function StageCard({
  x,
  title,
  type,
  k = 1,
  faded = false,
}: {
  x: number;
  title: string;
  type: string;
  k?: number;
  faded?: boolean;
}) {
  if (k <= 0) return null;
  const y = CONTENT.y + 110;
  return (
    <g opacity={faded ? 0.4 : Math.min(1, k * 2)}>
      <rect
        x={x}
        y={y}
        width={170}
        height={96}
        rx={14}
        className="fill-cyber-grape"
      />
      <text
        x={x + 14}
        y={y + 30}
        fontSize={11}
        fontWeight={800}
        className="fill-white/60 uppercase"
      >
        {type}
      </text>
      <text
        x={x + 14}
        y={y + 56}
        fontSize={16}
        fontWeight={900}
        className="fill-white"
      >
        {title}
      </text>
    </g>
  );
}

/**
 * Shows a protocol where a narrative pedigree reads the family from an earlier
 * Family Pedigree, and a Family Pedigree that comes later is not offered.
 */
export const NarrativePedigreeSourceScene = defineScene(
  5.2,
  ({ t }) => {
    const cards = [CONTENT.x + 30, CONTENT.x + 262, CONTENT.x + 494];
    const arrow = smooth(segment(t, 1.2, 0.7));
    const from = (cards[0] ?? 0) + 85;
    const to = (cards[1] ?? 0) + 85;
    return {
      body: (
        <>
          <line
            x1={CONTENT.x + 20}
            y1={CONTENT.y + 158}
            x2={CONTENT.right - 20}
            y2={CONTENT.y + 158}
            className="stroke-white/15"
            strokeWidth={3}
          />
          <StageCard
            x={cards[0] ?? 0}
            type="Family Pedigree"
            title={TEXT.stages[0]}
          />
          <StageCard
            x={cards[1] ?? 0}
            type="Narrative Pedigree"
            title={TEXT.stages[1]}
          />
          <StageCard
            x={cards[2] ?? 0}
            type="Family Pedigree"
            title={TEXT.stages[2]}
            faded={t >= 3.0}
          />
          <path
            d={`M ${from} ${CONTENT.y + 104} Q ${(from + to) / 2} ${CONTENT.y + 20} ${to} ${CONTENT.y + 104}`}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - arrow}
            className="stroke-mustard fill-none"
            strokeWidth={4}
            strokeLinecap="round"
            opacity={arrow > 0 ? 1 : 0}
          />
          {arrow >= 1 ? (
            <path
              d={`M ${to - 9} ${CONTENT.y + 92} L ${to} ${CONTENT.y + 106} L ${to + 9} ${CONTENT.y + 92}`}
              className="stroke-mustard fill-none"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          <Chip
            x={(from + to) / 2}
            y={CONTENT.y + 250}
            text="Reads this family"
            size={13}
            k={backOut(segment(t, 1.9, 0.4))}
          />
          <Chip
            x={(cards[2] ?? 0) + 85}
            y={CONTENT.y + 250}
            text="Comes later: not offered"
            size={12}
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 3.0, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Protocol' },
);

/**
 * Shows a narrative pedigree where the participant picks three conditions in
 * turn from the toolbar menu, and each pick redraws the family in that
 * condition's color.
 */
export const NarrativePedigreeConditionsScene = defineScene(8.4, ({ t }) => {
  const picks = [
    { at: 1.4, key: 'cf' },
    { at: 3.8, key: 'ha' },
    { at: 6.2, key: 'hd' },
  ] as const;
  const opens = picks.map((p) => p.at - 0.6);
  const menu = picks.some((p, i) => t >= (opens[i] ?? 0) && t < p.at) ? 1 : 0;
  const current = picks.toReversed().find((p) => t >= p.at);
  const chosen = current === undefined ? undefined : CONDITIONS[current.key];
  return {
    rail: { progress: 0.9 },
    body: (
      <>
        <Family {...(chosen === undefined ? {} : { condition: chosen })} />
        <Toolbar {...(chosen === undefined ? {} : { chosen })} />
        <ConditionMenu k={menu} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={picks.flatMap((p, i) => [
          { to: SELECT_AT, at: opens[i] ?? 0 },
          {
            to: menuItemAt(CONDITION_ORDER.indexOf(p.key)),
            at: p.at,
            glide: 0.4,
          },
        ])}
        leave={6.8}
      />
    ),
  };
});

/**
 * Shows a narrative pedigree where the same family is marked under three
 * inheritance patterns, with possible statuses shown, so who carries the
 * condition and who may develop it changes with the pattern.
 */
export const NarrativePedigreePatternsScene = defineScene(9.0, ({ t }) => {
  const index = t < 3 ? 0 : t < 6 ? 1 : 2;
  const key = CONDITION_ORDER[index] ?? 'cf';
  const condition = CONDITIONS[key];
  const pop = backOut(segment(t, index * 3, 0.4));
  return {
    rail: { progress: 0.9 },
    body: (
      <>
        <g transform={`translate(${KEY_SHIFT} 0)`}>
          <Family condition={condition} atRisk k={() => pop} />
        </g>
        <Chip
          x={STAGE_CENTER_X + KEY_SHIFT}
          y={STAGE.bottom - 30}
          text={condition.pattern}
          size={15}
          k={pop}
        />
        <Key condition={condition} atRisk k={1} />
      </>
    ),
  };
});

const SWITCH: Point = [STAGE.x + 34, STAGE.bottom - 30];

/**
 * Shows a narrative pedigree where switching on possible statuses adds "may
 * develop" and "may carry" to the certain statuses, and switching them off
 * again shows those relatives as not known.
 */
export const NarrativePedigreeAtRiskScene = defineScene(6.4, ({ t }) => {
  const on = t >= 1.4 && t < 4.6;
  const knob =
    smooth(segment(t, 1.4, 0.25)) * (1 - smooth(segment(t, 4.6, 0.25)));
  return {
    rail: { progress: 0.9 },
    body: (
      <>
        <g transform={`translate(${KEY_SHIFT} 0)`}>
          <Family condition={CONDITIONS.cf} atRisk={on} />
        </g>
        <Key condition={CONDITIONS.cf} atRisk={on} k={1} />
      </>
    ),
    modal: (
      <g>
        <rect
          x={SWITCH[0] - 22}
          y={SWITCH[1] - 18}
          width={286}
          height={36}
          rx={18}
          className="fill-white"
        />
        <rect
          x={SWITCH[0] - 12}
          y={SWITCH[1] - 9}
          width={34}
          height={18}
          rx={9}
          className={knob > 0.5 ? 'fill-sea-green' : 'fill-navy-taupe/25'}
        />
        <circle
          cx={lerp(SWITCH[0] - 3, SWITCH[0] + 13, knob)}
          cy={SWITCH[1]}
          r={7}
          className="fill-white"
        />
        <text
          x={SWITCH[0] + 32}
          y={SWITCH[1] + 4.5}
          fontSize={12}
          fontWeight={800}
          className="fill-navy-taupe"
        >
          {TEXT.atRisk}
        </text>
      </g>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: SWITCH, at: 1.4 },
          { to: SWITCH, at: 4.6, glide: 0.3 },
        ]}
        leave={5.1}
      />
    ),
  };
});

const SNAPSHOT_ROWS: readonly PedigreeStatus[] = [
  'affected',
  'obligateCarrier',
  'unknown',
];

/**
 * Shows a narrative pedigree where the participant clicks the save snapshot
 * button and an image of the pedigree with its key is saved.
 */
export const NarrativePedigreeSnapshotScene = defineScene(5.6, ({ t }) => {
  const sheet = smooth(segment(t, 1.3, 0.7));
  const page = {
    x: STAGE_CENTER_X - 120,
    y: STAGE.y + 20,
    width: 240,
    height: 290,
  };
  return {
    rail: { progress: 0.9 },
    body: (
      <>
        <g opacity={1 - sheet * 0.6}>
          <Family condition={CONDITIONS.cf} />
        </g>
        <Toolbar chosen={CONDITIONS.cf} />
        {sheet > 0 ? (
          <g transform={`translate(0 ${(1 - sheet) * 300})`}>
            <rect
              x={page.x}
              y={page.y}
              width={page.width}
              height={page.height}
              rx={6}
              className="fill-white"
            />
            <text
              x={page.x + 16}
              y={page.y + 28}
              fontSize={13}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              {CONDITIONS.cf.name}
            </text>
            <g
              transform={`translate(${page.x + page.width / 2} ${page.y + 130}) scale(0.42) translate(${-STAGE_CENTER_X} ${-(STAGE.y + 140)})`}
            >
              <rect
                x={STAGE.x}
                y={STAGE.y}
                width={STAGE.right - STAGE.x}
                height={300}
                className="fill-navy-taupe"
              />
              <Family condition={CONDITIONS.cf} />
            </g>
            {SNAPSHOT_ROWS.map((status, i) => (
              <g key={status}>
                <rect
                  x={page.x + 20}
                  y={page.y + 220 + i * 20}
                  width={10}
                  height={10}
                  className={
                    status === 'affected'
                      ? CONDITIONS.cf.fill
                      : 'stroke-sea-green fill-none'
                  }
                  strokeWidth={2}
                />
                <text
                  x={page.x + 38}
                  y={page.y + 229 + i * 20}
                  fontSize={10}
                  fontWeight={700}
                  className="fill-navy-taupe"
                >
                  {TEXT.rows[status]}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        <Chip
          x={page.x + page.width + 90}
          y={STAGE.y + 150}
          text={TEXT.savedImage}
          size={14}
          k={backOut(segment(t, 2.4, 0.4))}
        />
      </>
    ),
    overlay: <Click t={t} stops={[{ to: SNAPSHOT_AT, at: 1.0 }]} leave={1.6} />,
  };
});
