import type { LineSegment, PedigreeSymbolShape, Point } from './types';

/**
 * Routing for the lines that join a parent to a child outside the child's
 * line of descent: donors, surrogates, birth parents of an adopted child, and
 * any other parent the child's family does not name.
 *
 * Such a line ends on the child's top edge, off the child's own line up to
 * their parents and between any adoption brackets, or on a sibling bar away
 * from every child's line. It is drawn straight when a straight line passes
 * clear of everyone and every other line; otherwise it is routed
 * orthogonally, like the lines of descent, through the gaps between rows.
 *
 * A parent on the child's own row (a relative of the child's generation who
 * raises them, such as a sibling or cousin, while the child stays in their
 * birth family) is joined below the row, into the child's bottom edge: a line
 * along the row would read as a partnership, and one above it as a line of
 * descent. Donors and surrogates never share the child's row.
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
  /** Sibling bars and uplines read as joining whatever crosses them. */
  kind: 'bar' | 'upline' | 'other';
  /** For auxiliary lines: whose line this is, so one parent's lines to
   * several children may share their way down. */
  owner?: string;
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
};

export type RouteEnd =
  | {
      kind: 'child';
      person: number;
      x: number;
      layer: number;
      /** Where on the child's top edge a line may end. */
      attachments: number[];
      shape?: PedigreeSymbolShape;
    }
  | {
      kind: 'bar';
      bar: LineSegment;
      layer: number;
      /** Where along the bar a line may join it. */
      joins: number[];
    };

const ON = 0.004; // about a pixel
const BRACKET_OUTSET = 0.15; // of the box width: the brackets' outer edge
const BRACKET_INSET = 0.1; // of the box width: their spines' inner edge
const BRACKET_OVERHANG = 0.08; // of the box height, above and below

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

/** How far from the middle of a child's top edge a line may end, as a
 * fraction of its width: within a square's flat top, and nearly to a
 * circle's or diamond's sides. */
const REACH: Record<PedigreeSymbolShape, number> = {
  circle: 0.4,
  diamond: 0.36,
  square: 0.5 - CORNER_RADIUS,
};
/** How far from the middle a line ends when the child's own line up to
 * their parents leaves from there. */
const CENTRE_CLEARANCE = 0.15;

/**
 * The places on a child's top edge where the `index`th of the `count` lines
 * other than their own line of descent may end. The lines into one child
 * share the edge between them in the order they are given (their parents'
 * order, left to right), each over a stretch of its own, and keep off the
 * middle when the child's line up leaves from there.
 */
export function attachmentSlots(
  x: number,
  boxWidth: number,
  shape: PedigreeSymbolShape | undefined,
  index: number,
  count: number,
  clearOfCentre: boolean,
): number[] {
  const reach = shape ? REACH[shape] : REACH.square;
  const stretches: [number, number][] = clearOfCentre
    ? [
        [-reach, -CENTRE_CLEARANCE],
        [CENTRE_CLEARANCE, reach],
      ]
    : [[-reach, reach]];
  const total = stretches.reduce((sum, [from, to]) => sum + (to - from), 0);
  const offsetAt = (measure: number) => {
    let left = measure;
    for (const [from, to] of stretches) {
      if (left <= to - from + 1e-12) return from + left;
      left -= to - from;
    }
    return reach;
  };
  const share = total / Math.max(1, count);
  return [0.5, 0.25, 0.75].map(
    (fraction) => x + offsetAt(share * (index + fraction)) * boxWidth,
  );
}

/**
 * The places along a sibling bar where a line may join it: the middles of
 * the gaps between the lines already meeting it, widest gap first. Never
 * none: once every gap is too narrow, the middle of the bar.
 */
export function joinsFor(bar: LineSegment, taken: number[]): number[] {
  const from = Math.min(bar.x1, bar.x2);
  const to = Math.max(bar.x1, bar.x2);
  const joins = gapMiddles([
    from,
    to,
    ...taken.filter((x) => x >= from - ON && x <= to + ON),
  ]);
  return joins.length > 0 ? joins : [(from + to) / 2];
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

const shrink = (r: Symbol, by: number): Symbol => ({
  ...r,
  left: r.left + by,
  right: r.right - by,
  top: r.top + by,
  bottom: r.bottom - by,
});

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

/** Where two segments cross at a point inside both, if they do. */
function crossing(a: LineSegment, b: LineSegment): Point | undefined {
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

const COST = {
  symbol: 1000,
  /** Two lines meeting one symbol's edge too close together read as one
   * line that forks. */
  crowdedEnd: 150,
  bracket: 1000,
  runAlong: 1000,
  throughCorner: 500,
  crossBar: 300,
  crossUpline: 100,
  crossOther: 10,
  nearCorner: 50,
  /** A line a few degrees off upright reads as drawn by mistake. */
  nearlyUpright: 3,
  bend: 1,
  length: 0.01,
};

/** How close two lines may meet one symbol's edge, as a fraction of its
 * width. */
const MIN_END_GAP = 0.25;

/** Where other lines cross the edges of the symbols a course leaves and
 * reaches, for keeping its own ends apart from theirs. */
type EndContext = {
  parent?: { symbol: Symbol; crossings: Point[] };
  child?: { symbol: Symbol; crossings: Point[] };
};

/** What is wrong with a candidate course, as a cost: 0 is a clean line. */
function costOf(
  points: Point[],
  from: number,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
  endContext: EndContext = {},
): number {
  const segments = pieces(points);
  const near = scene.boxWidth * 0.1;
  const endPerson = end.kind === 'child' ? end.person : undefined;
  const ends = scene.symbols.filter(
    (symbol) => symbol.person === from || symbol.person === endPerson,
  );
  const insideSymbol = (p: Point) =>
    scene.symbols.some(
      (symbol) =>
        p.x > symbol.left &&
        p.x < symbol.right &&
        p.y > symbol.top &&
        p.y < symbol.bottom,
    );
  const others = scene.lines.filter(
    (line) =>
      !(end.kind === 'bar' && line.segment === end.bar) &&
      !(line.owner !== undefined && line.owner === owner),
  );
  const corners = points.slice(1, -1);

  let cost =
    COST.bend * corners.length +
    COST.length * segments.reduce((total, s) => total + segmentLength(s), 0);

  const insideOf = (p: Point, person: number | undefined) =>
    ends.some(
      (symbol) =>
        symbol.person === person &&
        p.x > symbol.left + ON &&
        p.x < symbol.right - ON &&
        p.y > symbol.top + ON &&
        p.y < symbol.bottom - ON,
    );
  segments.forEach((segment) => {
    const dx = Math.abs(segment.x2 - segment.x1);
    const dy = Math.abs(segment.y2 - segment.y1);
    if (dx > ON && dy > ON && Math.min(dx, dy) / Math.max(dx, dy) < 0.27) {
      cost += COST.nearlyUpright;
    }
    // The line starts inside its parent's symbol and ends inside the
    // child's, so the pieces still inside them are hidden there.
    const leavingParent = insideOf({ x: segment.x1, y: segment.y1 }, from);
    const enteringChild = insideOf({ x: segment.x2, y: segment.y2 }, endPerson);
    for (const symbol of scene.symbols) {
      if (symbol.person === from && leavingParent) continue;
      if (symbol.person === endPerson && enteringChild) continue;
      if (lengthInside(segment, shrink(symbol, ON)) > ON) cost += COST.symbol;
    }
    for (const bracket of scene.brackets) {
      if (lengthInside(segment, bracket) > ON) cost += COST.bracket;
    }
    for (const line of others) {
      if (sharedRun(segment, line.segment, ends) > ON) cost += COST.runAlong;
      const at = crossing(segment, line.segment);
      if (at && !insideSymbol(at)) {
        cost +=
          line.kind === 'bar'
            ? COST.crossBar
            : line.kind === 'upline'
              ? COST.crossUpline
              : COST.crossOther;
      }
      for (const vertex of [
        { x: line.segment.x1, y: line.segment.y1 },
        { x: line.segment.x2, y: line.segment.y2 },
      ]) {
        if (insideSymbol(vertex)) continue;
        const distance = distanceToSegment(vertex, segment);
        if (distance < ON) cost += COST.throughCorner;
        else if (distance < near) cost += COST.nearCorner;
      }
    }
  });
  // A corner of this line on another line reads as a junction.
  for (const corner of corners) {
    for (const line of others) {
      const distance = distanceToSegment(corner, line.segment);
      if (distance < ON) cost += COST.throughCorner;
      else if (distance < near) cost += COST.nearCorner;
    }
  }
  // Where it leaves the parent and reaches the child, clear of where other
  // lines meet those symbols.
  const gap = MIN_END_GAP * scene.boxWidth;
  const crowding = (at: Point | undefined, crossings: Point[]) =>
    at
      ? crossings.filter(
          (other) => Math.hypot(other.x - at.x, other.y - at.y) < gap,
        ).length * COST.crowdedEnd
      : 0;
  if (endContext.parent) {
    const { symbol, crossings } = endContext.parent;
    const exit = segments
      .map((segment) => edgeCrossing(segment, symbol))
      .find((at) => at !== undefined);
    cost += crowding(exit, crossings);
  }
  if (endContext.child) {
    const { symbol, crossings } = endContext.child;
    const entry = segments
      .map((segment) => edgeCrossing(segment, symbol))
      .findLast((at) => at !== undefined);
    cost += crowding(entry, crossings);
  }
  return cost;
}

/** Heights in the gap below a row, as fractions of the gap: above the
 * sibling bars at its middle, and below them. */
const UPPER_LANES = [0.15, 0.35, 0.08, 0.42];
const LOWER_LANES = [0.72, 0.6, 0.78];

/**
 * The course of a line from a parent's symbol to a child or a sibling bar:
 * its points, from the parent's centre to the end on the child (or the bar).
 */
export function routeLine(
  from: { person: number; x: number; layer: number },
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
): { points: Point[]; endX: number } {
  const { boxWidth: boxw, boxHeight: boxh } = scene;
  const start = { x: from.x, y: from.layer + boxh / 2 };
  // Every line is drawn: with no place offered, a line ends at the middle of
  // the child's top edge, or of the bar.
  const attachments =
    end.kind === 'child' && end.attachments.length === 0
      ? [end.x]
      : end.kind === 'child'
        ? end.attachments
        : [];
  const joins =
    end.kind === 'bar' && end.joins.length === 0
      ? [(end.bar.x1 + end.bar.x2) / 2]
      : end.kind === 'bar'
        ? end.joins
        : [];
  const targets =
    end.kind === 'child'
      ? attachments.map((x) => {
          // Into the child from above, down to their centre. A straight line
          // ends where it meets the symbol's edge, which at this distance
          // from the centre may fall short of the box's top edge.
          const shortfall = edgeDepth(end.shape, (x - end.x) / boxw);
          return {
            x,
            entry: { x, y: end.layer },
            meet: { x, y: end.layer + shortfall * boxh },
            tail: [{ x, y: end.layer + boxh / 2 }],
          };
        })
      : joins.map((x) => ({
          x,
          entry: { x, y: end.bar.y1 },
          meet: { x, y: end.bar.y1 },
          tail: [] as Point[],
        }));

  const gapLanes = (layer: number, fractions: number[]) =>
    fractions.map((f) => layer + boxh + f * (1 - boxh));
  const childLayer = end.layer;
  const rowsBetween = childLayer - from.layer;

  // The parent's symbol, unless the line starts on a partnership line.
  const parentSymbol = scene.symbols.find(
    (symbol) =>
      symbol.person === from.person &&
      symbol.top === from.layer &&
      Math.abs((symbol.left + symbol.right) / 2 - from.x) < 1e-9,
  );
  const childSymbol =
    end.kind === 'child'
      ? scene.symbols.find(
          (symbol) =>
            symbol.person === end.person &&
            symbol.top === end.layer &&
            Math.abs((symbol.left + symbol.right) / 2 - end.x) < 1e-9,
        )
      : undefined;
  const crossingsOf = (symbol: Symbol) =>
    scene.lines
      .filter((line) => !(line.owner !== undefined && line.owner === owner))
      .flatMap((line) => edgeCrossing(line.segment, symbol) ?? []);
  const endContext: EndContext = {
    ...(parentSymbol
      ? {
          parent: {
            symbol: parentSymbol,
            crossings: crossingsOf(parentSymbol),
          },
        }
      : {}),
    ...(childSymbol
      ? { child: { symbol: childSymbol, crossings: crossingsOf(childSymbol) } }
      : {}),
  };

  const candidates: { points: Point[]; endX: number }[] = [];
  const startXs = [from.x, from.x + 0.2 * boxw, from.x - 0.2 * boxw];
  // A straight line down to the child may leave the parent at a point on
  // their bottom edge rather than from their centre, out of the way of the
  // lines already leaving them.
  const exits: Point[][] = [[start]];
  if (parentSymbol && rowsBetween >= 1) {
    for (const offset of [0, 0.2, -0.2, 0.32, -0.32]) {
      const depth = edgeDepth(parentSymbol.shape, offset);
      exits.push([
        start,
        { x: from.x + offset * boxw, y: from.layer + boxh * (1 - depth) },
      ]);
    }
  }
  if (rowsBetween === 0 && end.kind === 'child') {
    // Down from the parent, along the gap below the row, up into the child.
    for (const target of targets) {
      const meet = { x: target.x, y: 2 * end.layer + boxh - target.meet.y };
      for (const x of startXs) {
        for (const y of gapLanes(end.layer, [0.12, 0.06, 0.18])) {
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
    for (const target of targets) {
      for (const exit of exits) {
        candidates.push({
          points: [...exit, target.meet, ...target.tail],
          endX: target.x,
        });
      }
    }
  }
  if (rowsBetween >= 1) {
    const lastGap = childLayer - 1;
    const lanesAboveEnd =
      end.kind === 'bar'
        ? gapLanes(lastGap, UPPER_LANES)
        : gapLanes(lastGap, [...UPPER_LANES, ...LOWER_LANES]);
    if (rowsBetween === 1) {
      for (const target of targets) {
        for (const x of startXs) {
          for (const y of lanesAboveEnd) {
            candidates.push({
              points: [
                start,
                { x, y: start.y },
                { x, y },
                { x: target.x, y },
                target.entry,
                ...target.tail,
              ],
              endX: target.x,
            });
          }
        }
      }
    } else {
      // Down from the parent's row, across to a way down clear of everyone
      // on the rows between, down that, and across to the child.
      const lanesBelowStart = gapLanes(from.layer, UPPER_LANES);
      const towardX =
        end.kind === 'child' ? end.x : (end.bar.x1 + end.bar.x2) / 2;
      const between = scene.rowXs.slice(from.layer + 1, childLayer).flat();
      // The ways down nearest the parent or the child, to keep the search
      // small in a wide family.
      const wayDown = [
        ...new Set([
          from.x,
          ...targets.map((target) => target.x),
          ...between.flatMap((x) => [x - 0.5, x + 0.5]),
        ]),
      ]
        .toSorted(
          (a, b) =>
            Math.min(Math.abs(a - from.x), Math.abs(a - towardX)) -
            Math.min(Math.abs(b - from.x), Math.abs(b - towardX)),
        )
        .slice(0, 8);
      for (const target of targets) {
        for (const x of startXs) {
          for (const y1 of lanesBelowStart) {
            for (const down of wayDown) {
              for (const y2 of lanesAboveEnd) {
                candidates.push({
                  points: [
                    start,
                    { x, y: start.y },
                    { x, y: y1 },
                    { x: down, y: y1 },
                    { x: down, y: y2 },
                    { x: target.x, y: y2 },
                    target.entry,
                    ...target.tail,
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

  let best: { points: Point[]; endX: number; cost: number } | undefined;
  for (const candidate of candidates) {
    const points = simplify(candidate.points);
    const cost = costOf(points, from.person, end, owner, scene, endContext);
    if (!best || cost < best.cost - 1e-9) {
      best = { points, endX: candidate.endX, cost };
    }
  }
  if (best) return { points: best.points, endX: best.endX };
  // Never a lone point, which would draw nothing.
  const [first] = targets;
  return {
    points: [start, first!.meet, ...first!.tail],
    endX: first!.x,
  };
}

export { pieces as segmentsOf };
