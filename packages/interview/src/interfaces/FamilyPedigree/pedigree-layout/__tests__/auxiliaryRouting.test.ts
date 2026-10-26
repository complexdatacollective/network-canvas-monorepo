/**
 * The routing of the lines that join a parent to a child outside the child's
 * line of descent (donors, surrogates, step, social and adoptive parents),
 * checked on whole families laid out as the interface lays them out, and on
 * the router itself.
 */
import { describe, expect, it } from 'vitest';

import {
  courseCost,
  type DrawnLine,
  routeLine,
  type RoutingScene,
} from '../auxiliaryRouting';
import type { LayoutDimensions } from '../layoutDimensions';
import { drawPedigree } from '../pedigreeAdapter';
import type {
  LineSegment,
  PedigreeConnectors,
  PedigreeLink,
  PedigreeSymbolShape,
} from '../types';
import { INTERFACE_DIMENSIONS } from './fixtures';

const DIMENSIONS: LayoutDimensions = INTERFACE_DIMENSIONS;

function draw(
  people: string[],
  links: PedigreeLink[],
  shapes: Record<string, PedigreeSymbolShape> = {},
) {
  const { positions: topLeft, connectorData } = drawPedigree({
    nodeIds: people,
    links,
    dimensions: DIMENSIONS,
    nodeNames: new Map(people.map((id) => [id, id])),
    nodeShapes: new Map(Object.entries(shapes)),
  });
  const { connectors } = connectorData;
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
    'draws the parents’ line to the line of descent from the surrogate of a %s pair',
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
      // The twins' line of descent comes from the one who carried them
      // (Round 5, ruling 2), and their parents' line joins it.
      const descent = connectors.parentChildLines.find((line) =>
        line.uplines.some((upline) => upline.childId === 'ego'),
      );
      expect(descent?.parentIds).toEqual(['lena']);
      const parents = connectors.auxiliaryLines.filter((line) =>
        (line.ownerIds ?? []).includes('mum'),
      );
      expect(parents.length).toBeGreaterThan(0);
      for (const line of parents) {
        expect(line.ownerIds).toEqual(expect.arrayContaining(['mum', 'dad']));
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

  it('routes a line to the point on a line of descent it is offered', () => {
    const { points } = routeLine(
      { person: 0, x: 0, layer: 0 },
      { kind: 'join', points: [{ x: 1.5, y: 0.75 }], layer: 1 },
      'owner',
      scene,
    );
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)).toEqual({ x: 1.5, y: 0.75 });
  });

  it('weighs every crossing the same, whatever it crosses', () => {
    // A line straight down from a parent to a child, across one line.
    const across: LineSegment = {
      type: 'line',
      x1: -1,
      y1: 0.75,
      x2: 1,
      y2: 0.75,
    };
    const costAcross = (kind: DrawnLine['kind']) =>
      courseCost(
        { person: 0, x: 0, layer: 0 },
        { kind: 'child', person: 1, x: 0, layer: 1 },
        'owner',
        { ...scene, lines: [{ segment: across, kind }] },
        [
          { x: 0, y: 0.25 },
          { x: 0, y: 1.25 },
        ],
      );
    expect(costAcross('partnership')).toBe(costAcross('bar'));
    expect(costAcross('upline')).toBe(costAcross('bar'));
    expect(costAcross('other')).toBe(costAcross('bar'));
    expect(costAcross('other')).toBeGreaterThan(
      courseCost(
        { person: 0, x: 0, layer: 0 },
        { kind: 'child', person: 1, x: 0, layer: 1 },
        'owner',
        scene,
        [
          { x: 0, y: 0.25 },
          { x: 0, y: 1.25 },
        ],
      ),
    );
  });

  it('routes a line to the middle of the top of a child', () => {
    const { points } = routeLine(
      { person: 0, x: 0, layer: 0 },
      { kind: 'child', person: 1, x: 1, layer: 1 },
      'owner',
      scene,
    );
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)!.x).toBeCloseTo(1, 9);
  });
});

describe('where auxiliary lines meet a symbol', () => {
  const W = DIMENSIONS.nodeWidth;

  it('brings the lines into one child to its centre, each from the side of its parent', () => {
    const { connectors, centre } = draw(
      ['ego', 'beth', 'jo', 'tom'],
      [
        parent('beth', 'biological', 'ego', true),
        parent('jo', 'social', 'ego'),
        partners('beth', 'jo'),
        parent('tom', 'donor', 'ego'),
      ],
      { ego: 'square', beth: 'circle', jo: 'circle', tom: 'square' },
    );
    // Lines aim centre to centre (Josh, 22 Oct 2026). The direction each
    // arrives from, as an angle off straight down, negative from the left.
    const top = centre('ego');
    const arrivals = ['jo', 'tom'].map((from) => {
      const line = connectors.auxiliaryLines.find(
        (l) => l.endpointIds?.[0] === from,
      )!;
      const at = line.points.findIndex(
        (p) => Math.hypot(p.x - top.x, p.y - top.y) < 1,
      );
      expect(at, from).toBeGreaterThan(0);
      const before = line.points[at - 1]!;
      return { from, angle: Math.atan2(before.x - top.x, top.y - before.y) };
    });
    const byArrival = arrivals
      .toSorted((a, b) => a.angle - b.angle)
      .map((end) => end.from);
    const byParent = ['jo', 'tom'].toSorted(
      (a, b) => centre(a).x - centre(b).x,
    );
    expect(byArrival).toEqual(byParent);
    expect(arrivals[0]!.angle).not.toBeCloseTo(arrivals[1]!.angle, 1);
  });

  it('aims a line into a child at the centre of their symbol, which hides its end', () => {
    const { connectors, centre } = draw(
      ['ego', 'mary', 'don'],
      [
        parent('mary', 'biological', 'ego', true),
        parent('don', 'social', 'ego'),
      ],
      { ego: 'square', mary: 'circle', don: 'square' },
    );
    const line = connectors.auxiliaryLines.find(
      (l) => l.endpointIds?.[0] === 'don',
    )!;
    const near = (p: P | undefined, q: P) => {
      expect(p!.x).toBeCloseTo(q.x, 6);
      expect(p!.y).toBeCloseTo(q.y, 6);
    };
    near(line.points[0], centre('don'));
    near(line.points.at(-1), centre('ego'));
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

type Drawn = { segment: LineSegment; line: string };

/** Every drawn segment longer than a pixel, with which line it belongs to:
 * `aux:<index>` for the auxiliary lines, or the kind of connector. */
function drawnSegments(connectors: PedigreeConnectors): Drawn[] {
  const out: Drawn[] = [];
  connectors.groupLines.forEach((line, k) => {
    for (const segment of [
      line.segment,
      ...(line.endpointSegments ?? []),
      ...(line.doubleSegment ? [line.doubleSegment] : []),
    ]) {
      out.push({ segment, line: `group:${k}` });
    }
  });
  connectors.parentChildLines.forEach((line, k) => {
    for (const segment of [
      ...line.parentLink,
      ...(line.siblingBar ? [line.siblingBar] : []),
      ...line.uplines,
    ]) {
      out.push({ segment, line: `descent:${k}` });
    }
  });
  connectors.twinIndicators.forEach((twin, k) => {
    if (twin.segment) out.push({ segment: twin.segment, line: `twin:${k}` });
  });
  connectors.auxiliaryLines.forEach((line, k) => {
    line.points.slice(1).forEach((point, n) => {
      const from = line.points[n]!;
      out.push({
        segment: {
          type: 'line',
          x1: from.x,
          y1: from.y,
          x2: point.x,
          y2: point.y,
        },
        line: `aux:${k}`,
      });
    });
  });
  return out.filter(
    ({ segment: s }) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 1,
  );
}

/** Where two segments cross at a point inside both. */
function crossingPoint(a: LineSegment, b: LineSegment): P | undefined {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / denominator;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / denominator;
  if (t <= 1e-3 || t >= 1 - 1e-3 || u <= 1e-3 || u >= 1 - 1e-3) {
    return undefined;
  }
  return { x: a.x1 + t * rx, y: a.y1 + t * ry };
}

const pointToSegment = (p: P, s: LineSegment) => {
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
};

/** How far two segments run side by side, nearly parallel and closer than
 * `margin` but not on one line, outside the given boxes. */
function sideBySide(
  a: LineSegment,
  b: LineSegment,
  margin: number,
  boxes: Box[],
) {
  const la = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
  const lb = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
  const [ux, uy] = [(a.x2 - a.x1) / la, (a.y2 - a.y1) / la];
  const [vx, vy] = [(b.x2 - b.x1) / lb, (b.y2 - b.y1) / lb];
  if (Math.abs(ux * vy - uy * vx) > 0.1) return 0;
  // Sample along a, measuring the distance to b where b lies alongside.
  let run = 0;
  const steps = Math.ceil(la);
  for (let k = 0; k < steps; k++) {
    const p = { x: a.x1 + ux * (k + 0.5), y: a.y1 + uy * (k + 0.5) };
    if (boxes.some((box) => inside(p, box))) continue;
    const along = (p.x - b.x1) * vx + (p.y - b.y1) * vy;
    if (along < 0 || along > lb) continue;
    const d = pointToSegment(p, b);
    if (d > 1 && d < margin) run += la / steps;
  }
  return run;
}

describe('auxiliary lines keep clear of every other line', () => {
  const W = DIMENSIONS.nodeWidth;
  const H = DIMENSIONS.nodeHeight;
  const auxOf = (connectors: PedigreeConnectors, from: string, to?: string) =>
    connectors.auxiliaryLines.filter(
      (line) =>
        line.endpointIds?.[0] === from &&
        (to === undefined || line.endpointIds?.[1] === to),
    );
  const crossCount = (a: P[], b: P[]) => {
    let count = 0;
    for (let i = 1; i < a.length; i++) {
      for (let j = 1; j < b.length; j++) {
        const s = {
          type: 'line',
          x1: a[i - 1]!.x,
          y1: a[i - 1]!.y,
          x2: a[i]!.x,
          y2: a[i]!.y,
        } as const;
        const t = {
          type: 'line',
          x1: b[j - 1]!.x,
          y1: b[j - 1]!.y,
          x2: b[j]!.x,
          y2: b[j]!.y,
        } as const;
        if (crossingPoint(s, t)) count++;
      }
    }
    return count;
  };

  const adoptedBirthParents = () =>
    draw(
      ['ego', 'chloe', 'tyler', 'helen', 'mark', 'sam', 'amber'],
      [
        parent('chloe', 'biological', 'ego', true),
        parent('tyler', 'biological', 'ego'),
        partners('chloe', 'tyler', false),
        parent('helen', 'adoptive', 'ego'),
        parent('mark', 'adoptive', 'ego'),
        partners('helen', 'mark'),
        partners('chloe', 'sam'),
        partners('tyler', 'amber'),
      ],
    );

  it('draws one line from two former partners who are an adopted child’s birth parents', () => {
    const { connectors } = adoptedBirthParents();
    const lines = connectors.auxiliaryLines.filter(
      (line) => line.edgeType === 'biological',
    );
    expect(lines.map((line) => (line.ownerIds ?? []).toSorted())).toEqual([
      ['chloe', 'tyler'],
    ]);
  });

  // The unnamed stand-ins fill each missing genetic parent, as the
  // interface records them.
  const adoptedByGrandparents = () =>
    draw(
      ['ego', 'carmen', 'egoFather', 'rosa', 'luis', 'diego'],
      [
        parent('carmen', 'biological', 'ego', true),
        parent('egoFather', 'biological', 'ego'),
        parent('rosa', 'biological', 'carmen', true),
        parent('luis', 'biological', 'carmen'),
        partners('rosa', 'luis'),
        parent('rosa', 'biological', 'diego', true),
        parent('luis', 'biological', 'diego'),
        parent('rosa', 'adoptive', 'ego'),
        parent('luis', 'adoptive', 'ego'),
      ],
    );

  it('keeps grandparents’ adoptive lines apart from each other and from other lines', () => {
    const people = ['ego', 'carmen', 'egoFather', 'rosa', 'luis', 'diego'];
    const { connectors, boxOf } = adoptedByGrandparents();
    const boxes = people.map(boxOf);
    const segments = drawnSegments(connectors);
    const faults: string[] = [];
    for (const a of segments.filter((s) => s.line.startsWith('aux'))) {
      for (const b of segments) {
        if (b.line === a.line) continue;
        const run = sideBySide(a.segment, b.segment, 0.25 * W, boxes);
        if (run > 0.25 * W)
          faults.push(`${a.line} beside ${b.line} for ${run}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps a corner of an auxiliary line clear of other lines', () => {
    const people = ['ego', 'carmen', 'egoFather', 'rosa', 'luis', 'diego'];
    const { connectors, boxOf } = adoptedByGrandparents();
    const boxes = people.map(boxOf);
    const segments = drawnSegments(connectors);
    const faults: string[] = [];
    // A corner under a symbol is hidden; one on its edge is where the lines
    // into a child converge, at its top.
    const grown = boxes.map((box) => ({
      left: box.left - 1,
      right: box.right + 1,
      top: box.top - 1,
      bottom: box.bottom + 1,
    }));
    connectors.auxiliaryLines.forEach((line, k) => {
      for (const corner of line.points.slice(1, -1)) {
        if (grown.some((box) => inside(corner, box))) continue;
        for (const b of segments) {
          if (b.line === `aux:${k}`) continue;
          const d = pointToSegment(corner, b.segment);
          if (d < 0.2 * W) faults.push(`aux:${k} corner ${d}px from ${b.line}`);
        }
      }
    });
    expect(faults).toEqual([]);
  });

  it('keeps lines clear of the symbols they do not join', () => {
    const people = [
      'ego',
      'karen',
      'mike',
      'shannon',
      'egoFather',
      'lauren',
      'denise',
      'jack',
    ];
    const { connectors, boxOf } = draw(people, [
      parent('egoFather', 'biological', 'ego'),
      parent('karen', 'adoptive', 'ego'),
      parent('mike', 'adoptive', 'ego'),
      partners('karen', 'mike', false),
      parent('shannon', 'biological', 'ego', true),
      partners('mike', 'lauren'),
      parent('lauren', 'social', 'ego'),
      partners('karen', 'denise'),
      parent('denise', 'social', 'ego'),
      parent('mike', 'biological', 'jack'),
      parent('lauren', 'biological', 'jack', true),
    ]);
    const faults: string[] = [];
    for (const line of connectors.auxiliaryLines) {
      const [from, to] = line.endpointIds ?? [];
      for (const id of people) {
        if (id === from || id === to) continue;
        const box = boxOf(id);
        const near = {
          left: box.left - 0.2 * W,
          right: box.right + 0.2 * W,
          top: box.top - 0.2 * H,
          bottom: box.bottom + 0.2 * H,
        };
        const close = line.points.slice(1).some((point, n) => {
          const a = line.points[n]!;
          const steps = Math.ceil(Math.hypot(point.x - a.x, point.y - a.y));
          for (let k = 0; k <= steps; k++) {
            const p = {
              x: a.x + ((point.x - a.x) * k) / steps,
              y: a.y + ((point.y - a.y) * k) / steps,
            };
            if (inside(p, near)) return true;
          }
          return false;
        });
        if (close) faults.push(`${from}→${to} passes close to ${id}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('never crosses one parent’s own lines over each other', () => {
    const { connectors } = draw(
      ['ego', 'emma', 'liam', 'claire', 'donor', 'julie', 'kate', 'liamFather'],
      [
        parent('liamFather', 'biological', 'liam'),
        parent('emma', 'biological', 'ego', true),
        parent('liam', 'biological', 'ego'),
        partners('emma', 'liam'),
        parent('claire', 'biological', 'emma', true),
        parent('donor', 'donor', 'emma'),
        parent('julie', 'biological', 'liam', true),
        parent('kate', 'social', 'liam'),
        partners('julie', 'kate'),
        parent('donor', 'donor', 'liam'),
      ],
    );
    const lines = auxOf(connectors, 'donor');
    expect(lines).toHaveLength(2);
    expect(crossCount(lines[0]!.points, lines[1]!.points)).toBe(0);
  });

  it('keeps lines off an adopted person’s brackets, partnership lines included', () => {
    const people = ['ego', 'rosa', 'luis', 'marco', 'pat'];
    const { connectors, boxOf } = draw(people, [
      parent('rosa', 'biological', 'ego', true),
      parent('luis', 'biological', 'ego'),
      partners('rosa', 'luis'),
      parent('rosa', 'biological', 'marco', true),
      parent('luis', 'biological', 'marco'),
      parent('marco', 'adoptive', 'ego'),
      partners('ego', 'pat'),
    ]);
    const box = boxOf('ego');
    // PersonNode draws each bracket 4-16px (at a 96px symbol) outside the
    // symbol, 8px above and below it, with a 5px stroke.
    const scale = W / 96;
    const brackets = [-1, 1].map((side) => {
      const edge = side < 0 ? box.left : box.right;
      const [inner, outer] = [
        edge + side * 4 * scale,
        edge + side * 16 * scale,
      ];
      return {
        left: Math.min(inner, outer) - 2.5,
        right: Math.max(inner, outer) + 2.5,
        top: box.top - 8 * scale - 2.5,
        bottom: box.bottom + 8 * scale + 2.5,
      };
    });
    const faults = drawnSegments(connectors).flatMap(({ segment: s, line }) => {
      const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
      for (let k = 0; k <= steps; k++) {
        const p = {
          x: s.x1 + ((s.x2 - s.x1) * k) / steps,
          y: s.y1 + ((s.y2 - s.y1) * k) / steps,
        };
        if (brackets.some((bracket) => inside(p, bracket))) {
          return [`${line} runs into a bracket at ${p.x},${p.y}`];
        }
      }
      return [];
    });
    expect(faults).toEqual([]);
  });
});

describe('lines of one owner', () => {
  const W = DIMENSIONS.nodeWidth;

  it('leave the owner from its centre and keep clear of each other once they part', () => {
    const { connectors, boxOf } = draw(
      ['ego', 'sib', 'mum', 'dad', 'stepdad'],
      [
        partners('mum', 'dad', false),
        partners('mum', 'stepdad'),
        ...['ego', 'sib'].flatMap((child) => [
          parent('mum', 'biological', child, true),
          parent('dad', 'biological', child),
          parent('stepdad', 'social', child),
        ]),
      ],
    );
    const [a, b] = connectors.auxiliaryLines.filter(
      (line) => line.endpointIds?.[0] === 'stepdad',
    );
    expect(a && b).toBeTruthy();
    const pieces = (points: P[]): LineSegment[] =>
      points.slice(1).map((p, k) => ({
        type: 'line',
        x1: points[k]!.x,
        y1: points[k]!.y,
        x2: p.x,
        y2: p.y,
      }));
    const [aPieces, bPieces] = [pieces(a!.points), pieces(b!.points)];
    const apart = (p: P, other: LineSegment[]) =>
      Math.min(...other.map((t) => pointToSegment(p, t)));
    // Where they part: a corner of one on the course of the other.
    const partings = [
      ...a!.points.filter((p) => apart(p, bPieces) < 0.5),
      ...b!.points.filter((p) => apart(p, aPieces) < 0.5),
    ];
    // They leave the stepfather's centre together, parting there as a V
    // (Josh, 22 Oct 2026: lines aim centre to centre).
    expect(a!.points[0]).toEqual(b!.points[0]);
    // Everywhere else, away from where they part and from the symbols,
    // they never run alongside each other closer than a quarter of a
    // symbol. Pieces drawing apart at an angle, as a V does, are not
    // running alongside.
    const symbols = ['ego', 'sib', 'stepdad'].map(boxOf);
    const heading = (t: LineSegment) => Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
    const alongside = (s: LineSegment, t: LineSegment) => {
      const turn = Math.abs(heading(s) - heading(t)) % Math.PI;
      return Math.min(turn, Math.PI - turn) < Math.PI / 36;
    };
    const close = aPieces.flatMap((s) => {
      const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
      const beside = bPieces.filter((t) => alongside(s, t));
      return Array.from({ length: steps }, (_, k) => {
        const t = (k + 0.5) / steps;
        return { x: s.x1 + t * (s.x2 - s.x1), y: s.y1 + t * (s.y2 - s.y1) };
      }).filter((p) => {
        if (beside.length === 0) return false;
        if (symbols.some((box) => inside(p, box))) return false;
        if (partings.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.3 * W)) {
          return false;
        }
        const d = apart(p, beside);
        return d >= 0.5 && d < 0.25 * W - 0.5;
      });
    });
    // Each sample stands for a pixel of the course.
    expect(close.length).toBeLessThanOrEqual(0.25 * W);
  });
});

describe('a carrier of some of a sibship', () => {
  it('draws a straight line to each child she carried, and the couple’s children stay one sibship', () => {
    const { connectors } = draw(
      ['ego', 'ana', 'luis', 'carrier', 'leo', 'mia'],
      [
        partners('ana', 'luis'),
        ...['ego', 'leo', 'mia'].flatMap((child) => [
          parent('ana', 'biological', child, child === 'mia'),
          parent('luis', 'biological', child),
        ]),
        parent('carrier', 'surrogate', 'ego', true),
        parent('carrier', 'surrogate', 'leo', true),
      ],
    );
    // One sibship: one line of descent reaches all three children.
    const sibship = connectors.parentChildLines.filter((line) =>
      line.uplines.some((upline) =>
        ['ego', 'leo', 'mia'].includes(upline.childId ?? ''),
      ),
    );
    expect(sibship).toHaveLength(1);
    expect(
      sibship[0]!.uplines.flatMap((upline) => upline.childId ?? []).toSorted(),
    ).toEqual(['ego', 'leo', 'mia']);
    // A line for part of a sibship goes to each child, straight to their
    // centre (Josh, 22 Oct 2026).
    const lines = connectors.auxiliaryLines.filter(
      (line) => line.endpointIds?.[0] === 'carrier',
    );
    expect(
      lines
        .map((line) => line.endpointIds?.[1] ?? '')
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['ego', 'leo']);
    for (const line of lines) expect(line.points).toHaveLength(2);
  });
});
