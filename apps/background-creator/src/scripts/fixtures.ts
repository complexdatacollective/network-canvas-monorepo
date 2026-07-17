import type { BackgroundDocument, Vec, ZoneElement } from '../model/types';

// A single source of truth for zone membership. The TypeScript geometry tests,
// the generated-Python execution test, and the generated-R execution test all
// assert against this table, so the three implementations cannot drift apart
// silently: any disagreement fails at least one suite.
//
// Layout (normalized space, origin top-left, y down):
//   - three concentric ellipses at (0.5, 0.5) with rx = ry = 0.45 / 0.30 / 0.15
//     (`outer`/`middle`/`inner`) exercise nesting + smallest-wins,
//   - `corner-rect` and `top-rect` are equal-area rects; `top-rect` overlaps
//     the outer ellipse to exercise a smaller different-shape zone winning,
//   - `triangle` is a polygon in the bottom-right corner,
//   - `tie-a` and `tie-b` are two distinct rects of identical area whose
//     overlap exercises the later-in-document-order tie-break,
//   - `wide-ellipse` is a warping ellipse with rx ≠ ry: it admits a point that
//     is inside because of its wider horizontal radius but would be outside a
//     circle of its smaller radius, proving the ellipse (not disk) membership,
//   - `degenerate` is a schema-valid ellipse with rx = ry = 0. It must contain
//     nothing in all three implementations. Its presence proves the generated
//     Python does not raise ZeroDivisionError on every row, and the generated R
//     does not halt with "missing value where TRUE/FALSE needed" at the exact
//     centre, when a zero-radius ellipse is present.

function ellipseZone(
  id: string,
  label: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): ZoneElement {
  return {
    id,
    kind: 'ellipse',
    cx,
    cy,
    rx,
    ry,
    fill: '#ffffff',
    fillOpacity: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
    zoneLabel: label,
  };
}

function rectZone(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ZoneElement {
  return {
    id,
    kind: 'rect',
    x,
    y,
    width,
    height,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 1,
    zoneLabel: label,
  };
}

function polygonZone(id: string, label: string, points: Vec[]): ZoneElement {
  return {
    id,
    kind: 'polygon',
    points,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 1,
    zoneLabel: label,
  };
}

export const fixtureZones: ZoneElement[] = [
  ellipseZone('zone-outer', 'outer', 0.5, 0.5, 0.45, 0.45),
  ellipseZone('zone-middle', 'middle', 0.5, 0.5, 0.3, 0.3),
  ellipseZone('zone-inner', 'inner', 0.5, 0.5, 0.15, 0.15),
  rectZone('zone-corner-rect', 'corner-rect', 0, 0, 0.2, 0.2),
  rectZone('zone-top-rect', 'top-rect', 0.4, 0.02, 0.2, 0.2),
  polygonZone('zone-triangle', 'triangle', [
    { x: 0.7, y: 0.7 },
    { x: 0.95, y: 0.7 },
    { x: 0.95, y: 0.95 },
  ]),
  rectZone('zone-tie-a', 'tie-a', 0.05, 0.6, 0.3, 0.2),
  rectZone('zone-tie-b', 'tie-b', 0.15, 0.55, 0.2, 0.3),
  ellipseZone('zone-wide-ellipse', 'wide-ellipse', 0.85, 0.12, 0.12, 0.05),
  ellipseZone('zone-degenerate', 'degenerate', 0.02, 0.98, 0, 0),
];

export const fixtureDocument: BackgroundDocument = {
  version: 1,
  title: 'Zone assignment fixture',
  description:
    'Shared fixture exercising rect, ellipse and polygon zones plus nesting, overlap and tie resolution.',
  elements: fixtureZones,
};

export type FixturePoint = {
  name: string;
  point: Vec;
  expected: string | null;
};

export const fixturePoints: FixturePoint[] = [
  // Nested concentric ellipses: smallest containing ring wins.
  { name: 'centre of all rings', point: { x: 0.5, y: 0.5 }, expected: 'inner' },
  {
    name: 'inside middle ring only',
    point: { x: 0.5, y: 0.72 },
    expected: 'middle',
  },
  {
    name: 'inside outer ring only',
    point: { x: 0.5, y: 0.9 },
    expected: 'outer',
  },
  // Rect membership away from any ellipse.
  {
    name: 'inside corner rect',
    point: { x: 0.1, y: 0.1 },
    expected: 'corner-rect',
  },
  // Inclusive rect bounds at exactly the origin and far corner; the far corner
  // also sits inside the outer ellipse, so the smaller rect must win.
  {
    name: 'corner rect origin (inclusive)',
    point: { x: 0, y: 0 },
    expected: 'corner-rect',
  },
  {
    name: 'corner rect far corner over outer ellipse',
    point: { x: 0.2, y: 0.2 },
    expected: 'corner-rect',
  },
  // Smaller different-shape zone wins over the overlapping outer ellipse.
  {
    name: 'top rect over outer ellipse',
    point: { x: 0.5, y: 0.1 },
    expected: 'top-rect',
  },
  // Polygon membership.
  { name: 'inside triangle', point: { x: 0.9, y: 0.8 }, expected: 'triangle' },
  // Equal-area overlap: the later zone in document order wins.
  {
    name: 'tie resolved to later zone',
    point: { x: 0.2, y: 0.7 },
    expected: 'tie-b',
  },
  // Warping ellipse (rx ≠ ry): the centre is assigned.
  {
    name: 'centre of wide ellipse',
    point: { x: 0.85, y: 0.12 },
    expected: 'wide-ellipse',
  },
  // Inside the wide ellipse only because of its wider horizontal radius; a
  // circle of the smaller (0.05) radius would exclude this point.
  {
    name: 'wide ellipse horizontal reach',
    point: { x: 0.95, y: 0.12 },
    expected: 'wide-ellipse',
  },
  // Zero-radius ellipse contains nothing: its exact centre resolves to no zone
  // (and must not crash the generated Python or R at the division).
  {
    name: 'centre of zero-radius ellipse resolves to no zone',
    point: { x: 0.02, y: 0.98 },
    expected: null,
  },
  // No containing zone.
  { name: 'below every zone', point: { x: 0.5, y: 0.99 }, expected: null },
  { name: 'top-right corner', point: { x: 0.98, y: 0.02 }, expected: null },
  {
    name: 'left edge outside ellipse',
    point: { x: 0, y: 0.5 },
    expected: null,
  },
];
