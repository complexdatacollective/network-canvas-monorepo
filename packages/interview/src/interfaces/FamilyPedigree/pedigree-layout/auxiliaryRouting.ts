import type { LineSegment, Point } from './types';

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
 * A parent on the child's own row (a sister who carried her mother's baby)
 * is joined below the row, into the child's bottom edge: a line along the
 * row would read as a partnership, and one above it as a line of descent.
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
): { symbol: Symbol; brackets: Symbol[] } {
  const symbol = {
    person,
    left: x - boxWidth / 2,
    right: x + boxWidth / 2,
    top: layer,
    bottom: layer + boxHeight,
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

/**
 * The places on a child's top edge where lines other than their own line of
 * descent may end, nearest the centre first.
 */
export function attachmentsFor(x: number, boxWidth: number): number[] {
  return [0.2, -0.2, 0.32, -0.32, 0.12, -0.12].map(
    (offset) => x + offset * boxWidth,
  );
}

/**
 * The places along a sibling bar where a line may join it: the middles of
 * the gaps between the lines already meeting it, widest gap first.
 */
export function joinsFor(bar: LineSegment, taken: number[]): number[] {
  const from = Math.min(bar.x1, bar.x2);
  const to = Math.max(bar.x1, bar.x2);
  const stops = [...new Set([from, to, ...taken])]
    .filter((x) => x >= from - ON && x <= to + ON)
    .toSorted((a, b) => a - b);
  const gaps: { at: number; width: number }[] = [];
  for (let k = 0; k + 1 < stops.length; k++) {
    const width = stops[k + 1]! - stops[k]!;
    if (width > 4 * ON) gaps.push({ at: stops[k]! + width / 2, width });
  }
  return gaps.toSorted((a, b) => b.width - a.width).map((gap) => gap.at);
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

/** The part of a segment inside a rectangle, as a length. */
function lengthInside(s: LineSegment, r: Symbol): number {
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
    return Math.max(0, t1 - t0) * segmentLength(s);
  }
  return 0;
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

/** What is wrong with a candidate course, as a cost: 0 is a clean line. */
function costOf(
  points: Point[],
  from: number,
  end: RouteEnd,
  owner: string,
  scene: RoutingScene,
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
  const targets =
    end.kind === 'child'
      ? end.attachments.map((x) => {
          // Into the child from above, down to their centre. A straight line
          // ends where it meets the symbol, whatever its shape: a circle, or
          // a diamond (a square turned and scaled to 0.85), at this distance
          // from the centre falls short of the box's top edge.
          const offset = Math.abs(x - end.x) / boxw;
          const shortfall = Math.max(
            0,
            offset - 0.1,
            0.5 - Math.sqrt(Math.max(0, 0.25 - offset * offset)),
          );
          return {
            x,
            entry: { x, y: end.layer },
            meet: { x, y: end.layer + shortfall * boxh },
            tail: [{ x, y: end.layer + boxh / 2 }],
          };
        })
      : end.joins.map((x) => ({
          x,
          entry: { x, y: end.bar.y1 },
          meet: { x, y: end.bar.y1 },
          tail: [] as Point[],
        }));

  const gapLanes = (layer: number, fractions: number[]) =>
    fractions.map((f) => layer + boxh + f * (1 - boxh));
  const childLayer = end.layer;
  const rowsBetween = childLayer - from.layer;

  const candidates: { points: Point[]; endX: number }[] = [];
  const startXs = [from.x, from.x + 0.2 * boxw, from.x - 0.2 * boxw];
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
      candidates.push({
        points: [start, target.meet, ...target.tail],
        endX: target.x,
      });
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
    const cost = costOf(points, from.person, end, owner, scene);
    if (!best || cost < best.cost - 1e-9) {
      best = { points, endX: candidate.endX, cost };
    }
  }
  return best ?? { points: [start], endX: start.x };
}

export { pieces as segmentsOf };
