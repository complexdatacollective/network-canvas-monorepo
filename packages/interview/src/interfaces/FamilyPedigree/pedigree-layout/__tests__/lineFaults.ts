/**
 * What a reader of the drawing sees where lines end on one person, measured
 * on the drawing as PersonNode draws the symbols: the faults oracles of the
 * drawn connectors look for.
 */
import type {
  LineSegment,
  PedigreeConnectors,
  PedigreeSymbolShape,
  Point,
} from '../types';

/** How close two lines may end on one child's edge, and how close to the
 * child's own line of descent, as fractions of the symbol. */
export const MIN_END_GAP = 0.2;
export const CENTRE_CLEARANCE = 0.15;
/** How close two lines may run beside each other. */
const LINE_CLEARANCE = 0.25;

export type Drawing = {
  size: number;
  connectors: PedigreeConnectors;
  centre: (id: string) => Point;
  shapeOf: (id: string) => PedigreeSymbolShape;
};

/** Whether a point lies inside a person's symbol as PersonNode draws it. */
function insideSymbol(
  p: Point,
  c: Point,
  size: number,
  shape: PedigreeSymbolShape,
): boolean {
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  const half = size / 2;
  if (shape === 'circle') return Math.hypot(dx, dy) < half;
  if (shape === 'diamond') return dx + dy < half * 0.85 * Math.SQRT2;
  const radius = size * 0.25;
  if (dx >= half || dy >= half) return false;
  const cx = dx - (half - radius);
  const cy = dy - (half - radius);
  return cx <= 0 || cy <= 0 || Math.hypot(cx, cy) < radius;
}

const segmentsOf = (points: Point[]): LineSegment[] =>
  points.slice(1).map((p, k) => ({
    type: 'line',
    x1: points[k]!.x,
    y1: points[k]!.y,
    x2: p.x,
    y2: p.y,
  }));

/** Where a course first meets the child's symbol: the visible end. */
function visibleEnd(points: Point[], drawing: Drawing, childId: string) {
  const c = drawing.centre(childId);
  const shape = drawing.shapeOf(childId);
  for (const s of segmentsOf(points)) {
    const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 4);
    for (let k = 0; k <= steps; k++) {
      const p = {
        x: s.x1 + ((s.x2 - s.x1) * k) / steps,
        y: s.y1 + ((s.y2 - s.y1) * k) / steps,
      };
      if (insideSymbol(p, c, drawing.size, shape)) return p;
    }
  }
  throw new Error(`a line into ${childId} never reaches them`);
}

function distanceToSegment(p: Point, s: LineSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / length2),
        );
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

/**
 * Everything wrong with the lines that end on one child: their ends out of
 * their parents' left-to-right order, a crossing among them or over another
 * line, two ends closer than a fifth of a symbol (or an end within the
 * centre clearance of the child's own line of descent), and two lines
 * closer than a quarter of a symbol away from the child.
 */
export function faultsOfLinesInto(drawing: Drawing, childId: string): string[] {
  const { connectors, size } = drawing;
  const child = drawing.centre(childId);
  const faults: string[] = [];
  const lines = connectors.auxiliaryLines
    .filter((line) => line.endpointIds?.[1] === childId)
    .map((line) => ({
      name: `${line.endpointIds?.[0]}'s ${line.edgeType} line`,
      parentX: line.points[0]!.x,
      end: visibleEnd(line.points, drawing, childId),
      points: line.points,
      hops: line.hops ?? [],
    }));
  const descent = connectors.parentChildLines.find((line) =>
    line.uplineChildIds?.includes(childId),
  );
  const ends: { name: string; parentX: number; end: Point }[] = [...lines];
  let descentEnd: Point | undefined;
  if (descent && descent.parentLink.length > 0) {
    const parents = (descent.parentIds ?? []).map(drawing.centre);
    descentEnd = { x: child.x, y: child.y - size / 2 };
    ends.push({
      name: 'the line of descent',
      parentX: parents.reduce((sum, p) => sum + p.x, 0) / parents.length,
      end: descentEnd,
    });
  }

  const byParent = ends.toSorted((a, b) => a.parentX - b.parentX);
  for (let k = 0; k + 1 < byParent.length; k++) {
    const [a, b] = [byParent[k]!, byParent[k + 1]!];
    if (b.parentX - a.parentX > 1 && b.end.x <= a.end.x) {
      faults.push(`${b.name} ends left of ${a.name}`);
    }
  }
  for (const line of lines) {
    if (line.hops.length > 0) faults.push(`${line.name} crosses a line`);
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i]!, lines[j]!];
      const gap = Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y);
      if (gap < MIN_END_GAP * size - 0.25) {
        faults.push(
          `${a.name} and ${b.name} end ${(gap / size).toFixed(2)} of a symbol apart`,
        );
      }
      // Outside the child's symbol the two lines keep a quarter of a symbol
      // between them, but for the short stretch where they meet the child
      // (their ends are only a fifth apart): two lines nearly parallel over
      // a longer stretch read as one.
      const shape = drawing.shapeOf(childId);
      let closeRun = 0;
      for (const s of segmentsOf(a.points)) {
        const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const steps = Math.ceil(length * 2);
        for (let k = 0; k < steps; k++) {
          const p = {
            x: s.x1 + ((s.x2 - s.x1) * (k + 0.5)) / steps,
            y: s.y1 + ((s.y2 - s.y1) * (k + 0.5)) / steps,
          };
          if (insideSymbol(p, child, size, shape)) continue;
          const apart = Math.min(
            ...segmentsOf(b.points).map((t) => distanceToSegment(p, t)),
          );
          if (apart < LINE_CLEARANCE * size) closeRun += length / steps;
        }
      }
      if (closeRun > LINE_CLEARANCE * size) {
        faults.push(
          `${a.name} runs within a quarter of a symbol of ${b.name} for ${(closeRun / size).toFixed(2)} of a symbol`,
        );
      }
    }
  }
  if (descentEnd) {
    for (const line of lines) {
      const gap = Math.hypot(
        line.end.x - descentEnd.x,
        line.end.y - descentEnd.y,
      );
      if (gap < CENTRE_CLEARANCE * size - 0.25) {
        faults.push(
          `${line.name} ends ${(gap / size).toFixed(2)} of a symbol from the line of descent`,
        );
      }
    }
  }
  return faults;
}
