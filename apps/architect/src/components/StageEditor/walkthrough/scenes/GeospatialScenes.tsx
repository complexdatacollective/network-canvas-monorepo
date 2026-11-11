import {
  GripHorizontal,
  LocateFixed,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';

import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { Card, DataTable, Heading } from './InterpreterScenes';
import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NEXT_BUTTON,
  PersonNode,
  pressAt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  type Point,
} from './parts';

const SAM = 'Sam';
const ANA = 'Ana';
const JO = 'Jo';

const OUTSIDE_VALUE = 'outside-selectable-areas';

const TEXT = {
  question: (name: string) => ['Which area does', `${name} live in?`],
  outside: 'Outside selectable areas',
  answered: 'Answers',
  attributeList: 'Node attribute list',
  columns: ['name', 'home_area'],
  properties: 'Area properties',
  property: 'Map selection property',
  saved: 'home_area: 1702',
} as const;

type Area = Readonly<{ value: string; points: readonly Point[] }>;

/** The selectable areas of the layer, each labeled by its tract ID. */
const AREAS: readonly Area[] = [
  {
    value: '1701',
    points: [
      [110, 95],
      [265, 85],
      [285, 205],
      [125, 222],
    ],
  },
  {
    value: '1702',
    points: [
      [265, 85],
      [455, 105],
      [440, 220],
      [285, 205],
    ],
  },
  {
    value: '1703',
    points: [
      [125, 222],
      [285, 205],
      [295, 355],
      [140, 375],
    ],
  },
  {
    value: '1704',
    points: [
      [285, 205],
      [440, 220],
      [470, 345],
      [295, 355],
    ],
  },
];

const centerOf = (value: string): Point => {
  const points = AREAS.find((a) => a.value === value)?.points ?? [];
  const sum = points.reduce<[number, number]>(
    (acc, [x, y]) => [acc[0] + x, acc[1] + y],
    [0, 0],
  );
  const n = Math.max(1, points.length);
  return [sum[0] / n, sum[1] / n];
};

const pathOf = (points: readonly Point[]) =>
  `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

/** The basemap's roads and river, beneath the areas. */
function Basemap() {
  return (
    <>
      <rect
        x={STAGE.x}
        y={STAGE.y}
        width={STAGE.right - STAGE.x}
        height={STAGE.bottom - STAGE.y}
        className="fill-white/5"
      />
      <path
        d={`M ${STAGE.x} ${STAGE.bottom - 20} C 250 330 450 400 ${STAGE.right} 360`}
        className="stroke-sea-serpent/40 fill-none"
        strokeWidth={14}
      />
      {[
        `M ${STAGE.x} 180 L ${STAGE.right} 160`,
        `M 330 ${STAGE.y} L 300 ${STAGE.bottom}`,
        `M ${STAGE.x} 290 Q 300 250 ${STAGE.right} 290`,
        `M 520 ${STAGE.y} L 560 ${STAGE.bottom}`,
      ].map((d) => (
        <path
          key={d}
          d={d}
          className="fill-none stroke-white/10"
          strokeWidth={6}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

/**
 * The layer's areas as the map draws them: every one outlined in the stage's
 * color, and the selected one filled with it at half strength.
 */
function Areas({
  selected,
  fill = 1,
  labels = false,
}: {
  selected?: string;
  fill?: number;
  labels?: boolean;
}) {
  return (
    <>
      {AREAS.map((area) => {
        const [cx0, cy0] = centerOf(area.value);
        return (
          <g key={area.value}>
            <path
              d={pathOf(area.points)}
              className="fill-ord-1 stroke-ord-1"
              fillOpacity={area.value === selected ? 0.5 * fill : 0}
              strokeWidth={3}
              strokeLinejoin="round"
            />
            {labels ? (
              <text
                x={cx0}
                y={cy0 + 8}
                textAnchor="middle"
                fontSize={22}
                fontWeight={800}
                className="fill-white/70"
              >
                {area.value}
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function Glyph({
  icon: Icon,
  at,
  size,
  className,
}: {
  icon: LucideIcon;
  at: Point;
  size: number;
  className: string;
}) {
  return (
    <Icon
      x={at[0] - size / 2}
      y={at[1] - size / 2}
      width={size}
      height={size}
      strokeWidth={2.4}
      className={className}
    />
  );
}

const TOOLBAR = {
  x: STAGE.right - 60,
  y: STAGE.bottom - 148,
  width: 44,
  height: 132,
} as const;

/** The zoom in, zoom out and recenter buttons at the bottom right. */
function MapToolbar() {
  const icons = [ZoomIn, ZoomOut, LocateFixed];
  return (
    <>
      <rect
        x={TOOLBAR.x}
        y={TOOLBAR.y}
        width={TOOLBAR.width}
        height={TOOLBAR.height}
        rx={12}
        className="fill-cyber-grape/90"
      />
      {icons.map((icon, i) => (
        <Glyph
          key={icon.displayName ?? i}
          icon={icon}
          at={[TOOLBAR.x + TOOLBAR.width / 2, TOOLBAR.y + 24 + i * 42]}
          size={22}
          className="text-white"
        />
      ))}
    </>
  );
}

const CARD = {
  x: STAGE.right - 198,
  y: STAGE.y + 16,
  width: 182,
  height: 176,
} as const;
const CARD_CENTER_X = CARD.x + CARD.width / 2;
const NODE_Y = CARD.y + 106;
const OUTSIDE_BUTTON: Point = [CARD_CENTER_X, CARD.y + 152];

/**
 * The prompt panel at the top right: a grip, the prompt naming the alter
 * being placed, that alter, and the outside-areas button. On a new alter the
 * old one leaves upward and the next arrives from below.
 */
function PromptPanel({
  from,
  to = from,
  swap = 0,
  outsideDisabled = false,
}: {
  from: string;
  to?: string;
  /** 0 to 1, the alter changing from `from` to `to`. */
  swap?: number;
  outsideDisabled?: boolean;
}) {
  const leaving = smooth(Math.min(1, swap * 2));
  const arriving = smooth(Math.max(0, swap * 2 - 1));
  const named = swap < 0.5 ? from : to;
  return (
    <>
      <Card x={CARD.x} y={CARD.y} width={CARD.width} height={CARD.height} />
      <Glyph
        icon={GripHorizontal}
        at={[CARD_CENTER_X, CARD.y + 16]}
        size={16}
        className="text-white/50"
      />
      {TEXT.question(named).map((line, i) => (
        <text
          key={line}
          x={CARD_CENTER_X}
          y={CARD.y + 44 + i * 20}
          textAnchor="middle"
          fontSize={15}
          fontWeight={600}
          className="fill-white"
        >
          {line}
        </text>
      ))}
      {swap < 0.5 ? (
        <g opacity={1 - leaving} transform={`translate(0 ${-leaving * 14})`}>
          <PersonNode x={CARD_CENTER_X} y={NODE_Y} label={from} k={1} r={24} />
        </g>
      ) : (
        <g opacity={arriving} transform={`translate(0 ${(1 - arriving) * 14})`}>
          <PersonNode x={CARD_CENTER_X} y={NODE_Y} label={to} k={1} r={24} />
        </g>
      )}
      <g opacity={outsideDisabled ? 0.5 : 1}>
        <Chip
          x={OUTSIDE_BUTTON[0]}
          y={OUTSIDE_BUTTON[1]}
          text={TEXT.outside}
          size={11}
          fill="fill-sea-green"
          ink="fill-white"
        />
      </g>
    </>
  );
}

const DESELECT: Point = [STAGE_CENTER_X - 40, STAGE.y + 200];

/**
 * The map dimmed under the outside-areas label, with the button that takes
 * the choice back.
 */
function OutsideOverlay({ k }: { k: number }) {
  if (k <= 0) return null;
  return (
    <g opacity={k}>
      <rect
        x={STAGE.x}
        y={STAGE.y}
        width={STAGE.right - STAGE.x}
        height={STAGE.bottom - STAGE.y}
        className="fill-navy-taupe"
        opacity={0.75}
      />
      <text
        x={DESELECT[0]}
        y={DESELECT[1] - 38}
        textAnchor="middle"
        fontSize={17}
        fontWeight={800}
        className="fill-white"
      >
        {TEXT.outside}
      </text>
      <circle
        cx={DESELECT[0]}
        cy={DESELECT[1]}
        r={18}
        className="fill-sea-green"
      />
      <Glyph icon={X} at={DESELECT} size={18} className="text-white" />
    </g>
  );
}

/**
 * Shows a geospatial stage where the participant selects an area for one alter
 * and clicks Next, and the next alter appears with nothing selected until the
 * participant selects its area.
 */
export const GeospatialIntroScene = defineScene(6.4, ({ t }) => {
  const first = centerOf('1702');
  const second = centerOf('1703');
  const next = 2.6;
  const swap = smooth(segment(t, next, 0.6));
  const firstFill =
    smooth(segment(t, 1.4, 0.25)) * (1 - smooth(segment(t, next, 0.25)));
  const secondFill = smooth(segment(t, 4.0, 0.25));
  const placed = (t >= 1.5 && t < next) || t >= 4.1;
  return {
    rail: {
      progress: t < next ? 0.6 : 0.62,
      pulse: placed,
      pulseFrom: t < next ? 1.5 : 4.1,
      press: pressAt(t, [next]),
    },
    body: (
      <>
        <Basemap />
        <Areas
          selected={t < next ? '1702' : '1703'}
          fill={t < next ? firstFill : secondFill}
        />
        <MapToolbar />
        <PromptPanel from={SAM} to={ANA} swap={swap} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: first, at: 1.4 },
          { to: NEXT_BUTTON, at: next },
          { to: second, at: 4.0 },
        ]}
        leave={4.6}
      />
    ),
  };
});

/** When the data scene's row `k` is answered. */
const answeredAt = (k: number) => 0.6 + k * 1.2;

/**
 * Shows how a geospatial stage's data is exported: the property value of each
 * alter's selected area fills that alter's row, and an alter marked outside the
 * selectable areas gets the value outside-selectable-areas.
 */
export const GeospatialDataScene = defineScene(
  5.4,
  ({ t }) => {
    const answers = [
      { name: SAM, value: '1702' },
      { name: ANA, value: '1703' },
      { name: JO, value: OUTSIDE_VALUE },
    ];
    const tableX = CONTENT.x + 272;
    const top = CONTENT.y + 70;
    const current = answers.findLast((_, i) => t >= answeredAt(i));
    const fill = current
      ? smooth(segment(t, answeredAt(answers.indexOf(current)), 0.3))
      : 0;
    return {
      body: (
        <>
          <Heading x={CONTENT.x + 30} y={CONTENT.y + 44} text={TEXT.answered} />
          <g transform="translate(-40 70) scale(0.6)">
            <Areas selected={current?.value} fill={fill} labels />
          </g>
          {current ? (
            <PersonNode
              x={CONTENT.x + 60}
              y={CONTENT.bottom - 50}
              label={current.name}
              k={backOut(
                segment(t, answeredAt(answers.indexOf(current)) - 0.3, 0.4),
              )}
              r={26}
            />
          ) : null}
          <Chip
            x={CONTENT.x + 95}
            y={CONTENT.bottom - 50}
            text={TEXT.outside}
            size={11}
            align="start"
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, answeredAt(2), 0.4))}
          />
          <Heading x={tableX} y={CONTENT.y + 44} text={TEXT.attributeList} />
          <DataTable
            x={tableX}
            y={top}
            columns={TEXT.columns}
            rows={answers.map((a) => [a.name, a.value])}
            reveal={(row, cell) =>
              smooth(segment(t, answeredAt(row) + (cell === 1 ? 0.4 : 0), 0.4))
            }
            colWidth={205}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/**
 * Shows a geospatial stage's map layer, where a selected area carries several
 * properties, and the map selection property, TRACTID, is the one whose value
 * is saved on the alter.
 */
export const GeospatialPropertyScene = defineScene(
  5.0,
  ({ t }) => {
    const rows = [
      ['TRACTID', '1702'],
      ['name', 'Riverside'],
      ['population', '4120'],
    ] as const;
    const card = { x: CONTENT.x + 300, y: CONTENT.y + 70, width: 360 };
    const pick = smooth(segment(t, 1.4, 0.4));
    const save = backOut(segment(t, 2.8, 0.5));
    return {
      body: (
        <>
          <g transform="translate(-40 70) scale(0.6)">
            <Areas selected="1702" fill={smooth(segment(t, 0.4, 0.4))} />
          </g>
          <Card x={card.x} y={card.y} width={card.width} height={200} />
          <Heading x={card.x + 24} y={card.y + 36} text={TEXT.properties} />
          {rows.map(([key, value], i) => {
            const y = card.y + 64 + i * 42;
            const chosen = i === 0;
            return (
              <g key={key} opacity={backOut(segment(t, 0.4 + i * 0.2, 0.4))}>
                <rect
                  x={card.x + 16}
                  y={y}
                  width={card.width - 32}
                  height={34}
                  rx={8}
                  className={cx(
                    'fill-white/5',
                    chosen ? 'stroke-sea-green' : 'stroke-transparent',
                  )}
                  strokeWidth={3}
                  strokeOpacity={chosen ? pick : 0}
                />
                <text
                  x={card.x + 30}
                  y={y + 23}
                  fontSize={15}
                  fontWeight={800}
                  className="fill-white/70"
                >
                  {key}
                </text>
                <text
                  x={card.x + 180}
                  y={y + 23}
                  fontSize={15}
                  fontWeight={700}
                  className="fill-white"
                >
                  {value}
                </text>
              </g>
            );
          })}
          <Chip
            x={card.x}
            y={card.y - 24}
            text={TEXT.property}
            size={12}
            align="start"
            fill="fill-sea-green"
            ink="fill-white"
            k={pick}
          />
          <PersonNode
            x={lerp(card.x + 40, card.x + 60, save)}
            y={CONTENT.bottom - 50}
            label={SAM}
            k={save}
            r={26}
          />
          <Chip
            x={card.x + 100}
            y={CONTENT.bottom - 50}
            text={TEXT.saved}
            size={13}
            align="start"
            k={backOut(segment(t, 3.2, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Map layer' },
);

/**
 * Shows a geospatial stage where the participant selects the map outside every
 * area to mark the alter as outside, takes that back with the cross, and then
 * marks the alter as outside with the button in the panel.
 */
export const GeospatialOutsideScene = defineScene(6.0, ({ t }) => {
  const outsidePoint: Point = [STAGE.right - 150, STAGE.bottom - 50];
  const overlay =
    smooth(segment(t, 1.2, 0.3)) * (1 - smooth(segment(t, 3.0, 0.3))) +
    smooth(segment(t, 4.4, 0.3));
  const outside = (t >= 1.2 && t < 3.0) || t >= 4.4;
  return {
    rail: {
      progress: 0.6,
      pulse: outside,
      pulseFrom: t < 3.0 ? 1.2 : 4.4,
    },
    body: (
      <>
        <Basemap />
        <Areas />
        <MapToolbar />
        <OutsideOverlay k={overlay} />
        <PromptPanel from={SAM} outsideDisabled={outside} />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: outsidePoint, at: 1.2 },
          { to: DESELECT, at: 3.0 },
          { to: OUTSIDE_BUTTON, at: 4.4 },
        ]}
        leave={5.0}
      />
    ),
  };
});
