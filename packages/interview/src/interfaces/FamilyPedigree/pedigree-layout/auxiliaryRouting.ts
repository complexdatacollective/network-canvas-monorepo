import type { LineSegment, PedigreeSymbolShape, Point } from './types';

/**
 * Routing for the lines that join a parent to a child outside the child's
 * line of descent: donors, surrogates, birth parents of an adopted child, and
 * any other parent the child's family does not name.
 *
 * Such a line ends at the top of the child, where every line into the child
 * converges on one point (Round 5, after Bennett et al. 2022), or at a point
 * on the child's line of descent: on their sibling bar, at the top of a
 * run's stem or a child's line up, or at the top of an only child. Every
 * target is reached by the same shapes of course: straight, or routed
 * through the gaps between rows. A line is drawn straight unless a bent
 * course crosses fewer lines, or the straight course breaks a hard
 * constraint. The lines are routed one after another and then each again
 * against all the others.
 *
 * A parent on the child's own row (a relative of the child's generation who
 * raises them, such as a sibling or cousin, while the child stays in their
 * birth family) is joined below the row, into the child's bottom edge: a line
 * along the row would read as a partnership, and one above it as a line of
 * descent. Donors and surrogates never share the child's row.
 *
 * A couple who raise a relative's child together are joined to the child by
 * one line, which leaves the couple's own line of descent sideways, as a T
 * on its upright stem, or, with no line of descent, starts on their
 * partnership line where one would drop from.
 *
 * All coordinates are in layout units: x in columns, y in rows.
 */

/** A person's symbol, as the router keeps clear of it. */
type Symbol = {
  person: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Where lines meet the symbol's edge; unknown, a line ends where it
   * would meet any of them. */
  shape?: PedigreeSymbolShape;
};

/** A line already drawn, which a routed line must keep clear of. */
export type DrawnLine = {
  segment: LineSegment;
  /** What the line is: a piece of a line of descent (a sibling bar, or an
   * upright piece), a partnership line, or another owner's line. */
  kind: 'bar' | 'upline' | 'partnership' | 'other';
  /** For auxiliary lines: whose line this is, so one parent's lines to
   * several children may share their way down. */
  owner?: string;
  /** For an auxiliary line that ends on a child: the child. */
  endsOn?: number;
  /** For a line into a child (an auxiliary line, or the line up of their
   * line of descent): where its owner sits across the page, the middle of
   * a couple, which the order the lines arrive in keeps (constraint 7). */
  ownerX?: number;
  /** For an auxiliary line: everyone who owns it, none of whose other
   * lines it may cross (constraint 9). */
  people?: number[];
};

export type RoutingScene = {
  boxWidth: number;
  boxHeight: number;
  symbols: Symbol[];
  /** Each bracketed person's two brackets. */
  brackets: Symbol[];
  lines: DrawnLine[];
  /** The x of everyone on each row, for finding a way down between them. */
  rowXs: number[][];
  /** By the row above each gap: the height of the highest sibling bar in
   * the gap below it, where a sibship's runs raised it above the middle. */
  barTops?: Map<number, number>;
};

export type RouteEnd =
  | {
      /** The top of a child, where every line into them converges. */
      kind: 'child';
      person: number;
      x: number;
      layer: number;
      shape?: PedigreeSymbolShape;
    }
  | {
      /** A point on the children's line of descent, which the line meets
       * from above: on a sibling bar, at the top of a run's stem or a
       * child's line up, or at the top of an only child. */
      kind: 'join';
      /** The places it may end, best first. */
      points: Point[];
      /** The one child it reaches, if it reaches one: on their top, or at
       * the top of their line up. */
      reaches?: number;
      /** The children's row. */
      layer: number;
    };

/** How far apart two junctions on one line are, at least, and how far a
 * junction keeps from the ends and corners of the line it meets, as a
 * fraction of a symbol. */
export const JUNCTION_CLEARANCE = 0.2;
/** How close a line may run beside another line, leave a symbol beside
 * another line, or pass a symbol it does not join, as a fraction of a
 * symbol. */
export const LINE_CLEARANCE = 0.25;

const ON = 0.004; // about a pixel
// The brackets as PersonNode draws them, a sixth of the symbol's width
// across from a twenty-fourth outside its edge, reaching a twelfth of its
// height above and below it, with the stroke's half width around them.
const BRACKET_OUTSET = 0.19; // of the box width: the brackets' outer edge
const BRACKET_INSET = 0.015; // of the box width: their arms' inner ends
const BRACKET_OVERHANG = 0.11; // of the box height, above and below
/** How far outside a bracketed person's symbol a partnership line stops,
 * at the outer edge of their bracket, as a fraction of the box width. */
export const BRACKET_REACH = BRACKET_OUTSET;

/** A person's symbol and, for an adopted person, their brackets. */
export function symbolOf(
  person: number,
  x: number,
  layer: number,
  boxWidth: number,
  boxHeight: number,
  bracketed: boolean,
  shape?: PedigreeSymbolShape,
): { symbol: Symbol; brackets: Symbol[] } {
  const symbol = {
    person,
    left: x - boxWidth / 2,
    right: x + boxWidth / 2,
    top: layer,
    bottom: layer + boxHeight,
    ...(shape ? { shape } : {}),
  };
  if (!bracketed) return { symbol, brackets: [] };
  const top = layer - boxHeight * BRACKET_OVERHANG;
  const bottom = layer + boxHeight * (1 + BRACKET_OVERHANG);
  return {
    symbol,
    brackets: [-1, 1].map((side) => {
      const inner = x + side * boxWidth * (0.5 + BRACKET_INSET);
      const outer = x + side * boxWidth * (0.5 + BRACKET_OUTSET);
      return {
        person,
        left: Math.min(inner, outer),
        right: Math.max(inner, outer),
        top,
        bottom,
      };
    }),
  };
}

/** The middles of the gaps between `stops`, widest first, leaving out gaps
 * too narrow to tell two lines apart in. */
const gapMiddles = (stops: number[]) => {
  const sorted = [...new Set(stops)].toSorted((a, b) => a - b);
  const gaps: { at: number; width: number }[] = [];
  for (let k = 0; k + 1 < sorted.length; k++) {
    const width = sorted[k + 1]! - sorted[k]!;
    if (width > 4 * ON) gaps.push({ at: sorted[k]! + width / 2, width });
  }
  return gaps.toSorted((a, b) => b.width - a.width).map((gap) => gap.at);
};

/** A square's rounded corners, as a fraction of its width. */
const CORNER_RADIUS = 0.25;

/**
 * How far below the top of its box a symbol's edge lies at `offset` from the
 * middle (both as fractions of the box). A circle's edge curves away; a
 * square's is flat but for its rounded corners; a diamond (a square turned
 * and scaled to 0.85) has its tip a tenth of the box above the box's top.
 * Unknown, the deepest of the three. Symbols are symmetric, so the same
 * depth measures up from the bottom.
 */
function edgeDepth(shape: PedigreeSymbolShape | undefined, offset: number) {
  const o = Math.min(Math.abs(offset), 0.5);
  const circle = 0.5 - Math.sqrt(Math.max(0, 0.25 - o * o));
  const diamond = Math.max(0, o - 0.1);
  const intoCorner = o - (0.5 - CORNER_RADIUS);
  const square =
    intoCorner <= 0
      ? 0
      : CORNER_RADIUS -
        Math.sqrt(Math.max(0, CORNER_RADIUS ** 2 - intoCorner ** 2));
  if (shape === 'circle') return circle;
  if (shape === 'square') return square;
  if (shape === 'diamond') return diamond;
  return Math.max(circle, diamond, square);
}

/** The top of a symbol: a diamond's tip stands a tenth of the box above
 * the box's top. */
export const symbolTop = (
  layer: number,
  boxHeight: number,
  shape: PedigreeSymbolShape | undefined,
) => layer - (shape === 'diamond' ? 0.1 * boxHeight : 0);

/**
 * How far a point lies outside a symbol, as a fraction of the symbol
 * (negative inside): a circle, a square with rounded corners, or a diamond
 * (a square turned and scaled to 0.85); unknown, the box itself.
 */
function outsideSymbol(
  p: Point,
  symbol: { left: number; right: number; top: number; bottom: number },
  shape: PedigreeSymbolShape | undefined,
): number {
  const width = symbol.right - symbol.left;
  const height = symbol.bottom - symbol.top;
  const dx = Math.abs(p.x - (symbol.left + symbol.right) / 2) / width;
  const dy = Math.abs(p.y - (symbol.top + symbol.bottom) / 2) / height;
  if (shape === 'circle') return Math.hypot(dx, dy) - 0.5;
  if (shape === 'diamond')
    return (dx + dy - 0.5 * 0.85 * Math.SQRT2) / Math.SQRT2;
  const radius = shape === 'square' ? CORNER_RADIUS : 0;
  const qx = dx - (0.5 - radius);
  const qy = dy - (0.5 - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

/**
 * The places along a sibling bar where a line may join it, nearest
 * `towardX` first: in each stretch between the bar's ends and the lines
 * already meeting it, the point nearest `towardX` at least `clearance`
 * from both. Never none: once every stretch is too short, the middle of
 * the widest.
 */
export function barPoints(
  bar: LineSegment,
  taken: number[],
  towardX: number,
  clearance: number,
): Point[] {
  const from = Math.min(bar.x1, bar.x2);
  const to = Math.max(bar.x1, bar.x2);
  const stops = [
    ...new Set([
      from,
      to,
      ...taken.filter((x) => x >= from - ON && x <= to + ON),
    ]),
  ].toSorted((a, b) => a - b);
  const xs: number[] = [];
  for (let k = 0; k + 1 < stops.length; k++) {
    const [a, b] = [stops[k]! + clearance, stops[k + 1]! - clearance];
    if (b >= a - 1e-9) xs.push(Math.max(a, Math.min(b, towardX)));
  }
  if (xs.length === 0) xs.push(gapMiddles(stops)[0] ?? (from + to) / 2);
  return xs
    .toSorted((a, b) => Math.abs(a - towardX) - Math.abs(b - towardX))
    .map((x) => ({ x, y: bar.y1 }));
}

const pieces = (points: Point[]): LineSegment[] =>
  points.slice(1).flatMap((point, k) => {
    const from = points[k]!;
    if (Math.hypot(point.x - from.x, point.y - from.y) < ON) return [];
    return [{ type: 'line', x1: from.x, y1: from.y, x2: point.x, y2: point.y }];
  });

/** The points with repeats and straight-through corners removed. */
function simplify(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < ON) continue;
    kept.push(point);
  }
  for (let k = kept.length - 2; k > 0; k--) {
    const [a, b, c] = [kept[k - 1]!, kept[k]!, kept[k + 1]!];
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(turn) < 1e-9) kept.splice(k, 1);
  }
  return kept;
}

const segmentLength = (s: LineSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

function distanceToSegment(p: Point, s: LineSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2),
        );
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

/** The stretch of a segment inside a rectangle, as fractions of the way
 * along it, if any. */
function clipRange(s: LineSegment, r: Symbol): [number, number] | undefined {
  // Liang–Barsky clipping.
  let t0 = 0;
  let t1 = 1;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (
    clip(-dx, s.x1 - r.left) &&
    clip(dx, r.right - s.x1) &&
    clip(-dy, s.y1 - r.top) &&
    clip(dy, r.bottom - s.y1)
  ) {
    return [t0, t1];
  }
  return undefined;
}

/** How near a segment comes to a symbol as it is drawn, as a fraction of
 * the symbol (negative inside it).
 */
function nearestOutside(
  s: LineSegment,
  symbol: Symbol,
  boxWidth: number,
  boxHeight: number,
): number {
  const at = (t: number) =>
    outsideSymbol(
      { x: s.x1 + t * (s.x2 - s.x1), y: s.y1 + t * (s.y2 - s.y1) },
      symbol,
      symbol.shape,
    );
  const length = Math.hypot(
    (s.x2 - s.x1) / boxWidth,
    (s.y2 - s.y1) / boxHeight,
  );
  const steps = Math.max(1, Math.ceil(length / 0.02));
  if (steps <= 24) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let k = 0; k <= steps; k++) nearest = Math.min(nearest, at(k / steps));
    return nearest;
  }
  // Every symbol is convex, so how far outside it a point lies changes along
  // a segment with one least value: found by narrowing in on it.
  let [lo, hi] = [0, 1];
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = hi - ratio * (hi - lo);
  let b = lo + ratio * (hi - lo);
  let [fa, fb] = [at(a), at(b)];
  while (hi - lo > 1e-4) {
    if (fa < fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - ratio * (hi - lo);
      fa = at(a);
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + ratio * (hi - lo);
      fb = at(b);
    }
  }
  return Math.min(fa, fb, at(0), at(1));
}

/** The part of a segment inside a rectangle, as a length. */
function lengthInside(s: LineSegment, r: Symbol): number {
  const range = clipRange(s, r);
  return range ? Math.max(0, range[1] - range[0]) * segmentLength(s) : 0;
}

const strictlyInside = (p: Point, r: Symbol) =>
  p.x > r.left + ON &&
  p.x < r.right - ON &&
  p.y > r.top + ON &&
  p.y < r.bottom - ON;

/** Where a segment with one end inside a symbol's box crosses its edge. */
function edgeCrossing(s: LineSegment, r: Symbol): Point | undefined {
  const fromInside = strictlyInside({ x: s.x1, y: s.y1 }, r);
  const toInside = strictlyInside({ x: s.x2, y: s.y2 }, r);
  if (fromInside === toInside) return undefined;
  const range = clipRange(s, r);
  if (!range) return undefined;
  const t = fromInside ? range[1] : range[0];
  return { x: s.x1 + t * (s.x2 - s.x1), y: s.y1 + t * (s.y2 - s.y1) };
}

/** The stretch two segments share along one line, outside the given boxes. */
function sharedRun(a: LineSegment, b: LineSegment, outside: Symbol[]): number {
  const len = segmentLength(a);
  if (len < ON || segmentLength(b) < ON) return 0;
  const dx = (a.x2 - a.x1) / len;
  const dy = (a.y2 - a.y1) / len;
  const off = (x: number, y: number) =>
    Math.abs((x - a.x1) * dy - (y - a.y1) * dx);
  if (off(b.x1, b.y1) > ON || off(b.x2, b.y2) > ON) return 0;
  const along = (x: number, y: number) => (x - a.x1) * dx + (y - a.y1) * dy;
  const [b1, b2] = [along(b.x1, b.y1), along(b.x2, b.y2)].toSorted(
    (p, q) => p - q,
  );
  const from = Math.max(0, b1!);
  const to = Math.min(len, b2!);
  if (to - from < ON) return 0;
  const shared: LineSegment = {
    type: 'line',
    x1: a.x1 + dx * from,
    y1: a.y1 + dy * from,
    x2: a.x1 + dx * to,
    y2: a.y1 + dy * to,
  };
  const hidden = outside.reduce(
    (total, box) => total + lengthInside(shared, box),
    0,
  );
  return Math.max(0, to - from - hidden);
}

/** How far either side of a hop, or of a line's ends, two lines are not
 * taken as running close, as a fraction of a symbol. */
const HOP_REACH = 0.3;

/**
 * The stretches over which segment `a` runs within `LINE_CLEARANCE` of
 * segment `b` without running along it (see `sharedRun`), as distances
 * along `a` in symbols, outside the given boxes and away from the `exempt`
 * points (where they cross, drawn as a hop, and the ends of the line), which
 * break a stretch. A course's stretches beside one line run on from one of
 * its pieces into the next (see `courseCoster`).
 */
function closeStretches(
  a: LineSegment,
  b: LineSegment,
  boxWidth: number,
  boxHeight: number,
  outside: Symbol[],
  exempt: Point[],
): Interval[] {
  // In symbols: a symbol is as wide as it is high.
  const sym = (s: LineSegment): LineSegment => ({
    type: 'line',
    x1: s.x1 / boxWidth,
    y1: s.y1 / boxHeight,
    x2: s.x2 / boxWidth,
    y2: s.y2 / boxHeight,
  });
  const [sa, sb] = [sym(a), sym(b)];
  const length = segmentLength(sa);
  if (length < 1e-9) return [];
  // Where along `a` (as fractions of the way) it lies within `c` of `b`:
  // within `c` of its middle, or of either end.
  const within = (c: number): Interval[] => {
    const bx = sb.x2 - sb.x1;
    const by = sb.y2 - sb.y1;
    const lb = Math.hypot(bx, by);
    const spans: Interval[] = [
      nearPoint(sa, { x: sb.x1, y: sb.y1 }, c),
      nearPoint(sa, { x: sb.x2, y: sb.y2 }, c),
    ];
    if (lb > 1e-12) {
      // Along b (0 to 1 between its ends) and across it, at t along a:
      // both change steadily with t.
      const alongAt = (t: number) =>
        ((sa.x1 + t * (sa.x2 - sa.x1) - sb.x1) * bx +
          (sa.y1 + t * (sa.y2 - sa.y1) - sb.y1) * by) /
        (lb * lb);
      const acrossAt = (t: number) =>
        ((sa.x1 + t * (sa.x2 - sa.x1) - sb.x1) * by -
          (sa.y1 + t * (sa.y2 - sa.y1) - sb.y1) * bx) /
        lb;
      spans.push(
        intersect(
          between(alongAt(0), alongAt(1), 0, 1),
          between(acrossAt(0), acrossAt(1), -c, c),
        ),
      );
    }
    return union(spans);
  };
  // Not where the two touch, nor near the exempt points, nor under a symbol.
  const left = subtract(within(LINE_CLEARANCE), [
    ...within(ON / Math.min(boxWidth, boxHeight)),
    ...exempt.map((q) =>
      nearPoint(sa, { x: q.x / boxWidth, y: q.y / boxHeight }, HOP_REACH),
    ),
    ...outside.flatMap((box) => {
      const range = clipRange(a, {
        ...box,
        left: box.left + ON,
        right: box.right - ON,
        top: box.top + ON,
        bottom: box.bottom - ON,
      });
      return range ? [range] : [];
    }),
  ]);
  return left.map(([from, to]): Interval => [from * length, to * length]);
}

/** A stretch of a segment, as fractions of the way along it. */
type Interval = [number, number];

/** Where along segment `s` it lies within `c` of point `q`. */
function nearPoint(s: LineSegment, q: Point, c: number): Interval {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const fx = s.x1 - q.x;
  const fy = s.y1 - q.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - c * c;
  const disc = qb * qb - 4 * qa * qc;
  if (qa < 1e-18 || disc <= 0) return [1, 0];
  const root = Math.sqrt(disc);
  return [
    Math.max(0, (-qb - root) / (2 * qa)),
    Math.min(1, (-qb + root) / (2 * qa)),
  ];
}

/** Where along a segment (0 to 1) a quantity changing steadily from `at0`
 * to `at1` lies strictly between `low` and `high`. */
function between(
  at0: number,
  at1: number,
  low: number,
  high: number,
): Interval {
  const slope = at1 - at0;
  if (Math.abs(slope) < 1e-15) {
    return at0 > low && at0 < high ? [0, 1] : [1, 0];
  }
  const [t1, t2] = [(low - at0) / slope, (high - at0) / slope].toSorted(
    (p, q) => p - q,
  );
  return [Math.max(0, t1!), Math.min(1, t2!)];
}

const intersect = ([a1, a2]: Interval, [b1, b2]: Interval): Interval => [
  Math.max(a1, b1),
  Math.min(a2, b2),
];

/** The stretches, empty ones left out, merged and in order. */
function union(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(([from, to]) => to > from)
    .toSorted((p, q) => p[0] - q[0]);
  const merged: Interval[] = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** The stretches of `from` outside every one of `cut`. */
function subtract(from: Interval[], cut: Interval[]): Interval[] {
  const holes = union(cut);
  return from.flatMap(([start, end]) => {
    const kept: Interval[] = [];
    let at = start;
    for (const [h1, h2] of holes) {
      if (h2 <= at || h1 >= end) continue;
      if (h1 > at) kept.push([at, h1]);
      at = Math.max(at, h2);
    }
    if (at < end) kept.push([at, end]);
    return kept;
  });
}

/** Where two segments cross at a point inside both, if they do. */
export function crossing(a: LineSegment, b: LineSegment): Point | undefined {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return undefined;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / denominator;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / denominator;
  const margin = 1e-6;
  if (t <= margin || t >= 1 - margin || u <= margin || u >= 1 - margin) {
    return undefined;
  }
  return { x: a.x1 + t * rx, y: a.y1 + t * ry };
}

/**
 * What a course costs, compared step by step: breaking a hard constraint
 * costs more than any number of crossings a course can make, a crossing
 * more than bending, and bending at all more than how a course bends or how
 * long it is. So a line is drawn straight unless a bent course crosses
 * fewer lines, or the straight course breaks a hard constraint (Josh, 12 Oct
 * 2026: straightness ranks below crossings, for every kind of line).
 */
const HARD = 1_000_000;
const COST = {
  // Hard constraints: no line passes through or close by a symbol or a
  // bracket (constraint 8), runs along or close beside another line, or
  // crosses a line of its own owner or another line into the same child
  // (constraint 9); none bends on another line, meets a line of descent from
  // below, or meets the end of another line in line with it, continuing it
  // (constraint 6). Through a symbol or bracket is worse than close by.
  symbol: 3 * HARD,
  bracket: 3 * HARD,
  nearSymbol: HARD,
  runAlong: HARD,
  sideBySide: HARD,
  crossOwn: HARD,
  throughCorner: HARD,
  nearCorner: HARD,
  crowdedEnd: HARD,
  fromBelow: HARD,
  continues: HARD,
  order: HARD,
  /** Every crossing counts the same, whatever it crosses. */
  crossing: 1000,
  /** A course with any corner that shows. */
  bent: 100,
  /** A line a few degrees off upright reads as drawn by mistake. */
  nearlyUpright: 3,
  bend: 1,
  length: 0.01,
};

/** The direction a course comes into `at` from `before`, as an angle off
 * straight down: negative from the left. None for a course from below. */
const arrivalFrom = (before: Point, at: Point): number | undefined =>
  before.y < at.y - ON
    ? Math.atan2(before.x - at.x, at.y - before.y)
    : undefined;

/** Whether courses that cost this much in all break a hard constraint. */
export const breaksAHardConstraint = (cost: number) => cost >= HARD;

/** Whether courses that cost this much in all are straight, clear of one
 * another and cross nothing: they cost less than one bend. */
export const straightAndClear = (cost: number) => cost < COST.bend;

/** Where other lines cross the edge of the symbol a course leaves, for
 * keeping its start apart from theirs. */
type EndContext = {
  parent?: { symbol: Symbol; crossings: Point[] };
  /** Where the course's owner sits across the page (see `DrawnLine`). */
  ownerX?: number;
  /** Everyone who owns the course (see `DrawnLine`). */
  people?: number[];
};

/** Where a line into a child ends: the top of their symbol, where every
 * line into them converges (a diamond's tip stands above its box). */
const childTop = (
  end: Extract<RouteEnd, { kind: 'child' }>,
  boxHeight: number,
): Point => ({ x: end.x, y: symbolTop(end.layer, boxHeight, end.shape) });

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * What is wrong with a line's courses among the lines already drawn, for
 * one line at a time: the scene does not change while its courses are
 * weighed, so what each piece and corner of a course costs is kept, for the
 * many courses that share it.
 */
function courseCoster(
  from: number,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  endContext: EndContext,
  /** Where the course leaves its owner. */
  start?: Point,
  /** Only what the scene's lines add to the cost: every part of a course's
   * cost comes from one line at a time, or from none (its symbols, bends
   * and length), so a course's cost among two sets of lines is the sum. */
  linesOnly = false,
) {
  const { boxWidth: boxw, boxHeight: boxh } = scene;
  const near = boxw * JUNCTION_CLEARANCE;
  const endPerson = end.kind === 'child' ? end.person : end.reaches;
  const ends = scene.symbols.filter(
    (symbol) => symbol.person === from || symbol.person === endPerson,
  );
  const isOwn = (line: DrawnLine) =>
    line.owner !== undefined && line.owner === owner;
  // Another line of someone who owns this one.
  const sharesOwner = (line: DrawnLine) =>
    line.people?.some((person) => endContext.people?.includes(person)) ?? false;
  const others = scene.lines.filter((line) => !isOwn(line));
  // Where the line may meet the line of descent it ends on.
  const isEndPoint = (p: Point) =>
    end.kind === 'join' &&
    end.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < ON);
  const own = scene.lines.filter(isOwn);
  // The pieces of the line of descent the course joins, at its end.
  const joined = others
    .map((line) => line.segment)
    .filter(
      (piece) =>
        end.kind === 'join' &&
        end.points.some((p) => distanceToSegment(p, piece) < ON),
    );
  const boxOfSegment = (s: LineSegment): Box => ({
    left: Math.min(s.x1, s.x2),
    right: Math.max(s.x1, s.x2),
    top: Math.min(s.y1, s.y2),
    bottom: Math.max(s.y1, s.y2),
  });
  // Only what lies near a piece can add to its cost.
  const reach = 0.3 * Math.max(boxw, boxh);
  const nearBox = (area: Box) => (r: Box) =>
    r.right >= area.left - reach &&
    r.left <= area.right + reach &&
    r.bottom >= area.top - reach &&
    r.top <= area.bottom + reach;
  const insideAny = (symbols: Symbol[], p: Point) =>
    symbols.some(
      (symbol) =>
        p.x > symbol.left &&
        p.x < symbol.right &&
        p.y > symbol.top &&
        p.y < symbol.bottom,
    );
  const insideOf = (p: Point, person: number | undefined) =>
    ends.some(
      (symbol) =>
        symbol.person === person &&
        p.x > symbol.left + ON &&
        p.x < symbol.right - ON &&
        p.y > symbol.top + ON &&
        p.y < symbol.bottom - ON,
    );
  // Just outside the owner's symbol, where its lines leave it together.
  const leaving = ends
    .filter((symbol) => symbol.person === from)
    .map((symbol) => ({
      ...symbol,
      left: symbol.left - HOP_REACH * boxw,
      right: symbol.right + HOP_REACH * boxw,
      top: symbol.top - HOP_REACH * boxh,
      bottom: symbol.bottom + HOP_REACH * boxh,
    }));
  const keyOf = (p: Point) => `${p.x},${p.y}`;
  // Where the course leaves its owner and meets its target.
  const targets: Point[] =
    end.kind === 'join' ? end.points : [childTop(end, boxh)];
  const courseEnds: Point[] = [...(start ? [start] : []), ...targets];
  const isTarget = (p: Point) =>
    targets.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < ON);

  const pieceCosts = new Map<string, number>();
  // Where each piece runs close beside each line near it (see
  // `closeStretches`), for the course's stretches beside each line.
  const pieceClose = new Map<
    string,
    { line: DrawnLine; stretches: Interval[] }[]
  >();
  const pieceKey = (segment: LineSegment) =>
    `${segment.x1},${segment.y1},${segment.x2},${segment.y2}`;
  const pieceCost = (segment: LineSegment): number => {
    const key = pieceKey(segment);
    const known = pieceCosts.get(key);
    if (known !== undefined) return known;
    const close: { line: DrawnLine; stretches: Interval[] }[] = [];
    pieceClose.set(key, close);
    const isNear = nearBox(boxOfSegment(segment));
    const symbols = scene.symbols.filter(isNear);
    const lines = others.filter((line) => isNear(boxOfSegment(line.segment)));
    let cost = linesOnly ? 0 : COST.length * segmentLength(segment);
    const dx = Math.abs(segment.x2 - segment.x1);
    const dy = Math.abs(segment.y2 - segment.y1);
    if (
      !linesOnly &&
      dx > ON &&
      dy > ON &&
      Math.min(dx, dy) / Math.max(dx, dy) < 0.27
    ) {
      cost += COST.nearlyUpright;
    }
    // The line starts inside its parent's symbol and ends inside the
    // child's, so the pieces still inside them are hidden there.
    const leavingParent = insideOf({ x: segment.x1, y: segment.y1 }, from);
    const enteringChild = insideOf({ x: segment.x2, y: segment.y2 }, endPerson);
    for (const symbol of linesOnly ? [] : symbols) {
      const isEnd = symbol.person === from || symbol.person === endPerson;
      if (symbol.person === from && leavingParent) continue;
      if (symbol.person === endPerson && enteringChild) continue;
      // How near the piece comes to the symbol as it is drawn.
      const nearest = nearestOutside(segment, symbol, boxw, boxh);
      if (nearest < -ON / boxw) {
        cost += COST.symbol;
      } else if (!isEnd && nearest < LINE_CLEARANCE) {
        cost += COST.nearSymbol;
      }
    }
    for (const line of own) {
      const at = crossing(segment, line.segment);
      if (at && !insideAny(symbols, at)) cost += COST.crossOwn;
      // Lines of one owner leave the owner together and may run on as one
      // course; once they part they keep clear of each other, like any two
      // lines.
      if (!isNear(boxOfSegment(line.segment))) continue;
      const partings = [
        { x: line.segment.x1, y: line.segment.y1 },
        { x: line.segment.x2, y: line.segment.y2 },
      ]
        .filter((p) => distanceToSegment(p, segment) < ON)
        .concat(
          [
            { x: segment.x1, y: segment.y1 },
            { x: segment.x2, y: segment.y2 },
          ].filter((p) => distanceToSegment(p, line.segment) < ON),
        );
      const stretches = closeStretches(
        segment,
        line.segment,
        boxw,
        boxh,
        [...ends, ...leaving],
        [...(at ? [at] : []), ...(start ? [start] : []), ...partings],
      );
      if (stretches.length > 0) close.push({ line, stretches });
    }
    for (const bracket of linesOnly ? [] : scene.brackets.filter(isNear)) {
      if (lengthInside(segment, bracket) > ON) cost += COST.bracket;
    }
    for (const line of lines) {
      if (sharedRun(segment, line.segment, ends) > ON) cost += COST.runAlong;
      const at = crossing(segment, line.segment);
      // Lines meeting at one point (on a line of descent, or at the top of
      // the child they all reach, where they converge) run close only
      // there; a line keeps clear of every line of descent, the one it
      // joins included, but near its own ends, where it leaves its owner and
      // meets its target.
      const meetsIt =
        (end.kind === 'child' && line.endsOn === end.person) ||
        (end.kind === 'join' &&
          line.kind === 'other' &&
          end.points.some(
            (p) =>
              Math.hypot(line.segment.x2 - p.x, line.segment.y2 - p.y) < ON ||
              Math.hypot(line.segment.x1 - p.x, line.segment.y1 - p.y) < ON,
          ));
      if (!meetsIt) {
        const stretches = closeStretches(
          segment,
          line.segment,
          boxw,
          boxh,
          ends,
          [...(at ? [at] : []), ...(line.kind === 'other' ? [] : courseEnds)],
        );
        if (stretches.length > 0) close.push({ line, stretches });
      }
      if (at && !insideAny(symbols, at)) {
        cost +=
          (endPerson !== undefined && line.endsOn === endPerson) ||
          sharesOwner(line)
            ? COST.crossOwn
            : COST.crossing;
      }
      for (const vertex of [
        { x: line.segment.x1, y: line.segment.y1 },
        { x: line.segment.x2, y: line.segment.y2 },
      ]) {
        if (
          insideAny(symbols, vertex) ||
          isEndPoint(vertex) ||
          // Lines into one child converge on one point at its top.
          (end.kind === 'child' && isTarget(vertex))
        ) {
          continue;
        }
        // A junction's distance from the corners of the line it meets is
        // measured along that line, and is kept where the junction is
        // offered (see `barPoints`).
        if (
          [
            { x: segment.x1, y: segment.y1 },
            { x: segment.x2, y: segment.y2 },
          ].some(isEndPoint) &&
          joined.some((piece) => distanceToSegment(vertex, piece) < ON)
        ) {
          continue;
        }
        const distance = distanceToSegment(vertex, segment);
        if (distance < ON) cost += COST.throughCorner;
        else if (distance < near) cost += COST.nearCorner;
      }
    }
    pieceCosts.set(key, cost);
    return cost;
  };

  // A corner hidden by a symbol is not seen: the course leaves its parent's
  // centre and ends at its child's. One on the symbol's edge shows, as a
  // kink where the line comes out.
  const hiddenCorner = (corner: Point) =>
    scene.symbols.some(
      (symbol) => outsideSymbol(corner, symbol, symbol.shape) < -0.02,
    );
  // A corner of this line on another line reads as a junction.
  const cornerCosts = new Map<string, number>();
  const cornerCost = (corner: Point): number => {
    const key = keyOf(corner);
    const known = cornerCosts.get(key);
    if (known !== undefined) return known;
    const isNear = nearBox({
      left: corner.x,
      right: corner.x,
      top: corner.y,
      bottom: corner.y,
    });
    let cost = 0;
    if (!hiddenCorner(corner)) {
      if (!linesOnly) cost += COST.bend;
      for (const line of others) {
        if (!isNear(boxOfSegment(line.segment))) continue;
        const distance = distanceToSegment(corner, line.segment);
        if (distance < ON) cost += COST.throughCorner;
        else if (distance < near) cost += COST.nearCorner;
      }
    }
    cornerCosts.set(key, cost);
    return cost;
  };

  // Where it leaves the parent, clear of where other lines meet that
  // symbol.
  const crowding = (
    at: Point | undefined,
    crossings: Point[],
    gapFraction: number,
  ) =>
    at
      ? crossings.filter(
          (other) =>
            Math.hypot(other.x - at.x, other.y - at.y) <
            gapFraction * boxw - 1e-9,
        ).length * COST.crowdedEnd
      : 0;
  // The lines the course's end meets: the pieces of line that end where it
  // ends, or pass through that point.
  const meetingEnd = (p: Point) =>
    scene.lines.filter((line) => distanceToSegment(p, line.segment) < ON);
  const endsCost = (points: Point[], segments: LineSegment[]): number => {
    let cost = 0;
    // A line meets a line of descent from above (constraint 6).
    if (
      !linesOnly &&
      end.kind === 'join' &&
      points.length > 1 &&
      points.at(-2)!.y >= points.at(-1)!.y - ON
    ) {
      cost += COST.fromBelow;
    }
    // A line meets another at an angle, and never continues it in a straight
    // line (Josh, 12 Oct 2026): its last piece is not in line with a piece
    // of line that ends where it ends and runs on beyond it.
    const meetAt = points.findIndex(isTarget);
    if (meetAt > 0) {
      const at = points[meetAt]!;
      const before = points[meetAt - 1]!;
      const ux = at.x - before.x;
      const uy = at.y - before.y;
      const length = Math.hypot(ux, uy);
      for (const line of meetingEnd(at)) {
        const { x1, y1, x2, y2 } = line.segment;
        const far =
          Math.hypot(x1 - at.x, y1 - at.y) < ON
            ? { x: x2, y: y2 }
            : Math.hypot(x2 - at.x, y2 - at.y) < ON
              ? { x: x1, y: y1 }
              : undefined;
        if (!far || length < ON) continue;
        // A piece hidden under a symbol from where it meets (a line's run
        // on to its child's centre) is not seen to be continued.
        const step = Math.min(
          1,
          (0.1 * boxh) / Math.hypot(far.x - at.x, far.y - at.y),
        );
        const beyond = {
          x: at.x + step * (far.x - at.x),
          y: at.y + step * (far.y - at.y),
        };
        if (scene.symbols.some((symbol) => strictlyInside(beyond, symbol))) {
          continue;
        }
        const vx = far.x - at.x;
        const vy = far.y - at.y;
        const across =
          Math.abs(ux * vy - uy * vx) / (length * Math.hypot(vx, vy));
        if (across < 0.05 && ux * vx + uy * vy > 0) cost += COST.continues;
      }
    }
    // Lines meeting at one point keep their owners' order across the page
    // in the directions they arrive from (constraint 7).
    if (meetAt > 0 && endContext.ownerX !== undefined) {
      const at = points[meetAt]!;
      const before = points[meetAt - 1]!;
      const mine = arrivalFrom(before, at);
      for (const line of scene.lines) {
        if (line.ownerX === undefined || isOwn(line)) continue;
        const apart = endContext.ownerX - line.ownerX;
        if (Math.abs(apart) < ON) continue;
        const { x1, y1, x2, y2 } = line.segment;
        if (distanceToSegment(at, line.segment) > ON) continue;
        // The way it comes in, from above: its end above the point.
        const above = y1 < y2 ? { x: x1, y: y1 } : { x: x2, y: y2 };
        if (above.y > at.y - ON) continue;
        const theirs = arrivalFrom(above, at);
        if (
          mine !== undefined &&
          theirs !== undefined &&
          apart * (mine - theirs) < -0.02 * Math.abs(apart)
        ) {
          cost += COST.order;
        }
      }
    }
    if (endContext.parent) {
      const { symbol, crossings } = endContext.parent;
      const exit = segments
        .map((segment) => edgeCrossing(segment, symbol))
        .find((at) => at !== undefined);
      cost += crowding(exit, crossings, LINE_CLEARANCE);
    }
    return cost;
  };

  /** What is wrong with a course, as a cost: 0 is a clean line. Once the
   * cost passes `limit`, it is returned as it stands. */
  return (points: Point[], limit = Number.POSITIVE_INFINITY): number => {
    // A line into a child is seen as far as the top of their symbol, where
    // the lines into them converge; its run on to their centre is hidden.
    const meetsChild = end.kind === 'child' ? points.findIndex(isTarget) : -1;
    const seen = meetsChild > 0 ? points.slice(0, meetsChild + 1) : points;
    const segments = pieces(seen);
    let cost = 0;
    const corners = seen.slice(1, -1);
    for (const corner of corners) cost += cornerCost(corner);
    if (!linesOnly && corners.some((corner) => !hiddenCorner(corner))) {
      cost += COST.bent;
    }
    // A course runs close beside a line for as long as its pieces do, one
    // after another, round its corners.
    const beside = new Map<DrawnLine, Interval[]>();
    let along = 0;
    for (const segment of segments) {
      if (cost > limit) return cost;
      cost += pieceCost(segment);
      for (const { line, stretches } of pieceClose.get(pieceKey(segment))!) {
        const spans = beside.get(line) ?? [];
        for (const [opens, closes] of stretches) {
          spans.push([along + opens - 1e-9, along + closes + 1e-9]);
        }
        beside.set(line, spans);
      }
      along += Math.hypot(
        (segment.x2 - segment.x1) / boxw,
        (segment.y2 - segment.y1) / boxh,
      );
    }
    for (const spans of beside.values()) {
      if (union(spans).some(([first, last]) => last - first > LINE_CLEARANCE)) {
        cost += COST.sideBySide;
      }
    }
    return cost + endsCost(points, segments);
  };
}

/** The angles off upright at which a course may come from a lane into its
 * target: straight down from above it, or from either side, steeply or
 * flat. Steep enough to read as coming down, and far enough off a line
 * coming straight down into the same point to keep clear of it. */
const APPROACHES = [0, 35, -35, 60, -60].map((degrees) =>
  Math.tan((degrees * Math.PI) / 180),
);

/** Heights in the gap below a row, as fractions of the gap: above the
 * sibling bars at its middle, and below them. */
const UPPER_LANES = [0.15, 0.35, 0.42];
const LOWER_LANES = [0.72, 0.6, 0.78];

export type From = {
  person: number;
  x: number;
  layer: number;
  /** Where the line starts, when not at the height of the parent's centre:
   * a couple's partnership line routed above their row, or the lower rail
   * of a double one. */
  y?: number;
  /** A couple's own line of descent, from their partnership line down to
   * their children, which the line leaves sideways from one of its upright
   * pieces, as a T, rather than starting at `x`. (Where it offers no room,
   * the line starts at `x` after all.) */
  stem?: LineSegment[];
  /** A co-parent with no partnership line between them, seated beside the
   * parent on their row, whose line joins this one: each comes down from
   * their own symbol, and the two run on as one from where they meet (see
   * `pairOptions`). */
  mate?: { person: number; x: number };
  /** Everyone who owns the line, when more than `person` and `mate`: both
   * partners of a couple. */
  people?: number[];
};
type Course = {
  points: Point[];
  endX: number;
  /** For a line with a co-parent's joining it: the co-parent's course. */
  matePoints?: Point[];
};

/** Heights in the gap below a couple's row, as fractions of the gap, at
 * which a line may leave their line of descent. */
const STEM_LANES = [0.25, 0.15, 0.35, 0.12, 0.18];

/** The points on a couple's line of descent a line may leave it at, as a
 * T: at a height of its own on an upright piece below the couple's row.
 * None for a line to someone above the couple's row. */
function stemStartsOf(from: From, end: RouteEnd, boxh: number): Point[] {
  if (!from.stem || end.layer < from.layer) return [];
  const gap = 1 - boxh;
  const rowBottom = from.layer + boxh;
  // Clear of either end of the piece, and of the couple's symbols: nearer,
  // it reads as leaving the partnership line or joining the sibling bar.
  const clearance = JUNCTION_CLEARANCE * boxh;
  return from.stem.flatMap((piece) => {
    if (Math.abs(piece.x2 - piece.x1) > ON) return [];
    const top = Math.max(Math.min(piece.y1, piece.y2), rowBottom) + clearance;
    const bottom = Math.max(piece.y1, piece.y2) - clearance;
    return STEM_LANES.map((f) => rowBottom + f * gap)
      .filter((y) => y >= top - 1e-9 && y <= bottom + 1e-9)
      .map((y) => ({ x: piece.x1, y }));
  });
}

/** The person whose symbol a line leaves: none for a line leaving a
 * couple's line of descent. */
const leavesSymbolOf = (from: From) => (from.stem ? -1 : from.person);

/** The symbol a line leaves, unless it starts on a partnership line. */
function parentSymbolOf(from: From, scene: RoutingScene) {
  if (from.stem) return undefined;
  return scene.symbols.find(
    (symbol) =>
      symbol.person === from.person &&
      symbol.top === from.layer &&
      Math.abs((symbol.left + symbol.right) / 2 - from.x) < 1e-9,
  );
}

/** Where the other lines meet the symbol a line leaves. */
function endContextOf(
  from: From,
  owner: string,
  scene: RoutingScene,
): EndContext {
  const parentSymbol = parentSymbolOf(from, scene);
  const owners = { ownerX: ownerXOf(from), people: peopleOf(from) };
  if (!parentSymbol) return owners;
  return {
    ...owners,
    parent: {
      symbol: parentSymbol,
      crossings: scene.lines
        .filter((line) => !(line.owner !== undefined && line.owner === owner))
        .flatMap((line) => edgeCrossing(line.segment, parentSymbol) ?? []),
    },
  };
}

/**
 * What is wrong with a line's courses among the lines already drawn: a
 * function of the course (and a co-parent's course joining it, see
 * `From.mate`), for weighing many courses of one line in one scene.
 */
export function courseCosts(
  from: From,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  /** Only what the scene's lines add (see `courseCoster`). */
  linesOnly = false,
): (points: Point[], matePoints?: Point[]) => number {
  const { mate, ...single } = from;
  const context = endContextOf(single, owner, scene);
  const costers = new Map<string, ReturnType<typeof courseCoster>>();
  const ofMate = mate
    ? courseCosts(mateFrom(from, mate), end, owner, scene, linesOnly)
    : undefined;
  return (points, matePoints) => {
    const start = points[0]!;
    const key = `${start.x},${start.y}`;
    let coster = costers.get(key);
    if (!coster) {
      coster = courseCoster(
        leavesSymbolOf(single),
        end,
        owner,
        scene,
        context,
        start,
        linesOnly,
      );
      costers.set(key, coster);
    }
    const own = coster(points);
    return ofMate && matePoints ? own + ofMate(matePoints) : own;
  };
}

/** What is wrong with a line's course among the lines already drawn. */
export function courseCost(
  from: From,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  points: Point[],
  /** A co-parent's course joining this one (see `From.mate`). */
  matePoints?: Point[],
): number {
  return courseCosts(from, end, owner, scene)(points, matePoints);
}

const mateFrom = (from: From, mate: NonNullable<From['mate']>): From => ({
  person: mate.person,
  x: mate.x,
  layer: from.layer,
  people: peopleOf(from),
});

/** Everyone who owns a line from `from`. */
export const peopleOf = (from: From): number[] =>
  from.people ?? [from.person, ...(from.mate ? [from.mate.person] : [])];

/** Where the owner of a line from `from` sits across the page: the middle
 * of a couple or of two co-parents. */
export const ownerXOf = (from: From): number =>
  from.mate ? (from.x + from.mate.x) / 2 : from.x;

/**
 * The course of a co-parent's line (`follow`) joining a line (`lead`) that
 * comes straight down from the parent's symbol and runs level along the gap
 * below their row: straight down from the co-parent's own symbol to that
 * level, and along it to the lead's course, which it then shares to the
 * end. Undefined when the lead's course does not start that way.
 */
function joinedCourse(
  lead: From,
  follow: From,
  points: Point[],
  boxh: number,
): Point[] | undefined {
  const [start, drop, along] = points;
  if (!start || !drop || !along) return undefined;
  if (Math.abs(drop.x - lead.x) > 1e-9 || Math.abs(start.x - lead.x) > 1e-9) {
    return undefined;
  }
  if (drop.y <= lead.layer + boxh + 1e-9 || drop.y >= lead.layer + 1) {
    return undefined;
  }
  if (Math.abs(along.y - drop.y) > 1e-9) return undefined;
  return [
    { x: follow.x, y: follow.layer + boxh / 2 },
    { x: follow.x, y: drop.y },
    // Copies: each line's points are its own, moved into place one line at
    // a time.
    ...points.slice(2).map((p) => ({ ...p })),
  ];
}

/**
 * The best courses for two co-parents' lines that join: of the courses of
 * either one's line that come straight down from their symbol and run
 * level below their row, each with the other's line joined to it, the
 * cheapest together. Each line starts at its own parent, so neither starts
 * from the empty space between them, nor joins them at their symbols.
 */
function pairOptions(
  from: From,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  limit: number,
  current?: Course,
): (Course & { cost: number })[] {
  const { mate, ...single } = from;
  if (!mate) return routeOptions(from, end, owner, scene, limit, current);
  const other = mateFrom(from, mate);
  const scored: (Course & { cost: number })[] = [];
  if (current?.matePoints) {
    scored.push({
      ...current,
      cost: courseCost(
        from,
        end,
        owner,
        scene,
        current.points,
        current.matePoints,
      ),
    });
  }
  for (const [lead, follow] of [
    [single, other],
    [other, single],
  ] as const) {
    for (const option of routeOptions(lead, end, owner, scene, 400)) {
      const joined = joinedCourse(lead, follow, option.points, scene.boxHeight);
      if (!joined) continue;
      const [points, matePoints] =
        lead === single ? [option.points, joined] : [joined, option.points];
      scored.push({
        points,
        matePoints,
        endX: option.endX,
        cost: option.cost + courseCost(follow, end, owner, scene, joined),
      });
    }
  }
  const best = scored.toSorted((a, b) => a.cost - b.cost).slice(0, limit);
  if (best.length > 0) return best;
  // No joined course: the two lines each go their own way.
  const [own] = routeOptions(single, end, owner, scene, 1);
  const [theirs] = routeOptions(other, end, owner, scene, 1);
  return [
    {
      points: own!.points,
      matePoints: theirs!.points,
      endX: own!.endX,
      cost: own!.cost + theirs!.cost,
    },
  ];
}

/**
 * The course of a line from a parent's symbol to a child or a sibling bar:
 * its points, from the parent's centre to the end on the child (or the bar).
 */
export function routeLine(
  from: From,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  /** The line's course so far, kept unless another is better. */
  current?: Course,
): Course & { cost: number } {
  const [best] = routeOptions(from, end, owner, scene, 1, current);
  return best!;
}

/**
 * The best courses for a line, cheapest first, at most `limit` of them;
 * with `current`, that course is among them and wins ties.
 */
export function routeOptions(
  from: From,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  limit: number,
  current?: Course,
): (Course & { cost: number })[] {
  if (from.mate) return pairOptions(from, end, owner, scene, limit, current);
  const { boxWidth: boxw, boxHeight: boxh } = scene;
  const defaultStart = { x: from.x, y: from.y ?? from.layer + boxh / 2 };
  const targets =
    end.kind === 'join'
      ? end.points.map((p) => ({
          x: p.x,
          entry: p,
          meet: p,
          tail: [] as Point[],
        }))
      : [
          {
            // At the top of the child, where every line into them
            // converges, and on to their centre, under their symbol.
            x: end.x,
            entry: childTop(end, boxh),
            meet: childTop(end, boxh),
            tail: [{ x: end.x, y: end.layer + boxh / 2 }],
          },
        ];

  // The lanes above the sibling bars keep above the highest of them.
  // With them, the lanes just clear of the symbols above and below the gap
  // (`LINE_CLEARANCE` from them).
  const gapLanes = (layer: number, fractions: number[]) => {
    const top = layer + boxh;
    const barTop = Math.min(
      scene.barTops?.get(layer) ?? Infinity,
      top + 0.5 * (1 - boxh),
    );
    const clear = LINE_CLEARANCE * boxh + ON;
    return [
      ...fractions.map((f) =>
        f < 0.5 ? top + 2 * f * (barTop - top) : top + f * (1 - boxh),
      ),
      ...(fractions.some((f) => f < 0.5) && top + clear < barTop
        ? [top + clear]
        : []),
      ...(fractions.some((f) => f >= 0.5) ? [layer + 1 - clear] : []),
    ];
  };
  const childLayer = end.layer;
  const rowsBetween = childLayer - from.layer;

  const parentSymbol = parentSymbolOf(from, scene);
  const costOf = courseCoster(
    leavesSymbolOf(from),
    end,
    owner,
    scene,
    endContextOf(from, owner, scene),
    defaultStart,
  );

  // The courses of lines of the same owner leaving from the same point, as
  // far as points along them: a quarter and half of the way along each
  // piece, and the corners between pieces.
  const ownCourses = (start: Point): Point[][] => {
    const own = scene.lines.filter(
      (line) => line.owner !== undefined && line.owner === owner,
    );
    const downFrom = (p: Point) =>
      own.flatMap(({ segment: { x1, y1, x2, y2 } }) => {
        const [top, bottom] =
          y1 < y2
            ? [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
              ]
            : [
                { x: x2, y: y2 },
                { x: x1, y: y1 },
              ];
        return Math.hypot(top.x - p.x, top.y - p.y) < ON &&
          bottom.y - top.y > ON
          ? [bottom]
          : [];
      });
    const found: Point[][] = [];
    const walk = (course: Point[]) => {
      if (course.length > 4) return;
      const at = course.at(-1)!;
      for (const next of downFrom(at)) {
        for (const t of [0.25, 0.5]) {
          found.push([
            ...course,
            { x: at.x + t * (next.x - at.x), y: at.y + t * (next.y - at.y) },
          ]);
        }
        if (downFrom(next).length > 0) {
          found.push([...course, next]);
          walk([...course, next]);
        }
      }
    };
    walk([start]);
    return found;
  };
  const candidates: { points: Point[]; endX: number }[] = [];
  // Points clear of each symbol near the straight line from `a` to `b`
  // (other than the ends'), round it and at the corners of a square round
  // it (off its line of descent): just clear of it, and twice that. Only
  // points between the two heights: a line never climbs.
  const clearOfSymbols = (a: Point, b: Point): Point[] => {
    const radii = [0.5 + LINE_CLEARANCE * 1.05, 0.5 + LINE_CLEARANCE * 2];
    const segment: LineSegment = {
      type: 'line',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    };
    return scene.symbols
      .filter(
        (symbol) =>
          symbol.person !== from.person &&
          !(end.kind === 'child' && symbol.person === end.person) &&
          distanceToSegment(
            {
              x: (symbol.left + symbol.right) / 2,
              y: (symbol.top + symbol.bottom) / 2,
            },
            segment,
          ) <
            (radii[0]! + 0.25) * boxw,
      )
      .flatMap((symbol) => {
        const x = (symbol.left + symbol.right) / 2;
        const y = (symbol.top + symbol.bottom) / 2;
        return radii.flatMap((r) => [
          ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
            const angle = (k * Math.PI) / 4;
            return {
              x: x + Math.cos(angle) * r * boxw,
              y: y + Math.sin(angle) * r * boxh,
            };
          }),
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sy) => ({
              x: x + sx * r * boxw,
              y: y + sy * r * boxh,
            })),
          ),
        ]);
      })
      .filter((p) => p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y));
  };
  // A line leaving a couple's line of descent leaves it sideways, level, at
  // one of the heights offered on it; any other line leaves its start at
  // any of a few lanes, and may run straight.
  const stemStarts = stemStartsOf(from, end, boxh);
  const fromStem = stemStarts.length > 0;
  for (const start of fromStem ? stemStarts : [defaultStart]) {
    const startXs = fromStem
      ? [start.x]
      : [start.x, start.x + 0.2 * boxw, start.x - 0.2 * boxw];
    const firstLanes = (lanes: number[]) => (fromStem ? [start.y] : lanes);
    // A straight line down to the child may leave the parent at a point on
    // their bottom edge rather than from their centre, out of the way of the
    // lines already leaving them.
    const exits: Point[][] = fromStem ? [] : [[start]];
    if (!fromStem && parentSymbol && rowsBetween >= 1) {
      for (const offset of [0, 0.2, -0.2, 0.32, -0.32]) {
        const depth = edgeDepth(parentSymbol.shape, offset);
        exits.push([
          start,
          { x: from.x + offset * boxw, y: from.layer + boxh * (1 - depth) },
        ]);
      }
    }
    if (rowsBetween === 0 && end.kind === 'child') {
      // Down from the parent, along the gap below the row, up into the
      // child.
      for (const target of targets) {
        const meet = { x: target.x, y: 2 * end.layer + boxh - target.meet.y };
        for (const x of startXs) {
          for (const y of firstLanes(gapLanes(end.layer, [0.18, 0.26, 0.12]))) {
            candidates.push({
              points: [
                start,
                { x, y: start.y },
                { x, y },
                { x: target.x, y },
                meet,
                ...target.tail,
              ],
              endX: target.x,
            });
          }
        }
      }
    } else {
      // Straight to the target, or straight past a symbol in the way of
      // that: through a point just clear of it.
      for (const target of targets) {
        for (const exit of exits) {
          candidates.push({
            points: [...exit, target.meet, ...target.tail],
            endX: target.x,
          });
          for (const by of clearOfSymbols(exit.at(-1)!, target.meet)) {
            candidates.push({
              points: [...exit, by, target.meet, ...target.tail],
              endX: target.x,
            });
          }
        }
      }
    }
    if (rowsBetween >= 1) {
      const lastGap = childLayer - 1;
      const lanesAboveEnd =
        end.kind === 'join'
          ? gapLanes(lastGap, UPPER_LANES)
          : gapLanes(lastGap, [...UPPER_LANES, ...LOWER_LANES]);
      // The way a course comes into its target from a lane: straight down
      // from above it, or from a point to either side of that, at an angle.
      const approaches = (target: (typeof targets)[number], y: number) =>
        APPROACHES.map((slope) => [
          { x: target.entry.x + slope * Math.abs(target.entry.y - y), y },
          target.entry,
          ...target.tail,
        ]);
      // Past a symbol in the way, through a point just clear of it, level
      // or down to a lane, across, and into the target.
      for (const target of targets) {
        for (const by of clearOfSymbols(start, target.meet)) {
          for (const y of [by.y, ...lanesAboveEnd]) {
            if (y < by.y) continue;
            for (const into of approaches(target, y)) {
              candidates.push({ points: [start, by, ...into], endX: target.x });
            }
          }
        }
      }
      // Across another child's line up, between their sibling bar and their
      // symbol: the one way out from between lines that converge on them.
      const doors = scene.lines.flatMap((line) => {
        if (line.kind !== 'upline') return [];
        const { x1, y1, x2, y2 } = line.segment;
        const [low, high] =
          y1 > y2
            ? [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
              ]
            : [
                { x: x2, y: y2 },
                { x: x1, y: y1 },
              ];
        if (Math.abs(low.y - (childLayer + boxh / 2)) > ON) return [];
        if (targets.some((target) => Math.abs(target.x - low.x) < ON)) {
          return [];
        }
        const y = (high.y + childLayer) / 2;
        const t = (y - high.y) / (low.y - high.y);
        return [{ x: high.x + t * (low.x - high.x), y }];
      });
      // Where a line of the same owner, leaving from the same point, passes
      // the door's height between the start and the door: a course that
      // runs on that line's course to there parts from it as a fork.
      const forksAt = (door: Point): number[] =>
        scene.lines.flatMap((line) => {
          if (line.owner === undefined || line.owner !== owner) return [];
          const { x1, y1, x2, y2 } = line.segment;
          const [top, bottom] =
            y1 < y2
              ? [
                  { x: x1, y: y1 },
                  { x: x2, y: y2 },
                ]
              : [
                  { x: x2, y: y2 },
                  { x: x1, y: y1 },
                ];
          if (Math.hypot(top.x - start.x, top.y - start.y) > ON) return [];
          if (door.y <= top.y || door.y >= bottom.y) return [];
          const x =
            top.x +
            ((door.y - top.y) / (bottom.y - top.y)) * (bottom.x - top.x);
          const side = Math.sign(start.x - door.x) || 1;
          return (x - door.x) * side > 0.15 * boxw ? [x] : [];
        });
      // Level through it, from a corner short of it: a corner on the line
      // up would read as a junction.
      for (const target of targets) {
        for (const door of doors) {
          const side = Math.sign(start.x - door.x) || 1;
          for (const x of [
            door.x + side * 0.15 * boxw,
            door.x + side * 0.3 * boxw,
            ...forksAt(door),
          ]) {
            const before = { x, y: door.y };
            for (const into of approaches(target, door.y)) {
              candidates.push({
                points: [start, before, ...into],
                endX: target.x,
              });
            }
          }
        }
      }
      // On the course of a line of the same owner that leaves from the same
      // point, to a point along it, and from there, where it parts as a
      // fork, into the target: straight, or level and then in.
      for (const prefix of ownCourses(start)) {
        const at = prefix.at(-1)!;
        for (const target of targets) {
          if (at.y >= target.meet.y - ON) continue;
          candidates.push({
            points: [...prefix, target.meet, ...target.tail],
            endX: target.x,
          });
          for (const into of approaches(target, at.y)) {
            candidates.push({ points: [...prefix, ...into], endX: target.x });
          }
        }
      }
      if (rowsBetween === 1) {
        for (const target of targets) {
          for (const x of startXs) {
            for (const y of firstLanes(lanesAboveEnd)) {
              for (const into of approaches(target, y)) {
                candidates.push({
                  points: [start, { x, y: start.y }, { x, y }, ...into],
                  endX: target.x,
                });
              }
            }
          }
        }
      } else {
        // Down from the parent's row, across to a way down clear of
        // everyone on the rows between, down that, and across to the child.
        const lanesBelowStart = firstLanes(gapLanes(from.layer, UPPER_LANES));
        const towardX = end.kind === 'join' ? end.points[0]!.x : end.x;
        const onRowsBetween = scene.rowXs
          .slice(from.layer + 1, childLayer)
          .flat();
        // Midway between two people, or just clear of one (beside a line of
        // descent that comes down between them).
        const clear = boxw * (0.5 + 1.25 * LINE_CLEARANCE);
        // The ways down nearest the parent or the child, to keep the search
        // small in a wide family.
        const wayDown = [
          ...new Set([
            from.x,
            ...targets.map((target) => target.x),
            ...onRowsBetween.flatMap((x) => [
              x - 0.5,
              x + 0.5,
              x - clear,
              x + clear,
            ]),
          ]),
        ]
          .toSorted(
            (a, b) =>
              Math.min(Math.abs(a - from.x), Math.abs(a - towardX)) -
              Math.min(Math.abs(b - from.x), Math.abs(b - towardX)),
          )
          .slice(0, 12);
        for (const target of targets) {
          for (const x of startXs) {
            for (const y1 of lanesBelowStart) {
              for (const down of wayDown) {
                for (const y2 of lanesAboveEnd) {
                  for (const into of approaches(target, y2)) {
                    candidates.push({
                      points: [
                        start,
                        { x, y: start.y },
                        { x, y: y1 },
                        { x: down, y: y1 },
                        { x: down, y: y2 },
                        ...into,
                      ],
                      endX: target.x,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const scored: (Course & { cost: number })[] = [];
  const cheapest: number[] = [];
  const seen = new Set<string>();
  for (const candidate of current ? [current, ...candidates] : candidates) {
    // The current course is kept as it is, so a caller can tell it was.
    const points =
      candidate === current ? current.points : simplify(candidate.points);
    const key = points
      .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)
      .join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    // A course already dearer than the `limit` cheapest so far is dropped
    // as soon as that is clear.
    const bound =
      cheapest.length >= limit
        ? cheapest[limit - 1]!
        : Number.POSITIVE_INFINITY;
    const cost = costOf(points, bound);
    scored.push({ points, endX: candidate.endX, cost });
    if (cost < bound) {
      const at = cheapest.findIndex((other) => other > cost);
      cheapest.splice(at < 0 ? cheapest.length : at, 0, cost);
      cheapest.length = Math.min(cheapest.length, limit);
    }
  }
  // Stable, so the current course (and earlier candidates) win ties.
  const best = scored.toSorted((a, b) => a.cost - b.cost).slice(0, limit);
  if (best.length > 0) return best;
  // Never a lone point, which would draw nothing.
  const [first] = targets;
  return [
    {
      points: [defaultStart, first!.meet, ...first!.tail],
      endX: first!.x,
      cost: Number.POSITIVE_INFINITY,
    },
  ];
}

export { pieces as segmentsOf };
