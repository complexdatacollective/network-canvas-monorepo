import type { Vec } from './types';

// Two normalized points are "the same vertex" below this separation
// (sub-pixel on any realistic stage).
const VERTEX_EPSILON = 1e-4;
const CROSS_PRODUCT_EPSILON = 1e-12;
const MIN_POLYGON_AREA = 1e-6;

export const nearlyEqual = (a: Vec, b: Vec): boolean =>
  Math.abs(a.x - b.x) < VERTEX_EPSILON && Math.abs(a.y - b.y) < VERTEX_EPSILON;

function distinctVertexCount(points: Vec[]): number {
  const kept: Vec[] = [];
  for (const point of points) {
    if (!kept.some((other) => nearlyEqual(other, point))) kept.push(point);
  }
  return kept.length;
}

function polygonArea(points: Vec[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function crossProduct(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isBetween(value: number, first: number, second: number): boolean {
  return (
    value >= Math.min(first, second) - CROSS_PRODUCT_EPSILON &&
    value <= Math.max(first, second) + CROSS_PRODUCT_EPSILON
  );
}

function pointOnSegment(point: Vec, start: Vec, end: Vec): boolean {
  return (
    Math.abs(crossProduct(start, end, point)) <= CROSS_PRODUCT_EPSILON &&
    isBetween(point.x, start.x, end.x) &&
    isBetween(point.y, start.y, end.y)
  );
}

function segmentsIntersect(
  firstStart: Vec,
  firstEnd: Vec,
  secondStart: Vec,
  secondEnd: Vec,
): boolean {
  const firstSideStart = crossProduct(firstStart, firstEnd, secondStart);
  const firstSideEnd = crossProduct(firstStart, firstEnd, secondEnd);
  const secondSideStart = crossProduct(secondStart, secondEnd, firstStart);
  const secondSideEnd = crossProduct(secondStart, secondEnd, firstEnd);

  const crossesProperly =
    ((firstSideStart > CROSS_PRODUCT_EPSILON &&
      firstSideEnd < -CROSS_PRODUCT_EPSILON) ||
      (firstSideStart < -CROSS_PRODUCT_EPSILON &&
        firstSideEnd > CROSS_PRODUCT_EPSILON)) &&
    ((secondSideStart > CROSS_PRODUCT_EPSILON &&
      secondSideEnd < -CROSS_PRODUCT_EPSILON) ||
      (secondSideStart < -CROSS_PRODUCT_EPSILON &&
        secondSideEnd > CROSS_PRODUCT_EPSILON));

  if (crossesProperly) return true;

  return (
    pointOnSegment(secondStart, firstStart, firstEnd) ||
    pointOnSegment(secondEnd, firstStart, firstEnd) ||
    pointOnSegment(firstStart, secondStart, secondEnd) ||
    pointOnSegment(firstEnd, secondStart, secondEnd)
  );
}

function hasSelfIntersection(points: Vec[]): boolean {
  const count = points.length;
  for (let firstIndex = 0; firstIndex < count; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % count];
    if (!firstStart || !firstEnd) continue;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < count;
      secondIndex += 1
    ) {
      // Consecutive edges legitimately meet at their shared vertex. The first
      // and last edges are consecutive too because the polygon is closed.
      const adjacent =
        secondIndex === firstIndex + 1 ||
        (firstIndex === 0 && secondIndex === count - 1);
      if (adjacent) continue;

      const secondStart = points[secondIndex];
      const secondEnd = points[(secondIndex + 1) % count];
      if (
        secondStart &&
        secondEnd &&
        segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return true;
      }
    }
  }
  return false;
}

// Zone membership and the generated scripts use even-odd ray casting, while
// SVG uses nonzero fill and the overlap resolver uses shoelace area. Those
// semantics only agree for a simple polygon: distinct vertices, meaningful
// area, and no crossing or touching non-adjacent edges.
export function isInvalidPolygon(points: Vec[]): boolean {
  const distinctCount = distinctVertexCount(points);
  return (
    distinctCount < 3 ||
    distinctCount !== points.length ||
    polygonArea(points) < MIN_POLYGON_AREA ||
    hasSelfIntersection(points)
  );
}
