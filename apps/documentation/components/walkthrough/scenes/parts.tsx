import { Check, type LucideIcon } from 'lucide-react';

import { Badge } from '@codaco/art/illustration/Badge';
import { ClickRing, Cursor } from '@codaco/art/illustration/Cursor';
import { grow, outline, segment, TAU } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

export type Point = readonly [number, number];

export const smooth = (x: number) => x * x * (3 - 2 * x);

export const lerp = (from: number, to: number, k: number) =>
  from + (to - from) * k;

export const pivot = (x: number, y: number, k: number) =>
  `translate(${x} ${y}) scale(${Math.max(0.001, k)}) translate(${-x} ${-y})`;

export const cubic = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  u: number,
): Point => {
  const v = 1 - u;
  return [
    v * v * v * p0[0] +
      3 * v * v * u * p1[0] +
      3 * v * u * u * p2[0] +
      u * u * u * p3[0],
    v * v * v * p0[1] +
      3 * v * v * u * p1[1] +
      3 * v * u * u * p2[1] +
      u * u * u * p3[1],
  ];
};

// A horizontal S-curve between two points, as the /updates scenes draw links.
export const link = (from: Point, to: Point) => {
  const mid = (from[0] + to[0]) / 2;
  const c1: Point = [mid, from[1]];
  const c2: Point = [mid, to[1]];
  return {
    d: `M${from[0]} ${from[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${to[0]} ${to[1]}`,
    at: (u: number) => cubic(from, c1, c2, to, u),
  };
};

// A lucide icon drawn into the scene, centered on (x, y).
export function Icon({
  icon: Glyph,
  x,
  y,
  size,
  className = 'text-navy-taupe',
}: {
  icon: LucideIcon;
  x: number;
  y: number;
  size: number;
  className?: string;
}) {
  return (
    <Glyph
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      strokeWidth={2.4}
      className={className}
    />
  );
}

// Three dots travelling along a link `since` seconds after they set off, the
// leader outlined, as the /updates scenes send data between things.
export function Particles({
  path,
  since,
  duration,
  fill = 'fill-mustard',
}: {
  path: { at: (u: number) => Point };
  since: number;
  duration: number;
  fill?: string;
}) {
  if (since <= 0 || since >= duration + 0.2) return null;
  const u = smooth(segment(since, 0, duration));
  return (
    <g>
      {[0, 0.08, 0.16].map((lag, index) => {
        const [x, y] = path.at(Math.max(0, u - lag));
        return (
          <circle
            key={lag}
            cx={x}
            cy={y}
            r={9 - index * 2}
            className={cx(fill, index === 0 && outline)}
            strokeWidth={3}
            opacity={1 - index * 0.3}
          />
        );
      })}
    </g>
  );
}

export function GroundShadow({
  cx: centerX,
  cy,
  rx,
}: {
  cx: number;
  cy: number;
  rx: number;
}) {
  return (
    <ellipse
      cx={centerX}
      cy={cy}
      rx={rx}
      ry={12}
      className="fill-navy-taupe/12"
    />
  );
}

// A white card with a header label and placeholder code lines.
export function CodeCard({
  x,
  y,
  title,
  accent = 'fill-purple-pizazz',
}: {
  x: number;
  y: number;
  title: string;
  accent?: string;
}) {
  const width = 300;
  const height = 190;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={width}
        height={height}
        rx={22}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <circle cx={30} cy={32} r={9} className={accent} />
      <text
        x={48}
        y={38}
        fontSize={17}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {title}
      </text>
      {[110, 170, 80, 140].map((w, index) => (
        <line
          key={index}
          x1={30 + (index % 2) * 24}
          y1={78 + index * 26}
          x2={30 + (index % 2) * 24 + w}
          y2={78 + index * 26}
          className={
            index === 2 ? 'stroke-purple-pizazz/50' : 'stroke-navy-taupe/20'
          }
          strokeWidth={8}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

// A clock whose wedge sweeps from twelve to `minutes` as `k` runs 0 → 1.
export function ClockFace({
  x,
  y,
  r,
  minutes,
  k,
  wedge,
}: {
  x: number;
  y: number;
  r: number;
  minutes: number;
  k: number;
  wedge: string;
}) {
  const turn = (minutes / 60) * k;
  const angle = turn * Math.PI * 2;
  const capped = Math.min(angle, Math.PI * 2 - 0.0001);
  const end: Point = [
    x + Math.sin(capped) * (r - 14),
    y - Math.cos(capped) * (r - 14),
  ];
  const large = capped > Math.PI ? 1 : 0;
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={r}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      {k > 0 ? (
        <path
          d={`M${x} ${y} L${x} ${y - r + 14} A${r - 14} ${r - 14} 0 ${large} 1 ${end[0]} ${end[1]} Z`}
          className={wedge}
        />
      ) : null}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={x + Math.sin(a) * (r - 10)}
            y1={y - Math.cos(a) * (r - 10)}
            x2={x + Math.sin(a) * (r - (i % 3 === 0 ? 26 : 18))}
            y2={y - Math.cos(a) * (r - (i % 3 === 0 ? 26 : 18))}
            className="stroke-navy-taupe/40"
            strokeWidth={i % 3 === 0 ? 6 : 4}
            strokeLinecap="round"
          />
        );
      })}
      <line
        x1={x}
        y1={y}
        x2={x + Math.sin(angle) * (r * 0.62)}
        y2={y - Math.cos(angle) * (r * 0.62)}
        className="stroke-navy-taupe"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r={11} className="fill-navy-taupe" />
    </g>
  );
}

// A database drawn as stacked discs; each of `levels` (0 → 1) pops one in.
export function DatabaseStack({
  x,
  y,
  levels,
}: {
  x: number;
  y: number;
  levels: number[];
}) {
  const rx = 90;
  const ry = 26;
  const gap = 54;
  return (
    <g>
      {levels.map((k, index) => {
        const cy = y - index * gap;
        if (k <= 0) return null;
        return (
          <g key={index} transform={pivot(x, cy, k)}>
            <path
              d={`M${x - rx} ${cy - gap + ry} V${cy} A${rx} ${ry} 0 0 0 ${x + rx} ${cy} V${cy - gap + ry}`}
              className={cx('fill-sea-green', outline)}
              strokeWidth={6}
              strokeLinejoin="round"
            />
            <ellipse
              cx={x}
              cy={cy - gap + ry}
              rx={rx}
              ry={ry}
              className={cx('fill-sea-green', outline)}
              strokeWidth={6}
            />
            <circle cx={x + 52} cy={cy - 6} r={7} className="fill-white/80" />
          </g>
        );
      })}
    </g>
  );
}

// A cloud silhouette: each circle is stroked wide first, then all are filled
// on top, leaving one outline around the merged shape.
const CLOUD = [
  [-70, 18, 52],
  [-12, -22, 66],
  [58, 4, 56],
  [0, 32, 48],
] as const;

export function Cloud({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {CLOUD.map(([cx0, cy0, r]) => (
        <circle
          key={`${cx0}-${cy0}`}
          cx={cx0}
          cy={cy0}
          r={r}
          className="fill-navy-taupe stroke-navy-taupe"
          strokeWidth={12}
        />
      ))}
      {CLOUD.map(([cx0, cy0, r]) => (
        <circle
          key={`fill-${cx0}-${cy0}`}
          cx={cx0}
          cy={cy0}
          r={r}
          className={fill}
        />
      ))}
    </g>
  );
}

// The /updates cursor: it fades in, glides from `from` to `to` with a small
// hop, clicks on arrival at `at`, and fades out at `leave`.
export function Click({
  t,
  from,
  to,
  at,
  leave,
  glide = 0.6,
}: {
  t: number;
  from: Point;
  to: Point;
  at: number;
  leave: number;
  glide?: number;
}) {
  const k = smooth(segment(t, at - glide, glide));
  const opacity =
    segment(t, at - glide - 0.3, 0.3) * (1 - segment(t, leave, 0.3));
  const tip: Point = [
    lerp(from[0], to[0], k),
    lerp(from[1], to[1], k) - Math.sin(Math.PI * k) * 30,
  ];
  return (
    <>
      <ClickRing
        at={to}
        progress={segment(t, at, 0.45)}
        stroke="stroke-sea-serpent"
      />
      {opacity > 0 ? (
        <Cursor tip={tip} fill="fill-sea-serpent" opacity={opacity} />
      ) : null}
    </>
  );
}

// A tilted, gently rocking check-mark stamp, popped in by `k`.
export function CheckStamp({
  x,
  y,
  k,
  t,
  fill = 'fill-sea-green',
  r = 46,
}: {
  x: number;
  y: number;
  k: number;
  t: number;
  fill?: string;
  r?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(k)})`}
    >
      <Badge r={r} fill={fill}>
        <Icon icon={Check} x={0} y={0} size={r * 1.1} className="text-white" />
      </Badge>
    </g>
  );
}

// Placeholder text: a rounded bar standing in for a line of copy.
export function TextBar({
  x,
  y,
  width,
  className = 'stroke-navy-taupe/20',
}: {
  x: number;
  y: number;
  width: number;
  className?: string;
}) {
  return (
    <line
      x1={x}
      y1={y}
      x2={x + width}
      y2={y}
      className={className}
      strokeWidth={10}
      strokeLinecap="round"
    />
  );
}
