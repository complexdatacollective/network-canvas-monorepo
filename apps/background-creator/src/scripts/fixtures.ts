import type { BackgroundDocument, Vec, Zone } from '../model/types';

// A single source of truth for zone membership. The TypeScript geometry tests,
// the generated-Python execution test, and the generated-R execution test all
// assert against this table, so the three implementations cannot drift apart
// silently: any disagreement fails at least one suite.
//
// Layout (normalized space, origin top-left, y down):
//   - three concentric circles at (0.5, 0.5) with r = 0.45 / 0.30 / 0.15
//     (`outer`/`middle`/`inner`) exercise nesting + smallest-wins,
//   - `corner-rect` and `top-rect` are equal-area rects; `top-rect` overlaps
//     the outer circle to exercise a smaller different-shape zone winning,
//   - `triangle` is a polygon in the bottom-right corner,
//   - `tie-a` and `tie-b` are two distinct rects of identical area whose
//     overlap exercises the later-in-document-order tie-break.
export const fixtureZones: Zone[] = [
  {
    id: 'zone-outer',
    label: 'outer',
    shape: 'circle',
    cx: 0.5,
    cy: 0.5,
    r: 0.45,
  },
  {
    id: 'zone-middle',
    label: 'middle',
    shape: 'circle',
    cx: 0.5,
    cy: 0.5,
    r: 0.3,
  },
  {
    id: 'zone-inner',
    label: 'inner',
    shape: 'circle',
    cx: 0.5,
    cy: 0.5,
    r: 0.15,
  },
  {
    id: 'zone-corner-rect',
    label: 'corner-rect',
    shape: 'rect',
    x: 0,
    y: 0,
    width: 0.2,
    height: 0.2,
  },
  {
    id: 'zone-top-rect',
    label: 'top-rect',
    shape: 'rect',
    x: 0.4,
    y: 0.02,
    width: 0.2,
    height: 0.2,
  },
  {
    id: 'zone-triangle',
    label: 'triangle',
    shape: 'polygon',
    points: [
      { x: 0.7, y: 0.7 },
      { x: 0.95, y: 0.7 },
      { x: 0.95, y: 0.95 },
    ],
  },
  {
    id: 'zone-tie-a',
    label: 'tie-a',
    shape: 'rect',
    x: 0.05,
    y: 0.6,
    width: 0.3,
    height: 0.2,
  },
  {
    id: 'zone-tie-b',
    label: 'tie-b',
    shape: 'rect',
    x: 0.15,
    y: 0.55,
    width: 0.2,
    height: 0.3,
  },
];

export const fixtureDocument: BackgroundDocument = {
  version: 1,
  title: 'Zone assignment fixture',
  description:
    'Shared fixture exercising rect, circle and polygon zones plus nesting, overlap and tie resolution.',
  elements: [],
  zones: fixtureZones,
};

export type FixturePoint = {
  name: string;
  point: Vec;
  expected: string | null;
};

export const fixturePoints: FixturePoint[] = [
  // Nested concentric circles: smallest containing ring wins.
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
  // Rect membership away from any circle.
  {
    name: 'inside corner rect',
    point: { x: 0.1, y: 0.1 },
    expected: 'corner-rect',
  },
  // Inclusive rect bounds at exactly the origin and far corner; the far corner
  // also sits inside the outer circle, so the smaller rect must win.
  {
    name: 'corner rect origin (inclusive)',
    point: { x: 0, y: 0 },
    expected: 'corner-rect',
  },
  {
    name: 'corner rect far corner over outer circle',
    point: { x: 0.2, y: 0.2 },
    expected: 'corner-rect',
  },
  // Smaller different-shape zone wins over the overlapping outer circle.
  {
    name: 'top rect over outer circle',
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
  // No containing zone.
  { name: 'below every zone', point: { x: 0.5, y: 0.99 }, expected: null },
  { name: 'top-right corner', point: { x: 0.98, y: 0.02 }, expected: null },
  { name: 'left edge outside circle', point: { x: 0, y: 0.5 }, expected: null },
];
