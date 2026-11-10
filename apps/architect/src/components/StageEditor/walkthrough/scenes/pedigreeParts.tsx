import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { backOut } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { pivot, STAGE, STAGE_CENTER_X, type Point } from './parts';

export type PedigreeShape = 'circle' | 'square' | 'diamond';

/** A disease status as the Narrative Pedigree draws it. */
export type PedigreeStatus =
  | 'affected'
  | 'obligateAffected'
  | 'obligateCarrier'
  | 'atRiskAffected'
  | 'atRiskCarrier'
  | 'unknown';

/** Half the width of a person's symbol. */
export const SYMBOL_R = 22;

const QUERY = '?';

/** The rows of a three-generation family, top to bottom. */
export const GENERATION_Y = [
  STAGE.y + 48,
  STAGE.y + 138,
  STAGE.y + 228,
] as const;

/**
 * One family, three generations: George and Eleanor; their children Rose and
 * Tom; Rose's partner David; and Rose and David's children, the participant
 * and Sam.
 */
export const FAMILY = {
  george: {
    at: [STAGE_CENTER_X - 50, GENERATION_Y[0]],
    shape: 'square',
    label: 'George',
  },
  eleanor: {
    at: [STAGE_CENTER_X + 50, GENERATION_Y[0]],
    shape: 'circle',
    label: 'Eleanor',
  },
  david: {
    at: [STAGE_CENTER_X - 140, GENERATION_Y[1]],
    shape: 'square',
    label: 'David',
  },
  rose: {
    at: [STAGE_CENTER_X, GENERATION_Y[1]],
    shape: 'circle',
    label: 'Rose',
  },
  tom: {
    at: [STAGE_CENTER_X + 120, GENERATION_Y[1]],
    shape: 'square',
    label: 'Tom',
  },
  you: {
    at: [STAGE_CENTER_X - 120, GENERATION_Y[2]],
    shape: 'circle',
    label: 'You',
  },
  sam: {
    at: [STAGE_CENTER_X - 20, GENERATION_Y[2]],
    shape: 'square',
    label: 'Sam',
  },
} as const satisfies Record<
  string,
  { at: Point; shape: PedigreeShape; label: string }
>;

export type FamilyMember = keyof typeof FAMILY;

export const FAMILY_MEMBERS: readonly FamilyMember[] = [
  'george',
  'eleanor',
  'david',
  'rose',
  'tom',
  'you',
  'sam',
];

const midpoint = (a: Point, b: Point): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

/** The outline of a symbol centred on `at`. */
function outlinePath([x, y]: Point, shape: PedigreeShape, r: number) {
  if (shape === 'circle') {
    return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
  }
  if (shape === 'square') {
    return `M ${x - r} ${y - r} H ${x + r} V ${y + r} H ${x - r} Z`;
  }
  return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
}

/** How far a horizontal line `dy` from the centre reaches inside a symbol. */
function halfWidthAt(shape: PedigreeShape, r: number, dy: number) {
  if (shape === 'square') return r;
  if (shape === 'diamond') return Math.max(0, r - Math.abs(dy));
  return Math.sqrt(Math.max(0, r * r - dy * dy));
}

/** The standard notation for a status, drawn inside a white symbol. */
function Notation({
  at,
  shape,
  r,
  status,
  ink,
}: {
  at: Point;
  shape: PedigreeShape;
  r: number;
  status: PedigreeStatus;
  ink: string;
}) {
  const [x, y] = at;
  const inner = r - 4;
  const vertical = (broken: boolean) => (
    <line
      x1={x}
      y1={y - inner}
      x2={x}
      y2={y + inner}
      className={ink}
      strokeWidth={5}
      {...(broken ? { strokeDasharray: '6 5' } : {})}
    />
  );
  const hatch = (
    <>
      {[-12, -4, 4, 12].map((dy) => {
        const w = halfWidthAt(shape, inner, dy);
        return (
          <line
            key={dy}
            x1={x - w}
            y1={y + dy}
            x2={x + w}
            y2={y + dy}
            className={ink}
            strokeWidth={3}
          />
        );
      })}
    </>
  );
  const query = (
    <g>
      <circle
        cx={x + r * 0.62}
        cy={y - r * 0.62}
        r={9}
        className="stroke-navy-taupe fill-white"
        strokeWidth={1.5}
      />
      <text
        x={x + r * 0.62}
        y={y - r * 0.62 + 4.5}
        textAnchor="middle"
        fontSize={13}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {QUERY}
      </text>
    </g>
  );
  if (status === 'obligateAffected') {
    return vertical(false);
  }
  if (status === 'obligateCarrier') {
    return hatch;
  }
  if (status === 'atRiskAffected') {
    return (
      <>
        {vertical(true)}
        {query}
      </>
    );
  }
  if (status === 'atRiskCarrier') {
    return (
      <>
        {hatch}
        {query}
      </>
    );
  }
  return null;
}

/**
 * A person on a pedigree. Without a condition, a coloured symbol with the
 * label inside, as the Family Pedigree draws them. With a condition, the
 * Narrative Pedigree's white symbol carrying the status notation in the
 * condition's colour, with the label below.
 */
export function PedigreePerson({
  at,
  shape,
  label,
  k = 1,
  fill = 'fill-neon-coral',
  condition,
  dim = false,
  ring = 0,
  warning = false,
  adopted = false,
  labelBelow = false,
}: {
  at: Point;
  shape: PedigreeShape;
  label: string;
  k?: number;
  fill?: string;
  /** The condition's status and colour, once one is chosen. */
  condition?: Readonly<{
    status: PedigreeStatus;
    fill: string;
    stroke: string;
  }>;
  dim?: boolean;
  /** 0 to 1: the selection ring. */
  ring?: number;
  /** A warning badge, for a person missing details. */
  warning?: boolean;
  adopted?: boolean;
  /** Draw the label under the symbol, for words too long to fit inside. */
  labelBelow?: boolean;
}) {
  if (k <= 0) return null;
  const [x, y] = at;
  const r = SYMBOL_R;
  const opacity = dim ? 0.35 : 1;
  return (
    <g transform={pivot(x, y, backOut(Math.min(1, k)))} opacity={opacity}>
      {ring > 0 ? (
        <path
          d={outlinePath(at, shape, r + 6 * ring)}
          className="fill-white/70"
        />
      ) : null}
      {condition === undefined ? (
        <>
          <path d={outlinePath(at, shape, r)} className={fill} />
          <text
            x={x}
            y={labelBelow ? y + r + 15 : y + 4}
            textAnchor="middle"
            fontSize={labelBelow ? 11 : label.length > 6 ? 9 : 11}
            fontWeight={labelBelow ? 800 : 900}
            className="fill-white"
          >
            {label}
          </text>
        </>
      ) : (
        <>
          <path
            d={outlinePath(at, shape, r)}
            className={
              condition.status === 'affected' ? condition.fill : 'fill-white'
            }
          />
          <Notation
            at={at}
            shape={shape}
            r={r}
            status={condition.status}
            ink={condition.stroke}
          />
          <path
            d={outlinePath(at, shape, r)}
            className={cx('fill-none', condition.stroke)}
            strokeWidth={3.5}
          />
          <text
            x={x}
            y={y + r + 15}
            textAnchor="middle"
            fontSize={11}
            fontWeight={800}
            className="fill-white"
          >
            {label}
          </text>
        </>
      )}
      {adopted ? (
        <g className="fill-none stroke-white/80" strokeWidth={3}>
          <path d={`M ${x - r - 4} ${y - r - 4} h -6 v ${r * 2 + 8} h 6`} />
          <path d={`M ${x + r + 4} ${y - r - 4} h 6 v ${r * 2 + 8} h -6`} />
        </g>
      ) : null}
      {warning ? (
        <g>
          <circle
            cx={x + r * 0.8}
            cy={y - r * 0.8}
            r={9}
            className="fill-mustard"
          />
          <TriangleAlert
            x={x + r * 0.8 - 6}
            y={y - r * 0.8 - 6.5}
            width={12}
            height={12}
            strokeWidth={2.4}
            className="text-navy-taupe"
          />
        </g>
      ) : null}
    </g>
  );
}

/** A partnership: a line between two partners, broken by slashes once ended. */
export function PartnerLine({
  a,
  b,
  k = 1,
  ended = false,
}: {
  a: Point;
  b: Point;
  k?: number;
  ended?: boolean;
}) {
  if (k <= 0) return null;
  const [mx, my] = midpoint(a, b);
  const half = ((b[0] - a[0]) / 2) * Math.min(1, k);
  return (
    <g>
      <line
        x1={mx - half}
        y1={my}
        x2={mx + half}
        y2={my}
        className="stroke-white/70"
        strokeWidth={4}
      />
      {ended && k >= 1 ? (
        <g>
          <rect
            x={mx - 7}
            y={my - 4}
            width={14}
            height={8}
            className="fill-navy-taupe"
          />
          {[-4, 4].map((dx) => (
            <line
              key={dx}
              x1={mx + dx - 4}
              y1={my + 8}
              x2={mx + dx + 4}
              y2={my - 8}
              className="stroke-white/70"
              strokeWidth={3}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
}

/**
 * The lines from a couple (or a single parent) down to their children: a drop
 * from the parents, a bar across the children, and a drop to each child.
 * Adoptive and social parents are dashed.
 */
export function ChildLines({
  from,
  kids,
  k = 1,
  dashed = false,
}: {
  /** The point the drop leaves from: a couple's midpoint, or one parent. */
  from: Point;
  kids: readonly Point[];
  k?: number;
  dashed?: boolean;
}) {
  if (k <= 0 || kids.length === 0) return null;
  const childY = kids[0]?.[1] ?? from[1];
  const barY = (from[1] + childY) / 2 + 8;
  const xs = [from[0], ...kids.map((c) => c[0])];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const dash = dashed ? { strokeDasharray: '7 6' } : {};
  const grow = Math.min(1, k);
  return (
    <g opacity={grow}>
      <line
        x1={from[0]}
        y1={from[1]}
        x2={from[0]}
        y2={barY}
        className="stroke-white/70"
        strokeWidth={4}
        {...dash}
      />
      <line
        x1={left}
        y1={barY}
        x2={right}
        y2={barY}
        className="stroke-white/70"
        strokeWidth={4}
        {...dash}
      />
      {kids.map((c) => (
        <line
          key={`${c[0]}-${c[1]}`}
          x1={c[0]}
          y1={barY}
          x2={c[0]}
          y2={c[1] - SYMBOL_R}
          className="stroke-white/70"
          strokeWidth={4}
          {...dash}
        />
      ))}
    </g>
  );
}

/** The connecting lines of the standard family. */
export function FamilyLines({
  show = () => 1,
}: {
  /** 0 to 1 for each line, by the people it joins. */
  show?: (line: 'grandparents' | 'roseTom' | 'parents' | 'children') => number;
}) {
  const f = FAMILY;
  return (
    <>
      <PartnerLine a={f.george.at} b={f.eleanor.at} k={show('grandparents')} />
      <ChildLines
        from={midpoint(f.george.at, f.eleanor.at)}
        kids={[f.rose.at, f.tom.at]}
        k={show('roseTom')}
      />
      <PartnerLine a={f.david.at} b={f.rose.at} k={show('parents')} />
      <ChildLines
        from={midpoint(f.david.at, f.rose.at)}
        kids={[f.you.at, f.sam.at]}
        k={show('children')}
      />
    </>
  );
}

/** The interview's floating toolbar at the bottom centre of the stage. */
export function BottomToolbar({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  const x = STAGE_CENTER_X - width / 2;
  return (
    <g>
      <rect
        x={x}
        y={STAGE.bottom - 56}
        width={width}
        height={42}
        rx={21}
        className="fill-white/10 stroke-white/20"
        strokeWidth={2}
      />
      {children}
    </g>
  );
}

/** The y of the middle of the bottom toolbar. */
export const TOOLBAR_Y = STAGE.bottom - 35;
