/**
 * Where the drawn lines end, measured against what they meet as it is drawn:
 * every line ends exactly on what it meets. A line ending on a person lands
 * on the outline PersonNode paints (fresco-ui's Node at size `sm`: a circle
 * filling its box; a square whose corners are rounded at 24px; a diamond, a
 * square of the same corners scaled to 0.85 and turned 45°), and shows no
 * corner there; a line ending on a line lands on its centreline.
 */
import { EDGE_WIDTH, SYMBOL_CORNER_RADIUS_PX } from '../layoutDimensions';
import type {
  AuxiliaryConnector,
  LineSegment,
  PedigreeSymbolShape,
  Point,
} from '../types';
import type { Drawing } from './lineFaults';

/** How far, in pixels, an end may lie from what it meets. */
const TOLERANCE = 0.5;
const HALF_STROKE = EDGE_WIDTH / 2;

/** The distance from a point inside a box of half-size `half` with corners
 * rounded at `radius` to its edge (negative inside), measured from the
 * middle, in the first quadrant. */
function roundedBox(qx: number, qy: number, half: number, radius: number) {
  const ax = qx - (half - radius);
  const ay = qy - (half - radius);
  return (
    Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) +
    Math.min(Math.max(ax, ay), 0) -
    radius
  );
}

/** How far a point lies outside the outline PersonNode paints, in pixels
 * (negative inside). */
export function outsideOutline(
  p: Point,
  centre: Point,
  size: number,
  shape: PedigreeSymbolShape,
): number {
  const dx = Math.abs(p.x - centre.x);
  const dy = Math.abs(p.y - centre.y);
  if (shape === 'circle') return Math.hypot(dx, dy) - size / 2;
  if (shape === 'square') {
    return roundedBox(dx, dy, size / 2, SYMBOL_CORNER_RADIUS_PX);
  }
  const u = Math.abs(p.x - centre.x + (p.y - centre.y)) / Math.SQRT2;
  const v = Math.abs(p.x - centre.x - (p.y - centre.y)) / Math.SQRT2;
  return roundedBox(u, v, (0.85 * size) / 2, 0.85 * SYMBOL_CORNER_RADIUS_PX);
}

/** The top of the outline PersonNode paints. */
export function outlineTop(
  centre: Point,
  size: number,
  shape: PedigreeSymbolShape,
): Point {
  const above =
    shape === 'diamond'
      ? (0.85 * size) / Math.SQRT2 -
        0.85 * SYMBOL_CORNER_RADIUS_PX * (Math.SQRT2 - 1)
      : size / 2;
  return { x: centre.x, y: centre.y - above };
}

function distanceToSegment(p: Point, s: LineSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / lengthSquared),
        );
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

const piecesOf = (points: Point[]): LineSegment[] =>
  points.slice(1).map((to, k) => ({
    type: 'line',
    x1: points[k]!.x,
    y1: points[k]!.y,
    x2: to.x,
    y2: to.y,
  }));

/** Whether a course changes direction at its `k`th point. */
function turnsAt(points: Point[], k: number): boolean {
  const [a, b, c] = [points[k - 1], points[k], points[k + 1]];
  if (!a || !b || !c) return false;
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const lengths = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (lengths < 1e-9) return false;
  return Math.abs(u.x * v.y - u.y * v.x) / lengths > 0.01;
}

/** Whether a line coming into a person's outline at `meet`, from `before`,
 * can run on under the symbol in its own direction, far enough inside to
 * hide its turn or end: not when it comes in flatter than a diamond's sides
 * at its tip. */
export function canRunOnInside(
  before: Point,
  meet: Point,
  centre: Point,
  size: number,
  shape: PedigreeSymbolShape,
): boolean {
  const ux = meet.x - before.x;
  const uy = meet.y - before.y;
  const length = Math.hypot(ux, uy);
  if (length < 1e-9) return false;
  return [0.2, 0.3, 0.4, 0.5].some(
    (along) =>
      outsideOutline(
        {
          x: meet.x + (along * size * ux) / length,
          y: meet.y + (along * size * uy) / length,
        },
        centre,
        size,
        shape,
      ) <= -HALF_STROKE,
  );
}

const px = (value: number) => `${value.toFixed(1)}px`;

/**
 * Every end that does not land exactly on what it meets, described.
 */
export function lineEndFaults(drawing: Drawing): string[] {
  const { connectors, size, centre, shapeOf } = drawing;
  const faults: string[] = [];
  const outside = (p: Point, id: string) =>
    outsideOutline(p, centre(id), size, shapeOf(id));
  const descentPieces = connectors.parentChildLines.flatMap((line) => [
    ...line.parentLink,
    ...line.uplines,
    ...(line.siblingBar ? [line.siblingBar] : []),
    ...(line.runs ?? []).flatMap((run) => [
      run.stem,
      ...(run.bar ? [run.bar] : []),
    ]),
  ]);
  const partnershipPieces = connectors.groupLines.flatMap((line) => [
    line.segment,
    ...(line.endpointSegments ?? []),
  ]);
  const offLines = (p: Point, pieces: LineSegment[]) =>
    Math.min(Infinity, ...pieces.map((piece) => distanceToSegment(p, piece)));
  const nameOf = (line: AuxiliaryConnector) =>
    `${(line.ownerIds ?? [line.endpointIds?.[0]]).join(' and ')}'s ${line.edgeType} line`;

  for (const line of connectors.auxiliaryLines) {
    const { points } = line;
    const name = nameOf(line);
    const [owner, child] = line.endpointIds ?? [];
    // Where it starts: hidden in its owner's symbol, or on the partnership
    // line or line of descent it leaves.
    const start = points[0]!;
    const hidden = owner !== undefined && outside(start, owner) <= -HALF_STROKE;
    const onLine = offLines(start, [...partnershipPieces, ...descentPieces]);
    if (!hidden && onLine > TOLERANCE) {
      faults.push(`${name} starts ${px(onLine)} off what it leaves`);
    }
    const end = points.at(-1)!;
    if (child === undefined) {
      // On the line of descent it joins: on its centreline.
      const off = offLines(end, descentPieces);
      if (off > TOLERANCE) {
        faults.push(`${name} ends ${px(off)} off the line it joins`);
      }
      continue;
    }
    // Into a child: it comes into their outline where the lines into them
    // converge, the top of its outline (or, for a line from someone on the
    // same row, which comes up into the child, its bottom), and shows no
    // corner there. It runs on under their symbol far enough to hide its
    // end, or, too flat to run on from there, ends there.
    const c = centre(child);
    const top = outlineTop(c, size, shapeOf(child));
    const targetFrom = (p: Point) =>
      p.y > c.y ? { x: top.x, y: 2 * c.y - top.y } : top;
    const before = points.at(-2)!;
    const endTarget = targetFrom(before);
    const endsThere =
      Math.hypot(end.x - endTarget.x, end.y - endTarget.y) <= TOLERANCE;
    if (endsThere) {
      if (canRunOnInside(before, endTarget, c, size, shapeOf(child))) {
        faults.push(
          `${name} ends on ${child}'s outline, though it could run on out of sight`,
        );
      }
      continue;
    }
    if (outside(end, child) > -HALF_STROKE) {
      faults.push(`${name} ends where its end shows, on ${child}`);
    }
    const last = points.findLastIndex((p) => outside(p, child) >= 0);
    if (last < 0 || last === points.length - 1) continue;
    const [from, to] = [points[last]!, points[last + 1]!];
    let [lo, hi] = [0, 1];
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      const p = {
        x: from.x + mid * (to.x - from.x),
        y: from.y + mid * (to.y - from.y),
      };
      if (outside(p, child) >= 0) lo = mid;
      else hi = mid;
    }
    const entry = {
      x: from.x + lo * (to.x - from.x),
      y: from.y + lo * (to.y - from.y),
    };
    const target = targetFrom(entry);
    // The lines into a child converge on its outline, not short of it.
    const meeting = points[last]!;
    const short = Math.hypot(meeting.x - target.x, meeting.y - target.y);
    if (short > TOLERANCE && short < 0.15 * size) {
      faults.push(`${name} converges ${px(short)} short of ${child}'s outline`);
    }
    const fromTarget = Math.hypot(entry.x - target.x, entry.y - target.y);
    if (fromTarget > TOLERANCE) {
      faults.push(
        `${name} comes into ${child}'s outline ${px(fromTarget)} from where the lines into them converge`,
      );
    }
    for (let k = last; k < points.length - 1; k++) {
      if (!turnsAt(points, k)) continue;
      const depth = outside(points[k]!, child);
      if (depth > -HALF_STROKE + TOLERANCE && depth < HALF_STROKE) {
        faults.push(
          `${name} turns ${px(depth)} from ${child}'s outline, where the turn shows`,
        );
      }
    }
  }

  // Lines of one owner part where one leaves the other's course: on its
  // centreline.
  const lines = connectors.auxiliaryLines;
  for (const [i, a] of lines.entries()) {
    for (const b of lines.slice(i + 1)) {
      const [p, q] = [a.points[0]!, b.points[0]!];
      if (Math.hypot(p.x - q.x, p.y - q.y) > TOLERANCE) continue;
      const along = piecesOf(a.points);
      const shared = b.points.findLastIndex(
        (point) => offLines(point, along) <= 1,
      );
      if (shared <= 0) continue;
      const off = offLines(b.points[shared]!, along);
      if (off > TOLERANCE) {
        faults.push(
          `${nameOf(b)} parts from ${nameOf(a)} ${px(off)} off its centreline`,
        );
      }
    }
  }

  // Lines of descent: into each child, hidden in the child's symbol; from
  // each parent, hidden in theirs or on the partnership line or line of
  // descent they leave.
  for (const line of connectors.parentChildLines) {
    line.uplines.forEach((upline, k) => {
      const child = line.uplineChildIds?.[k];
      if (child === undefined) return;
      const lower =
        upline.y1 > upline.y2
          ? { x: upline.x1, y: upline.y1 }
          : { x: upline.x2, y: upline.y2 };
      if (outside(lower, child) > -HALF_STROKE) {
        faults.push(`the line up into ${child} ends where its end shows`);
      }
    });
  }
  return faults;
}
