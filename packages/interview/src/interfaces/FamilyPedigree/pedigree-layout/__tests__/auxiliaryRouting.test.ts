/**
 * The routing of the lines that join a parent to a child outside the child's
 * line of descent (donors, surrogates, step, social and adoptive parents),
 * checked on whole families laid out as the interface lays them out, and on
 * the router itself.
 */
import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { routeLine, type RoutingScene } from '../auxiliaryRouting';
import type { LayoutDimensions } from '../layoutDimensions';
import {
  buildConnectorData,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type {
  LineSegment,
  PedigreeConnectors,
  PedigreeLink,
  PedigreeSymbolShape,
} from '../types';

const DIMENSIONS: LayoutDimensions = {
  nodeWidth: 108,
  nodeHeight: 108,
  rowGapRatio: 1.4,
  columnGapRatio: 1.4,
};

function draw(
  people: string[],
  links: PedigreeLink[],
  shapes: Record<string, PedigreeSymbolShape> = {},
) {
  const { input, indexToId, idToIndex } = toPedigreeInput(people, links);
  const layout = alignPedigree(input);
  const { connectors } = buildConnectorData(
    layout,
    links,
    DIMENSIONS,
    input.parents,
    idToIndex,
    people,
    indexToId,
    new Map(Object.entries(shapes)),
  );
  const topLeft = pedigreeLayoutToPositions(layout, indexToId, DIMENSIONS);
  const centre = (personId: string) => {
    const position = topLeft.get(personId);
    if (!position) throw new Error(`${personId} is not drawn`);
    return {
      x: position.x + DIMENSIONS.nodeWidth / 2,
      y: position.y + DIMENSIONS.nodeHeight / 2,
    };
  };
  const boxOf = (personId: string): Box => {
    const c = centre(personId);
    return {
      left: c.x - DIMENSIONS.nodeWidth / 2,
      right: c.x + DIMENSIONS.nodeWidth / 2,
      top: c.y - DIMENSIONS.nodeHeight / 2,
      bottom: c.y + DIMENSIONS.nodeHeight / 2,
    };
  };
  return { connectors, centre, boxOf };
}

type Box = { left: number; right: number; top: number; bottom: number };
type P = { x: number; y: number };

const inside = (p: P, box: Box) =>
  p.x > box.left + 0.5 &&
  p.x < box.right - 0.5 &&
  p.y > box.top + 0.5 &&
  p.y < box.bottom - 0.5;

/** Where a course crosses the edge of a box it starts inside, or ends inside
 * (taken from that end). */
function edgeCrossing(points: P[], box: Box, fromEnd = false): P {
  const course = fromEnd ? points.toReversed() : points;
  for (let k = 1; k < course.length; k++) {
    const [a, b] = [course[k - 1]!, course[k]!];
    if (!inside(a, box) || inside(b, box)) continue;
    // Bisect to the crossing.
    let [lo, hi] = [0, 1];
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      const p = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
      if (inside(p, box)) lo = mid;
      else hi = mid;
    }
    return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
  }
  return course.at(-1)!;
}

/** Every drawn course: partnership lines, lines of descent and the routed
 * auxiliary lines, as point lists. */
function courses(connectors: PedigreeConnectors): P[][] {
  const fromSegment = (s: LineSegment): P[] => [
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ];
  return [
    ...connectors.groupLines.flatMap((line) =>
      [line.segment, ...(line.endpointSegments ?? [])].map(fromSegment),
    ),
    ...connectors.parentChildLines.flatMap((line) =>
      [
        ...line.parentLink,
        ...(line.siblingBar ? [line.siblingBar] : []),
        ...line.uplines,
      ].map(fromSegment),
    ),
    ...connectors.auxiliaryLines.map((line) => line.points),
  ];
}

const parent = (
  source: string,
  kind: 'biological' | 'social' | 'adoptive' | 'donor' | 'surrogate',
  target: string,
  carrier = false,
): PedigreeLink => ({
  source,
  target,
  kind,
  isGestationalCarrier: carrier,
});
const partners = (a: string, b: string, isActive = true): PedigreeLink => ({
  source: a,
  target: b,
  kind: 'partner',
  isActive,
});

describe('every recorded tie is drawn as a line', () => {
  it.each(['identicalTwin', 'fraternalTwin', 'unknownZygosityTwin'] as const)(
    'draws the line from the surrogate of %s pair',
    (kind) => {
      const { connectors } = draw(
        ['ego', 'mum', 'dad', 'arjun', 'lena'],
        [
          parent('mum', 'biological', 'ego'),
          parent('dad', 'biological', 'ego'),
          parent('mum', 'biological', 'arjun'),
          parent('dad', 'biological', 'arjun'),
          partners('mum', 'dad'),
          parent('lena', 'surrogate', 'ego', true),
          parent('lena', 'surrogate', 'arjun', true),
          { source: 'ego', target: 'arjun', kind },
        ],
      );
      const lenas = connectors.auxiliaryLines.filter(
        (line) => line.endpointIds?.[0] === 'lena',
      );
      expect(lenas.length).toBeGreaterThan(0);
      for (const line of lenas) {
        expect(line.points.length).toBeGreaterThanOrEqual(2);
        const [first, last] = [line.points[0]!, line.points.at(-1)!];
        expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(
          DIMENSIONS.nodeHeight / 2,
        );
      }
    },
  );

  const scene: RoutingScene = {
    boxWidth: 0.4,
    boxHeight: 0.5,
    symbols: [],
    brackets: [],
    lines: [],
    rowXs: [[0], [1, 2]],
  };

  it('routes a line to a bar it is offered no place on', () => {
    const { points } = routeLine(
      { person: 0, x: 0, layer: 0 },
      {
        kind: 'bar',
        bar: { type: 'line', x1: 1.5, y1: 0.75, x2: 1.5, y2: 0.75 },
        layer: 1,
        joins: [],
      },
      'owner',
      scene,
    );
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)).toEqual({ x: 1.5, y: 0.75 });
  });

  it('routes a line to a child it is offered no place on', () => {
    const { points } = routeLine(
      { person: 0, x: 0, layer: 0 },
      { kind: 'child', person: 1, x: 1, layer: 1, attachments: [] },
      'owner',
      scene,
    );
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)!.x).toBeCloseTo(1, 9);
  });
});

describe('where auxiliary lines meet a symbol', () => {
  const W = DIMENSIONS.nodeWidth;

  it('spreads the lines into one child across its top edge, in the order of their parents', () => {
    const { connectors, centre, boxOf } = draw(
      ['ego', 'beth', 'jo', 'tom'],
      [
        parent('beth', 'biological', 'ego', true),
        parent('jo', 'social', 'ego'),
        partners('beth', 'jo'),
        parent('tom', 'donor', 'ego'),
      ],
      { ego: 'square', beth: 'circle', jo: 'circle', tom: 'square' },
    );
    const ends = ['jo', 'tom'].map((from) => {
      const line = connectors.auxiliaryLines.find(
        (l) => l.endpointIds?.[0] === from,
      )!;
      return { from, x: edgeCrossing(line.points, boxOf('ego'), true).x };
    });
    const byEnd = ends.toSorted((a, b) => a.x - b.x).map((end) => end.from);
    const byParent = ['jo', 'tom'].toSorted(
      (a, b) => centre(a).x - centre(b).x,
    );
    expect(byEnd).toEqual(byParent);
    expect(Math.abs(ends[0]!.x - ends[1]!.x)).toBeGreaterThanOrEqual(0.25 * W);
  });

  it('ends a line into a square on the flat part of its top edge', () => {
    const { connectors, centre, boxOf } = draw(
      ['ego', 'mary', 'don'],
      [
        parent('mary', 'biological', 'ego', true),
        parent('don', 'donor', 'ego'),
      ],
      { ego: 'square', mary: 'circle', don: 'square' },
    );
    const line = connectors.auxiliaryLines.find(
      (l) => l.endpointIds?.[0] === 'don',
    )!;
    const box = boxOf('ego');
    const entry = edgeCrossing(line.points, box, true);
    // The square's corners are rounded by a quarter of its width.
    expect(entry.y).toBeCloseTo(box.top, 0);
    expect(Math.abs(entry.x - centre('ego').x)).toBeLessThanOrEqual(0.25 * W);
  });

  it('leaves a parent at a point clear of their partnership line', () => {
    const { connectors, boxOf } = draw(
      ['ego', 'mum', 'dad', 'leila', 'ahmed', 'noor', 'yasmin'],
      [
        parent('mum', 'biological', 'ego', true),
        parent('dad', 'biological', 'ego'),
        parent('mum', 'biological', 'leila', true),
        parent('dad', 'biological', 'leila'),
        partners('mum', 'dad'),
        partners('ego', 'ahmed'),
        partners('leila', 'noor'),
        parent('leila', 'biological', 'yasmin', true),
        parent('noor', 'social', 'yasmin'),
        parent('ahmed', 'donor', 'yasmin'),
      ],
      { ahmed: 'square' },
    );
    const box = boxOf('ahmed');
    const donor = connectors.auxiliaryLines.find(
      (l) => l.endpointIds?.[0] === 'ahmed',
    )!;
    const donorExit = edgeCrossing(donor.points, box);
    const others = courses(connectors)
      .filter((course) => course !== donor.points)
      .flatMap((course) => {
        if (inside(course[0]!, box)) return [edgeCrossing(course, box)];
        if (inside(course.at(-1)!, box)) {
          return [edgeCrossing(course, box, true)];
        }
        return [];
      });
    expect(others.length).toBeGreaterThan(0);
    for (const exit of others) {
      expect(
        Math.hypot(exit.x - donorExit.x, exit.y - donorExit.y),
      ).toBeGreaterThanOrEqual(0.25 * W);
    }
  });

  it('raises a routed partnership beside, and clear of, the line of descent', () => {
    const { connectors, centre, boxOf } = draw(
      ['ego', 'ruth', 'father', 'theo', 'nadia', 'jess'],
      [
        parent('ruth', 'biological', 'ego', true),
        parent('father', 'biological', 'ego'),
        partners('ego', 'theo'),
        partners('ego', 'nadia'),
        partners('ego', 'jess', false),
      ],
    );
    const box = boxOf('ego');
    const stems = connectors.groupLines
      .flatMap((line) => line.endpointSegments ?? [])
      .filter(
        (s) =>
          Math.abs(s.x1 - s.x2) < 0.5 &&
          s.x1 > box.left &&
          s.x1 < box.right &&
          Math.min(s.y1, s.y2) < box.top,
      );
    expect(stems.length).toBeGreaterThan(0);
    for (const stem of stems) {
      expect(Math.abs(stem.x1 - centre('ego').x)).toBeGreaterThanOrEqual(
        0.25 * W,
      );
    }
  });
});
