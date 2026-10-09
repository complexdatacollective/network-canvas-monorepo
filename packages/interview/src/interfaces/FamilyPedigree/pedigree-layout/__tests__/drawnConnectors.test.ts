/**
 * The connectors drawn for whole families, laid out as the interface lays
 * them out: links → toPedigreeInput → alignPedigree → buildConnectorData.
 * These tests check what a reader of the drawing sees, so they assert on line
 * styles and geometry rather than on the layout's internal columns.
 */
import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import type { LayoutDimensions } from '../layoutDimensions';
import {
  buildConnectorData,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type {
  LineSegment,
  ParentChildConnector,
  PedigreeConnectors,
  PedigreeEdgeType,
  PedigreeLink,
  PedigreeSymbolShape,
} from '../types';
import { INTERFACE_DIMENSIONS } from './fixtures';
import { type Drawing, faultsOfLinesInto } from './lineFaults';

const DIMENSIONS: LayoutDimensions = INTERFACE_DIMENSIONS;

type Link =
  | [string, 'partner', string, { former?: boolean }?]
  | [
      string,
      Exclude<PedigreeEdgeType, 'partner'>,
      string,
      { carrier?: boolean }?,
    ];

/** Everyone drawn with one shape, as the interface draws every person with
 * the shape their codebook gives them. */
function draw(
  people: string[],
  spec: Link[],
  shape: PedigreeSymbolShape = 'circle',
) {
  const links: PedigreeLink[] = spec.map(([source, kind, target, extra]) => ({
    source,
    target,
    kind,
    ...(kind === 'partner'
      ? { isActive: !(extra && 'former' in extra && extra.former) }
      : {
          isGestationalCarrier: !!(
            extra &&
            'carrier' in extra &&
            extra.carrier
          ),
        }),
  }));
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
    new Map(people.map((id) => [id, shape])),
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
  return { connectors, centre };
}

const isDashed = (edgeType: PedigreeEdgeType) =>
  edgeType === 'social' || edgeType === 'adoptive';

/** The parent-child connectors whose uplines reach the child. */
function descentsInto(connectors: PedigreeConnectors, childId: string) {
  return connectors.parentChildLines.filter((line) =>
    line.uplineChildIds?.includes(childId),
  );
}

/** The child's own upline, with the style of the connector drawing it. */
function uplineOf(
  connectors: PedigreeConnectors,
  childId: string,
): { segment: LineSegment; connector: ParentChildConnector } {
  for (const connector of connectors.parentChildLines) {
    const index = connector.uplineChildIds?.indexOf(childId) ?? -1;
    if (index >= 0) {
      return { segment: connector.uplines[index]!, connector };
    }
  }
  throw new Error(`${childId} has no upline`);
}

/** Every line that starts at the parent and carries their tie. */
function auxiliaryLinesFrom(connectors: PedigreeConnectors, parentId: string) {
  return connectors.auxiliaryLines.filter(
    (line) => line.endpointIds?.[0] === parentId,
  );
}

describe('each parent tie is drawn in its own style', () => {
  it('joins a step parent who is the birth parent’s partner to the child by a dashed line', () => {
    const { connectors } = draw(
      ['ego', 'paul', 'claire'],
      [
        ['paul', 'biological', 'ego'],
        ['claire', 'social', 'ego'],
        ['paul', 'partner', 'claire'],
      ],
    );
    const claireLines = auxiliaryLinesFrom(connectors, 'claire');
    expect(claireLines).toHaveLength(1);
    expect(claireLines[0]!.edgeType).toBe('social');
    expect(claireLines[0]!.endpointIds?.[1]).toBe('ego');
    // Paul's own tie stays solid.
    expect(uplineOf(connectors, 'ego').connector.edgeType).toBe('biological');
  });

  it('draws a step parent who is no one’s partner by a dashed line too', () => {
    const { connectors } = draw(
      ['ego', 'paul', 'claire'],
      [
        ['paul', 'biological', 'ego'],
        ['claire', 'social', 'ego'],
      ],
    );
    const claireLines = auxiliaryLinesFrom(connectors, 'claire');
    expect(claireLines.map((line) => line.edgeType)).toEqual(['social']);
  });

  it('draws no line from a partner who is no parent of the child', () => {
    const { connectors } = draw(
      ['ego', 'paul', 'claire'],
      [
        ['paul', 'biological', 'ego'],
        ['paul', 'partner', 'claire'],
      ],
    );
    expect(auxiliaryLinesFrom(connectors, 'claire')).toHaveLength(0);
  });

  it('joins a step parent to every child of the sibship they raise', () => {
    const { connectors } = draw(
      ['ego', 'sis', 'paul', 'claire'],
      [
        ['paul', 'biological', 'ego'],
        ['paul', 'biological', 'sis'],
        ['claire', 'social', 'ego'],
        ['claire', 'social', 'sis'],
        ['paul', 'partner', 'claire'],
      ],
    );
    const claireLines = auxiliaryLinesFrom(connectors, 'claire');
    expect(claireLines.length).toBeGreaterThan(0);
    expect(claireLines.every((line) => line.edgeType === 'social')).toBe(true);
  });

  for (const order of [
    ['ego', 'sam'],
    ['sam', 'ego'],
  ]) {
    it(`styles each child of a mixed sibship by their own tie (${order.join(', ')})`, () => {
      const { connectors } = draw(
        [...order, 'ruth', 'gerald'],
        [
          ['ruth', 'biological', 'ego', { carrier: true }],
          ['gerald', 'biological', 'ego'],
          ['ruth', 'adoptive', 'sam'],
          ['gerald', 'adoptive', 'sam'],
          ['ruth', 'partner', 'gerald'],
        ],
      );
      expect(uplineOf(connectors, 'ego').connector.edgeType).toBe('biological');
      expect(isDashed(uplineOf(connectors, 'sam').connector.edgeType)).toBe(
        true,
      );
      // Ego's way up to the couple is solid all the way.
      for (const line of descentsInto(connectors, 'ego')) {
        expect(isDashed(line.edgeType)).toBe(false);
      }
    });
  }

  it('draws the social ties of a couple raising a donor-conceived child and their own child', () => {
    // Marcus is ego's biological parent; Julian, his partner, raises ego.
    // Leo is a child they both raise.
    const { connectors } = draw(
      ['ego', 'leo', 'marcus', 'julian'],
      [
        ['marcus', 'biological', 'ego'],
        ['julian', 'social', 'ego'],
        ['marcus', 'social', 'leo'],
        ['julian', 'social', 'leo'],
        ['marcus', 'partner', 'julian'],
      ],
    );
    expect(uplineOf(connectors, 'ego').connector.edgeType).toBe('biological');
    expect(isDashed(uplineOf(connectors, 'leo').connector.edgeType)).toBe(true);
    const julianToEgo = auxiliaryLinesFrom(connectors, 'julian').filter(
      (line) => line.endpointIds?.[1] === 'ego',
    );
    expect(julianToEgo.map((line) => line.edgeType)).toEqual(['social']);
  });
});

type StyledSegment = { segment: LineSegment; dashed: boolean };

/** Every drawn line segment, with whether it is drawn dashed. */
function drawnSegments(connectors: PedigreeConnectors): StyledSegment[] {
  const segments: StyledSegment[] = [];
  for (const line of connectors.groupLines) {
    for (const segment of [line.segment, ...(line.endpointSegments ?? [])]) {
      segments.push({ segment, dashed: false });
    }
  }
  for (const line of connectors.parentChildLines) {
    const dashed = isDashed(line.edgeType);
    for (const segment of [
      ...line.parentLink,
      ...(line.siblingBar ? [line.siblingBar] : []),
      ...line.uplines,
    ]) {
      segments.push({ segment, dashed });
    }
  }
  for (const line of connectors.auxiliaryLines) {
    for (const segment of auxiliarySegments(line)) {
      segments.push({ segment, dashed: isDashed(line.edgeType) });
    }
  }
  return segments.filter(({ segment }) => length(segment) > 0.5);
}

/** The pieces of an auxiliary line, from the parent to the child or bar. */
function auxiliarySegments(
  line: PedigreeConnectors['auxiliaryLines'][number],
): LineSegment[] {
  const course = line as { points?: { x: number; y: number }[] };
  if (!course.points) {
    return [(line as unknown as { segment: LineSegment }).segment];
  }
  return course.points.slice(1).map((point, k) => ({
    type: 'line',
    x1: course.points![k]!.x,
    y1: course.points![k]!.y,
    x2: point.x,
    y2: point.y,
  }));
}

const length = (s: LineSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** How far two segments run along one another on the same line. */
function collinearOverlap(a: LineSegment, b: LineSegment): number {
  const EPSILON = 0.5;
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0 || length(b) === 0) return 0;
  const distanceFromA = (x: number, y: number) =>
    Math.abs((x - a.x1) * dy - (y - a.y1) * dx) / len;
  if (
    distanceFromA(b.x1, b.y1) > EPSILON ||
    distanceFromA(b.x2, b.y2) > EPSILON
  ) {
    return 0;
  }
  const along = (x: number, y: number) =>
    ((x - a.x1) * dx + (y - a.y1) * dy) / len;
  const [b1, b2] = [along(b.x1, b.y1), along(b.x2, b.y2)].toSorted(
    (p, q) => p - q,
  );
  return Math.max(0, Math.min(len, b2!) - Math.max(0, b1!));
}

/** How far two segments lie along one line, outside the given boxes (the
 * symbols that hide them there). */
function collinearOverlapOutside(
  a: LineSegment,
  b: LineSegment,
  boxes: { left: number; top: number; right: number; bottom: number }[],
): number {
  const overlap = collinearOverlap(a, b);
  if (overlap === 0) return 0;
  const len = length(a);
  const [ux, uy] = [(a.x2 - a.x1) / len, (a.y2 - a.y1) / len];
  const along = (x: number, y: number) => (x - a.x1) * ux + (y - a.y1) * uy;
  const from = Math.max(0, Math.min(along(b.x1, b.y1), along(b.x2, b.y2)));
  const steps = Math.max(1, Math.ceil(overlap));
  let seen = 0;
  for (let k = 0; k < steps; k++) {
    const t = from + (overlap * (k + 0.5)) / steps;
    const p = { x: a.x1 + ux * t, y: a.y1 + uy * t };
    const hidden = boxes.some(
      (box) =>
        p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom,
    );
    if (!hidden) seen += overlap / steps;
  }
  return seen;
}

/** Solid segments that lie along a dashed one, hiding it. */
function solidOverDashed(connectors: PedigreeConnectors) {
  const segments = drawnSegments(connectors);
  const found: [LineSegment, LineSegment][] = [];
  for (const dashed of segments.filter((s) => s.dashed)) {
    for (const solid of segments.filter((s) => !s.dashed)) {
      if (collinearOverlap(dashed.segment, solid.segment) > 1) {
        found.push([dashed.segment, solid.segment]);
      }
    }
  }
  return found;
}

describe('a birth parent who raises an adopted child', () => {
  it('draws the birth parent’s tie as descent and the adoptive partner’s as their own dashed line', () => {
    const { connectors } = draw(
      ['ego', 'karen', 'steve', 'emily'],
      [
        ['karen', 'biological', 'ego', { carrier: true }],
        ['steve', 'adoptive', 'ego'],
        ['karen', 'partner', 'steve'],
        ['karen', 'biological', 'emily', { carrier: true }],
        ['steve', 'biological', 'emily'],
      ],
    );
    // Karen is not drawn as a donor.
    expect(
      auxiliaryLinesFrom(connectors, 'karen').map((line) => line.edgeType),
    ).toEqual([]);
    const egoDescent = uplineOf(connectors, 'ego').connector;
    expect(egoDescent.edgeType).toBe('biological');
    expect(egoDescent.parentIds).toContain('karen');
    expect(
      auxiliaryLinesFrom(connectors, 'steve').map((line) => [
        line.edgeType,
        line.endpointIds?.[1],
      ]),
    ).toEqual([['adoptive', 'ego']]);
  });

  it('keeps a step parent’s dashed adoptive line clear of the birth parent’s line once they have a child', () => {
    const { connectors } = draw(
      ['ego', 'paul', 'kate', 'nora'],
      [
        ['paul', 'biological', 'ego'],
        ['paul', 'partner', 'kate'],
        ['kate', 'adoptive', 'ego'],
        ['kate', 'biological', 'nora', { carrier: true }],
        ['paul', 'biological', 'nora'],
      ],
    );
    expect(auxiliaryLinesFrom(connectors, 'paul')).toEqual([]);
    expect(solidOverDashed(connectors)).toEqual([]);
  });

  it('keeps the adoptive line to a stepchild visible beside a later half-sibling', () => {
    const { connectors } = draw(
      ['ego', 'sara', 'ella', 'jess', 'leo'],
      [
        ['ego', 'partner', 'sara', { former: true }],
        ['ego', 'biological', 'ella'],
        ['sara', 'biological', 'ella', { carrier: true }],
        ['ego', 'partner', 'jess'],
        ['jess', 'adoptive', 'ella'],
        ['ego', 'biological', 'leo'],
        ['jess', 'biological', 'leo', { carrier: true }],
      ],
    );
    expect(solidOverDashed(connectors)).toEqual([]);
  });
});

describe('a child carried by a surrogate with no other parent', () => {
  it('draws the surrogate’s line of descent solid', () => {
    const { connectors } = draw(
      ['ego', 'dan', 'sue'],
      [
        ['dan', 'donor', 'ego'],
        ['sue', 'surrogate', 'ego', { carrier: true }],
      ],
    );
    expect(drawnSegments(connectors).filter((s) => s.dashed)).toEqual([]);
    expect(
      descentsInto(connectors, 'ego').map((line) => line.parentIds),
    ).toEqual([['sue']]);
  });
});

/** Partnership lines routed above a row, for partners who are not side by side. */
const routedPartnerships = (connectors: PedigreeConnectors) =>
  connectors.groupLines.filter((line) => line.endpointSegments);

describe('partnership lines routed above a row', () => {
  // Two sisters partnered with two brothers: the participant's parents sit
  // together, so their siblings' partnership has to be routed.
  const doubleCousins = () =>
    draw(
      [
        'ego',
        'helen',
        'rob',
        'june',
        'alan',
        'claire',
        'edna',
        'frank',
        'pete',
      ],
      [
        ['june', 'partner', 'alan'],
        ['edna', 'partner', 'frank'],
        ['june', 'biological', 'helen'],
        ['alan', 'biological', 'helen'],
        ['june', 'biological', 'claire'],
        ['alan', 'biological', 'claire'],
        ['edna', 'biological', 'rob'],
        ['frank', 'biological', 'rob'],
        ['edna', 'biological', 'pete'],
        ['frank', 'biological', 'pete'],
        ['helen', 'partner', 'rob'],
        ['helen', 'biological', 'ego', { carrier: true }],
        ['rob', 'biological', 'ego'],
        ['claire', 'partner', 'pete'],
      ],
    );

  it('runs clear of the sibling bars and the lines of descent', () => {
    const { connectors, centre } = doubleCousins();
    const routed = routedPartnerships(connectors);
    expect(routed.map((line) => line.partnerIds?.toSorted())).toEqual([
      ['claire', 'pete'],
    ]);
    const lane = routed[0]!.segment;
    const rowTop = centre('claire').y - DIMENSIONS.nodeHeight / 2;
    for (const line of connectors.parentChildLines) {
      for (const segment of [
        ...(line.siblingBar ? [line.siblingBar] : []),
        ...line.parentLink,
      ]) {
        if (segment.y1 !== segment.y2) continue;
        expect(Math.abs(segment.y1 - lane.y1)).toBeGreaterThan(4);
        expect(collinearOverlap(lane, segment)).toBe(0);
      }
    }
    // It sits between the row's sibling bars and the tops of the row's
    // symbols, where no sibling bar or line of descent runs.
    const barY = descentsInto(connectors, 'claire')[0]!.siblingBar!.y1;
    expect(lane.y1).toBeGreaterThan(barY);
    expect(lane.y1).toBeLessThan(rowTop);
  });

  it('rises from each partner beside, not along, their own line up to their parents', () => {
    const { connectors } = doubleCousins();
    const routed = routedPartnerships(connectors)[0]!;
    for (const person of ['claire', 'pete']) {
      const { segment: upline } = uplineOf(connectors, person);
      for (const stem of routed.endpointSegments!) {
        expect(collinearOverlap(upline, stem)).toBe(0);
      }
    }
  });

  it('gives each of a person’s routed partnerships a stem of its own', () => {
    const { connectors, centre } = draw(
      ['ego', 'ann', 'bea', 'cat', 'dee'],
      [
        ['ego', 'partner', 'ann', { former: true }],
        ['ego', 'partner', 'bea', { former: true }],
        ['ego', 'partner', 'cat', { former: true }],
        ['ego', 'partner', 'dee'],
      ],
    );
    const routed = routedPartnerships(connectors);
    expect(routed).toHaveLength(2);
    const ego = centre('ego');
    const egoStems = routed.flatMap((line) =>
      line.endpointSegments!.filter(
        (stem) =>
          Math.abs(stem.x1 - ego.x) < DIMENSIONS.nodeWidth / 2 &&
          Math.max(stem.y1, stem.y2) >= ego.y - 1,
      ),
    );
    expect(egoStems).toHaveLength(2);
    expect(egoStems[0]!.x1).not.toBeCloseTo(egoStems[1]!.x1, 0);
    expect(collinearOverlap(egoStems[0]!, egoStems[1]!)).toBe(0);
  });
});

/** Where a segment passes through the inside of a rectangle. */
function crossesRect(
  s: LineSegment,
  rect: { left: number; top: number; right: number; bottom: number },
): boolean {
  // Sample along the segment; symbols are large next to the step.
  const steps = Math.max(2, Math.ceil(length(s)));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = s.x1 + (s.x2 - s.x1) * t;
    const y = s.y1 + (s.y2 - s.y1) * t;
    if (
      x > rect.left + 1 &&
      x < rect.right - 1 &&
      y > rect.top + 1 &&
      y < rect.bottom - 1
    ) {
      return true;
    }
  }
  return false;
}

const distanceToSegment = (p: { x: number; y: number }, s: LineSegment) => {
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

/** Whether two segments cross at a point inside both. */
function properlyCross(a: LineSegment, b: LineSegment): boolean {
  const cross = (
    o: { x: number; y: number },
    p: { x: number; y: number },
    q: { x: number; y: number },
  ) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const a1 = { x: a.x1, y: a.y1 };
  const a2 = { x: a.x2, y: a.y2 };
  const b1 = { x: b.x1, y: b.y1 };
  const b2 = { x: b.x2, y: b.y2 };
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
}

/**
 * Everything wrong with how the auxiliary and direct lines are drawn: a line
 * through someone else's symbol or brackets, through another line's corner
 * or junction, or along another line.
 */
function auxiliaryLineFaults(
  connectors: PedigreeConnectors,
  people: string[],
  centre: (id: string) => { x: number; y: number },
  adopted: string[] = [],
): string[] {
  const W = DIMENSIONS.nodeWidth;
  const H = DIMENSIONS.nodeHeight;
  const boxOf = (id: string) => {
    const c = centre(id);
    return {
      left: c.x - W / 2,
      right: c.x + W / 2,
      top: c.y - H / 2,
      bottom: c.y + H / 2,
    };
  };
  const insideAnySymbol = (p: { x: number; y: number }) =>
    people.some((id) => {
      const b = boxOf(id);
      return p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom;
    });
  const faults: string[] = [];
  const withoutAuxiliary = drawnSegments({
    ...connectors,
    auxiliaryLines: [],
  });
  connectors.auxiliaryLines.forEach((line, index) => {
    const [from, to] = line.endpointIds ?? [];
    const name = `${from}→${to ?? 'their sibship'}`;
    const segments = auxiliarySegments(line);
    // One parent's lines of one kind to several children may share their
    // way down, as one line that branches.
    const others = [
      ...withoutAuxiliary,
      ...connectors.auxiliaryLines
        .filter(
          (other, otherIndex) =>
            otherIndex !== index &&
            !(
              other.endpointIds?.[0] === from &&
              other.edgeType === line.edgeType
            ),
        )
        .flatMap((other) =>
          auxiliarySegments(other).map((segment) => ({
            segment,
            dashed: isDashed(other.edgeType),
          })),
        ),
    ];
    // The parts of a line under its own parent's and child's symbols are
    // hidden by them.
    const ownBoxes = [from, to].flatMap((id) =>
      id !== undefined && people.includes(id) ? [boxOf(id)] : [],
    );
    for (const segment of segments) {
      for (const id of people) {
        if (id === from || id === to) continue;
        if (crossesRect(segment, boxOf(id))) {
          faults.push(`${name} passes through ${id}`);
        }
      }
      for (const id of adopted) {
        const c = centre(id);
        for (const side of [-1, 1]) {
          const inner = c.x + side * (W / 2 + 11);
          const outer = c.x + side * (W / 2 + 16);
          const bracket = {
            left: Math.min(inner, outer) - 1,
            right: Math.max(inner, outer) + 1,
            top: c.y - H / 2 - 9,
            bottom: c.y + H / 2 + 9,
          };
          if (crossesRect(segment, bracket)) {
            faults.push(`${name} crosses ${id}'s brackets`);
          }
        }
      }
      for (const other of others) {
        if (collinearOverlapOutside(segment, other.segment, ownBoxes) > 1) {
          faults.push(`${name} runs along another line`);
        }
        for (const vertex of [
          { x: other.segment.x1, y: other.segment.y1 },
          { x: other.segment.x2, y: other.segment.y2 },
        ]) {
          if (insideAnySymbol(vertex)) continue;
          const isMyEnd =
            Math.hypot(vertex.x - segment.x2, vertex.y - segment.y2) < 1 ||
            Math.hypot(vertex.x - segment.x1, vertex.y - segment.y1) < 1;
          if (!isMyEnd && distanceToSegment(vertex, segment) < 1) {
            faults.push(`${name} passes through a corner or junction`);
          }
        }
      }
    }
  });
  return [...new Set(faults)];
}

describe('auxiliary and direct parent lines', () => {
  const scenarios: Record<
    string,
    { people: string[]; links: Link[]; adopted?: string[] }
  > = {
    'a surrogate grandmother': {
      people: ['ego', 'hannah', 'ben', 'margaret', 'george'],
      links: [
        ['hannah', 'biological', 'ego'],
        ['hannah', 'partner', 'ben'],
        ['ben', 'biological', 'ego'],
        ['margaret', 'biological', 'hannah', { carrier: true }],
        ['george', 'biological', 'hannah'],
        ['margaret', 'partner', 'george'],
        ['margaret', 'surrogate', 'ego', { carrier: true }],
      ],
    },
    'a birth parent and a sperm donor': {
      people: ['ego', 'ann', 'dan'],
      links: [
        ['ann', 'biological', 'ego', { carrier: true }],
        ['dan', 'donor', 'ego'],
      ],
    },
    'an adopted child’s birth mother': {
      people: ['ego', 'ann', 'bob', 'cara'],
      adopted: ['ego'],
      links: [
        ['ann', 'adoptive', 'ego'],
        ['bob', 'adoptive', 'ego'],
        ['ann', 'partner', 'bob'],
        ['cara', 'biological', 'ego', { carrier: true }],
      ],
    },
    'a donor above one of three half-siblings': {
      people: ['ego', 'hannah', 'paul', 'ruby', 'theo'],
      links: [
        ['hannah', 'biological', 'ego', { carrier: true }],
        ['paul', 'donor', 'ego'],
        ['hannah', 'biological', 'ruby', { carrier: true }],
        ['hannah', 'biological', 'theo', { carrier: true }],
      ],
    },
    'a surrogate beside a half-sister’s descent': {
      people: [
        'ego',
        'grace',
        'henry',
        'oliver',
        'jenna',
        'mark',
        'paula',
        'zoe',
      ],
      links: [
        ['grace', 'biological', 'ego', { carrier: true }],
        ['henry', 'biological', 'ego'],
        ['grace', 'partner', 'henry'],
        ['grace', 'biological', 'oliver'],
        ['henry', 'biological', 'oliver'],
        ['jenna', 'surrogate', 'oliver', { carrier: true }],
        ['jenna', 'partner', 'mark'],
        ['henry', 'partner', 'paula', { former: true }],
        ['henry', 'biological', 'zoe'],
        ['paula', 'biological', 'zoe', { carrier: true }],
      ],
    },
    'a step parent of one of three siblings': {
      people: ['ego', 'jill', 'phil', 'ken', 'amy', 'ben'],
      links: [
        ['jill', 'biological', 'ego', { carrier: true }],
        ['phil', 'biological', 'ego'],
        ['jill', 'partner', 'phil', { former: true }],
        ['ken', 'social', 'ego'],
        ['jill', 'partner', 'ken'],
        ['jill', 'biological', 'amy', { carrier: true }],
        ['phil', 'biological', 'amy'],
        ['jill', 'biological', 'ben', { carrier: true }],
        ['phil', 'biological', 'ben'],
      ],
    },
    'an egg donor and a surrogate of twins': {
      people: ['ego', 'leo', 'marcus', 'julian', 'eggdonor', 'becky'],
      links: [
        ['marcus', 'biological', 'ego'],
        ['julian', 'social', 'ego'],
        ['marcus', 'social', 'leo'],
        ['julian', 'social', 'leo'],
        ['marcus', 'partner', 'julian'],
        ['eggdonor', 'donor', 'ego'],
        ['eggdonor', 'donor', 'leo'],
        ['becky', 'surrogate', 'ego', { carrier: true }],
        ['becky', 'surrogate', 'leo', { carrier: true }],
      ],
    },
    'a donor and a surrogate of two full siblings': {
      people: ['ego', 'leo', 'marcus', 'julian', 'eggdonor', 'becky'],
      links: [
        ['marcus', 'biological', 'ego'],
        ['julian', 'biological', 'ego'],
        ['marcus', 'biological', 'leo'],
        ['julian', 'biological', 'leo'],
        ['marcus', 'partner', 'julian'],
        ['eggdonor', 'donor', 'ego'],
        ['eggdonor', 'donor', 'leo'],
        ['becky', 'surrogate', 'ego', { carrier: true }],
        ['becky', 'surrogate', 'leo', { carrier: true }],
      ],
    },
  };

  for (const [name, { people, links, adopted }] of Object.entries(scenarios)) {
    for (const shape of ['circle', 'square'] as const) {
      it(`are drawn clear of everyone and every other line: ${name} (${shape}s)`, () => {
        const { connectors, centre } = draw(people, links, shape);
        expect(
          auxiliaryLineFaults(connectors, people, centre, adopted),
        ).toEqual([]);
      });

      it(`end on each child in their parents' order, apart and uncrossed: ${name} (${shape}s)`, () => {
        const { connectors, centre } = draw(people, links, shape);
        const drawing: Drawing = {
          size: DIMENSIONS.nodeWidth,
          connectors,
          centre,
          shapeOf: () => shape,
        };
        const children = new Set(
          connectors.auxiliaryLines.flatMap((line) =>
            line.endpointIds?.[1] ? [line.endpointIds[1]] : [],
          ),
        );
        expect(
          [...children].flatMap((child) =>
            faultsOfLinesInto(drawing, child).map(
              (fault) => `${child}: ${fault}`,
            ),
          ),
        ).toEqual([]);
      });
    }
  }

  it('end at a point on the child’s top edge, distinct for each line into them', () => {
    const { connectors, centre } = draw(
      ['ego', 'ann', 'dan', 'sue'],
      [
        ['ann', 'biological', 'ego', { carrier: false }],
        ['dan', 'donor', 'ego'],
        ['sue', 'surrogate', 'ego', { carrier: true }],
      ],
    );
    const ego = centre('ego');
    const ends = connectors.auxiliaryLines.map((line) => {
      const segments = auxiliarySegments(line);
      const last = segments[segments.length - 1]!;
      // The line meets the child's symbol from above, at its top, and runs
      // on under it, off the child's own line up.
      expect(last.x1).toBeCloseTo(last.x2, 5);
      expect(last.y1).toBeLessThanOrEqual(ego.y - DIMENSIONS.nodeHeight / 4);
      expect(Math.abs(last.x2 - ego.x)).toBeGreaterThan(5);
      expect(Math.abs(last.x2 - ego.x)).toBeLessThan(DIMENSIONS.nodeWidth / 2);
      return last.x2;
    });
    expect(ends).toHaveLength(2);
    expect(Math.abs(ends[0]! - ends[1]!)).toBeGreaterThan(5);
  });

  it('join a sibship’s bar away from every child’s line', () => {
    const { connectors } = draw(
      ['ego', 'leo', 'marcus', 'julian', 'eggdonor', 'becky'],
      [
        ['marcus', 'biological', 'ego'],
        ['julian', 'biological', 'ego'],
        ['marcus', 'biological', 'leo'],
        ['julian', 'biological', 'leo'],
        ['marcus', 'partner', 'julian'],
        ['eggdonor', 'donor', 'ego'],
        ['eggdonor', 'donor', 'leo'],
        ['becky', 'surrogate', 'ego', { carrier: true }],
        ['becky', 'surrogate', 'leo', { carrier: true }],
      ],
    );
    const sibship = uplineOf(connectors, 'ego').connector;
    const stems = [
      ...sibship.uplines.map((upline) => upline.x2),
      ...sibship.parentLink.map((segment) => segment.x2),
    ];
    const joins = connectors.auxiliaryLines.map((line) => {
      const segments = auxiliarySegments(line);
      const last = segments[segments.length - 1]!;
      expect(last.y2).toBeCloseTo(sibship.siblingBar!.y1, 5);
      for (const stem of stems) {
        expect(Math.abs(last.x2 - stem)).toBeGreaterThan(10);
      }
      return last.x2;
    });
    expect(joins).toHaveLength(2);
    expect(Math.abs(joins[0]! - joins[1]!)).toBeGreaterThan(10);
  });

  it('keep a step parent’s line off the sibship he is not a parent of', () => {
    const { connectors } = draw(
      ['ego', 'jill', 'phil', 'ken', 'amy', 'ben'],
      [
        ['jill', 'biological', 'ego', { carrier: true }],
        ['phil', 'biological', 'ego'],
        ['jill', 'partner', 'phil', { former: true }],
        ['ken', 'social', 'ego'],
        ['jill', 'partner', 'ken'],
        ['jill', 'biological', 'amy', { carrier: true }],
        ['phil', 'biological', 'amy'],
        ['jill', 'biological', 'ben', { carrier: true }],
        ['phil', 'biological', 'ben'],
      ],
    );
    const sibship = uplineOf(connectors, 'amy').connector;
    const kens = auxiliaryLinesFrom(connectors, 'ken').flatMap(
      auxiliarySegments,
    );
    expect(kens.length).toBeGreaterThan(0);
    for (const segment of kens) {
      expect(properlyCross(segment, sibship.siblingBar!)).toBe(false);
      for (const child of ['amy', 'ben']) {
        expect(
          properlyCross(segment, uplineOf(connectors, child).segment),
        ).toBe(false);
      }
    }
  });
});

/** The partnership line between two people. */
const lineBetween = (connectors: PedigreeConnectors, a: string, b: string) =>
  connectors.groupLines.find(
    (line) =>
      line.partnerIds?.includes(a) && line.partnerIds.includes(b) && a !== b,
  );

describe('co-parents with no recorded partnership', () => {
  /** The one line of descent into the child, and where it starts. */
  const descentInto = (connectors: PedigreeConnectors, childId: string) => {
    const lines = descentsInto(connectors, childId).filter(
      (line) => line.parentLink.length > 0,
    );
    expect(lines, `lines of descent into ${childId}`).toHaveLength(1);
    const [top] = lines[0]!.parentLink;
    return { line: lines[0]!, start: { x: top!.x1, y: top!.y1 } };
  };
  const expectFromMidway = (
    connectors: PedigreeConnectors,
    centre: (id: string) => { x: number; y: number },
    childId: string,
    [a, b]: [string, string],
  ) => {
    const { start } = descentInto(connectors, childId);
    expect(centre(a).y).toBeCloseTo(centre(b).y, 6);
    expect(start.x).toBeCloseTo((centre(a).x + centre(b).x) / 2, 6);
    expect(start.y).toBeCloseTo(centre(a).y, 6);
    // Their ties are drawn by that line alone.
    expect(auxiliaryLinesFrom(connectors, a)).toEqual([]);
    expect(auxiliaryLinesFrom(connectors, b)).toEqual([]);
    expect(
      connectors.groupLines.filter(
        (line) => line.partnerIds?.includes(a) && line.partnerIds.includes(b),
      ),
    ).toEqual([]);
  };

  it('are joined by no line when they sit side by side, and their children descend from midway between them', () => {
    const { connectors, centre } = draw(
      ['ego', 'ann', 'bob', 'sib'],
      [
        ['ann', 'biological', 'ego', { carrier: true }],
        ['bob', 'biological', 'ego'],
        ['ann', 'biological', 'sib', { carrier: true }],
        ['bob', 'biological', 'sib'],
      ],
    );
    expectFromMidway(connectors, centre, 'ego', ['ann', 'bob']);
    expect(descentInto(connectors, 'sib').line).toBe(
      descentInto(connectors, 'ego').line,
    );
  });

  it('a stand-in and a recorded parent, whose partner also raises the child, are joined by no line', () => {
    // The stand-in is never assumed to be the mother's partner (ruling 25).
    // Her partner raises the child and is joined by a line of his own.
    const { connectors, centre } = draw(
      ['ego', 'mum', 'standIn', 'stepdad'],
      [
        ['mum', 'biological', 'ego', { carrier: true }],
        ['standIn', 'biological', 'ego'],
        ['stepdad', 'social', 'ego'],
        ['mum', 'partner', 'stepdad'],
      ],
    );
    expectFromMidway(connectors, centre, 'ego', ['mum', 'standIn']);
    expect(lineBetween(connectors, 'mum', 'stepdad')).toBeDefined();
    const stepdads = auxiliaryLinesFrom(connectors, 'stepdad');
    expect(stepdads).toHaveLength(1);
    expect(stepdads[0]!.edgeType).toBe('social');
  });

  it('a stand-in and a recorded parent of a half-sibling are joined by no line', () => {
    const { connectors, centre } = draw(
      ['ego', 'mum', 'dad', 'half', 'standIn'],
      [
        ['mum', 'biological', 'ego', { carrier: true }],
        ['dad', 'biological', 'ego'],
        ['mum', 'partner', 'dad'],
        ['mum', 'biological', 'half', { carrier: true }],
        ['standIn', 'biological', 'half'],
      ],
    );
    expectFromMidway(connectors, centre, 'half', ['mum', 'standIn']);
    expect(lineBetween(connectors, 'mum', 'dad')).toBeDefined();
  });
});

describe('the former-partner break', () => {
  it('is not drawn between co-parents who were never recorded as partners', () => {
    const { connectors } = draw(
      ['ego', 'kevin', 'dana', 'jordan', 'erin'],
      [
        ['kevin', 'biological', 'ego'],
        ['dana', 'biological', 'ego', { carrier: true }],
        ['kevin', 'biological', 'jordan'],
        ['erin', 'biological', 'jordan', { carrier: true }],
      ],
    );
    for (const other of ['dana', 'erin']) {
      expect(
        lineBetween(connectors, 'kevin', other),
        `kevin and ${other}`,
      ).toBeUndefined();
    }
  });

  it('is drawn for a recorded former partnership', () => {
    const { connectors } = draw(
      ['ego', 'kevin', 'dana'],
      [
        ['kevin', 'biological', 'ego'],
        ['dana', 'biological', 'ego', { carrier: true }],
        ['kevin', 'partner', 'dana', { former: true }],
      ],
    );
    const line = lineBetween(connectors, 'kevin', 'dana');
    expect(line!.isActive).toBe(false);
    expect(line!.slashSide).toBeDefined();
  });

  it('is drawn for a recorded former partnership routed above the row', () => {
    const { connectors } = draw(
      ['ego', 'ann', 'bea', 'cat', 'dee'],
      [
        ['ego', 'partner', 'ann', { former: true }],
        ['ego', 'partner', 'bea', { former: true }],
        ['ego', 'partner', 'cat', { former: true }],
        ['ego', 'partner', 'dee'],
      ],
    );
    const routed = routedPartnerships(connectors);
    const former = routed.filter((line) => !line.isActive);
    const current = routed.filter((line) => line.isActive);
    expect(former.length + current.length).toBe(2);
    for (const line of former) expect(line.slashSide).toBeDefined();
    for (const line of current) {
      expect(line.partnerIds).toContain('dee');
      expect(line.slashSide).toBeUndefined();
    }
  });
});

describe('lines of descent', () => {
  it('are drawn with only upright and level pieces, none of them of no length', () => {
    // Jess, Robert's daughter, pushes the participant off the couple's
    // midpoint.
    const { connectors } = draw(
      ['ego', 'linda', 'robert', 'jess'],
      [
        ['linda', 'biological', 'ego', { carrier: true }],
        ['robert', 'biological', 'ego'],
        ['linda', 'partner', 'robert'],
        ['robert', 'biological', 'jess'],
      ],
    );
    for (const line of connectors.parentChildLines) {
      for (const segment of [
        ...line.parentLink,
        ...(line.siblingBar ? [line.siblingBar] : []),
        ...line.uplines,
      ]) {
        expect(length(segment)).toBeGreaterThan(0);
        const upright = Math.abs(segment.x1 - segment.x2) < 1e-6;
        const level = Math.abs(segment.y1 - segment.y2) < 1e-6;
        expect(upright || level, JSON.stringify(segment)).toBe(true);
      }
    }
  });

  it('come down onto a sibling bar away from a partner between the siblings', () => {
    // Mark, partnered with two sisters, sits between them.
    const { connectors, centre } = draw(
      ['ego', 'claire', 'mark', 'peter', 'margaret', 'julie'],
      [
        ['claire', 'biological', 'ego', { carrier: true }],
        ['mark', 'biological', 'ego'],
        ['claire', 'partner', 'mark', { former: true }],
        ['peter', 'partner', 'margaret'],
        ['peter', 'biological', 'claire'],
        ['margaret', 'biological', 'claire', { carrier: true }],
        ['peter', 'biological', 'julie'],
        ['margaret', 'biological', 'julie', { carrier: true }],
        ['mark', 'partner', 'julie'],
      ],
    );
    const mark = centre('mark');
    const sisters = uplineOf(connectors, 'claire').connector;
    expect(sisters.uplineChildIds).toContain('julie');
    const foot = sisters.parentLink[sisters.parentLink.length - 1]!;
    expect(Math.abs(foot.x2 - mark.x)).toBeGreaterThan(
      DIMENSIONS.nodeWidth / 4,
    );
  });
});

// Rule (Codex 4229159689): every recorded parent tie is drawn. The places a
// line may end on a child are never used up, however many ties they have.
describe('a child with many parent ties beside their birth parents', () => {
  const ties = [
    'adopt1',
    'adopt2',
    'adopt3',
    'adopt4',
    'social1',
    'social2',
    'social3',
    'surrogate',
  ];
  const kindOf = (id: string) =>
    id.startsWith('adopt')
      ? ('adoptive' as const)
      : id.startsWith('social')
        ? ('social' as const)
        : ('surrogate' as const);

  it('draws a line for every tie, each ending on the child at a place of its own', () => {
    const { connectors, centre } = draw(
      ['ego', 'mum', 'dad', ...ties],
      [
        ['mum', 'partner', 'dad'],
        ['mum', 'biological', 'ego'],
        ['dad', 'biological', 'ego'],
        ...ties.map((id): Link => [
          id,
          kindOf(id),
          'ego',
          { carrier: id === 'surrogate' },
        ]),
      ],
    );
    const ego = centre('ego');
    // The couple the child is drawn under joins them by their line of
    // descent; every other tie by a line of its own.
    const descent = descentsInto(connectors, 'ego').flatMap(
      (line) => line.parentIds ?? [],
    );
    const auxiliary = ['mum', 'dad', ...ties].filter(
      (id) => !descent.includes(id),
    );
    // More lines end on the child than its usual places for them.
    expect(auxiliary.length).toBeGreaterThan(6);
    const ends = auxiliary.map((id) => {
      const lines = auxiliaryLinesFrom(connectors, id);
      expect(lines, `a line from ${id}`).toHaveLength(1);
      const segments = auxiliarySegments(lines[0]!);
      expect(segments.length, `${id}'s line has length`).toBeGreaterThan(0);
      const last = segments[segments.length - 1]!;
      // It reaches the child's symbol.
      expect(Math.abs(last.x2 - ego.x)).toBeLessThan(DIMENSIONS.nodeWidth / 2);
      expect(Math.abs(last.y2 - ego.y)).toBeLessThan(DIMENSIONS.nodeHeight / 2);
      return last.x2;
    });
    const sorted = ends.toSorted((a, b) => a - b);
    for (let k = 0; k + 1 < sorted.length; k++) {
      expect(sorted[k + 1]! - sorted[k]!).toBeGreaterThan(0.5);
    }
  });
});

/** The connectors with a line of descent (a non-empty parent link). */
const withDescent = (lines: ParentChildConnector[]) =>
  lines.filter((line) => line.parentLink.length > 0);

/**
 * The sibship the children are drawn in: every connector reaching any of
 * them. The children share one sibling bar when those connectors' bars join
 * into one run along one height, and one line of descent when only one of the
 * connectors has a parent link.
 */
function sibshipOf(connectors: PedigreeConnectors, childIds: string[]) {
  const lines = connectors.parentChildLines.filter((line) =>
    childIds.some((id) => line.uplineChildIds?.includes(id)),
  );
  const bars = lines
    .flatMap((line) => (line.siblingBar ? [line.siblingBar] : []))
    .map((bar) => ({
      y: bar.y1,
      from: Math.min(bar.x1, bar.x2),
      to: Math.max(bar.x1, bar.x2),
    }))
    .toSorted((a, b) => a.from - b.from);
  let joined = bars.length > 0;
  for (let k = 1; k < bars.length; k++) {
    if (Math.abs(bars[k]!.y - bars[0]!.y) > 1e-6) joined = false;
    if (bars[k]!.from > bars[k - 1]!.to + 1e-6) joined = false;
  }
  const reached = new Set(lines.flatMap((line) => line.uplineChildIds ?? []));
  const covers = childIds.every((id) => {
    if (!reached.has(id)) return false;
    const { segment } = uplineOf(connectors, id);
    return bars.some(
      (bar) => segment.x2 >= bar.from - 1e-6 && segment.x2 <= bar.to + 1e-6,
    );
  });
  return {
    sharesOneBar: joined && covers,
    descents: withDescent(lines),
  };
}

/** Pairs of lines of descent, of different families, running along one another. */
function overlappingDescents(connectors: PedigreeConnectors) {
  const descents = withDescent(connectors.parentChildLines);
  const found: string[] = [];
  for (let a = 0; a < descents.length; a++) {
    for (let b = a + 1; b < descents.length; b++) {
      for (const sa of descents[a]!.parentLink) {
        for (const sb of descents[b]!.parentLink) {
          if (collinearOverlap(sa, sb) > 1) {
            found.push(
              `${descents[a]!.uplineChildIds?.join('+')} / ${descents[b]!.uplineChildIds?.join('+')}`,
            );
          }
        }
      }
    }
  }
  return found;
}

describe('each child hangs from their own family’s single line of descent', () => {
  // A child's birth parents who were never recorded as partners (here, a
  // birth mother and the unnamed stand-in for the father) are joined by no
  // line, and the child descends from midway between them, so a half-sibling
  // whose parents are the mother and her partner hangs from that couple's
  // own line of descent, not from one shared sibling bar (Josh's round 2
  // ruling; B2 asked for one bar). The partner who also raises the child is
  // joined to them by a dashed line of their own.
  const descentStart = (connectors: PedigreeConnectors, childId: string) => {
    const lines = descentsInto(connectors, childId).filter(
      (line) => line.parentLink.length > 0,
    );
    expect(lines, `lines of descent into ${childId}`).toHaveLength(1);
    return {
      line: lines[0]!,
      x: lines[0]!.parentLink[0]!.x1,
      y: lines[0]!.parentLink[0]!.y1,
    };
  };
  const expectDescentBetween = (
    connectors: PedigreeConnectors,
    centre: (id: string) => { x: number; y: number },
    childIds: string[],
    [a, b]: [string, string],
  ) => {
    for (const childId of childIds) {
      const start = descentStart(connectors, childId);
      expect(start.x).toBeCloseTo((centre(a).x + centre(b).x) / 2, 6);
      expect(start.y).toBeCloseTo(centre(a).y, 6);
      expect(start.line.uplineChildIds?.toSorted()).toEqual(
        childIds.toSorted(),
      );
    }
  };

  it('hangs a birth child from their birth parents and a stepchild’s half-sibling from the couple (confirm-r1-4)', () => {
    // Karen is ego's birth mother; Steve, her partner, raises ego. Emily is
    // Karen and Steve's own child. Ego's stand-in father is unnamed.
    const { connectors, centre } = draw(
      ['ego', 'karen', 'steve', 'emily', 'egoFather'],
      [
        ['karen', 'biological', 'ego', { carrier: true }],
        ['egoFather', 'biological', 'ego'],
        ['steve', 'social', 'ego'],
        ['karen', 'partner', 'steve'],
        ['karen', 'biological', 'emily', { carrier: true }],
        ['steve', 'biological', 'emily'],
      ],
    );
    expectDescentBetween(connectors, centre, ['ego'], ['karen', 'egoFather']);
    expectDescentBetween(connectors, centre, ['emily'], ['karen', 'steve']);
    expect(lineBetween(connectors, 'karen', 'egoFather')).toBeUndefined();
    // Steve's tie to ego is still drawn, dashed, on a line of its own.
    expect(
      auxiliaryLinesFrom(connectors, 'steve').map((line) => [
        line.edgeType,
        line.endpointIds?.[1],
      ]),
    ).toEqual([['social', 'ego']]);
    expect(uplineOf(connectors, 'ego').connector.edgeType).toBe('biological');
    expect(overlappingDescents(connectors)).toEqual([]);
  });

  it('hangs two co-mothers’ birth children each from their own birth parents (confirm-r1-4, co-mothers)', () => {
    const { connectors, centre } = draw(
      ['ego', 'hannah', 'kate', 'max', 'egoFather', 'maxFather'],
      [
        ['hannah', 'biological', 'ego', { carrier: true }],
        ['egoFather', 'biological', 'ego'],
        ['kate', 'social', 'ego'],
        ['hannah', 'partner', 'kate'],
        ['kate', 'biological', 'max', { carrier: true }],
        ['maxFather', 'biological', 'max'],
        ['hannah', 'social', 'max'],
      ],
    );
    expectDescentBetween(connectors, centre, ['ego'], ['hannah', 'egoFather']);
    expectDescentBetween(connectors, centre, ['max'], ['kate', 'maxFather']);
    expect(overlappingDescents(connectors)).toEqual([]);
    const social = (from: string) =>
      auxiliaryLinesFrom(connectors, from)
        .filter((line) => line.edgeType === 'social')
        .map((line) => line.endpointIds?.[1]);
    expect(social('kate')).toEqual(['ego']);
    expect(social('hannah')).toEqual(['max']);
  });

  it('hangs the participant from their birth parents once a parent becomes social, beside their half-siblings (confirm-r1-112)', () => {
    const { connectors, centre } = draw(
      ['ego', 'beth', 'carl', 'dana', 'evan', 'egoFather'],
      [
        ['beth', 'biological', 'ego', { carrier: true }],
        ['carl', 'social', 'ego'],
        ['egoFather', 'biological', 'ego'],
        ['beth', 'partner', 'carl'],
        ['beth', 'biological', 'dana', { carrier: true }],
        ['carl', 'biological', 'dana'],
        ['beth', 'biological', 'evan', { carrier: true }],
        ['carl', 'biological', 'evan'],
      ],
    );
    expectDescentBetween(connectors, centre, ['ego'], ['beth', 'egoFather']);
    expectDescentBetween(
      connectors,
      centre,
      ['dana', 'evan'],
      ['beth', 'carl'],
    );
    expect(sibshipOf(connectors, ['dana', 'evan']).sharesOneBar).toBe(true);
    expect(overlappingDescents(connectors)).toEqual([]);
  });

  it('keeps each child under their own couple when both are raised by the other couple too (confirm-r1-15)', () => {
    const { connectors, centre } = draw(
      ['ego', 'jess', 'sam', 'alex', 'robin'],
      [
        ['jess', 'biological', 'ego', { carrier: true }],
        ['sam', 'biological', 'ego'],
        ['jess', 'partner', 'sam'],
        ['alex', 'social', 'ego'],
        ['jess', 'partner', 'alex'],
        ['jess', 'biological', 'robin', { carrier: true }],
        ['alex', 'biological', 'robin'],
        ['sam', 'partner', 'alex'],
        ['sam', 'social', 'robin'],
      ],
    );
    const mid = (a: string, b: string) => (centre(a).x + centre(b).x) / 2;
    const egoCouple = mid('jess', 'sam');
    const robinCouple = mid('jess', 'alex');
    expect(Math.abs(centre('ego').x - egoCouple)).toBeLessThan(
      Math.abs(centre('ego').x - robinCouple),
    );
    expect(Math.abs(centre('robin').x - robinCouple)).toBeLessThan(
      Math.abs(centre('robin').x - egoCouple),
    );
    expect(overlappingDescents(connectors)).toEqual([]);
  });

  it('hangs a child of a couple that cannot sit together from their partnership line (confirm-r1-11)', () => {
    const { connectors, centre } = draw(
      ['ego', 'mark', 'dan', 'paul', 'ethan', 'noah', 'leo'],
      [
        ['ego', 'partner', 'mark', { former: true }],
        ['ego', 'partner', 'dan', { former: true }],
        ['ego', 'partner', 'paul'],
        ['ego', 'biological', 'ethan', { carrier: true }],
        ['mark', 'biological', 'ethan'],
        ['ego', 'biological', 'noah', { carrier: true }],
        ['dan', 'biological', 'noah'],
        ['ego', 'biological', 'leo', { carrier: true }],
        ['paul', 'biological', 'leo'],
      ],
    );
    for (const child of ['ethan', 'noah', 'leo']) {
      // No parent is joined to the child by a line of their own.
      for (const parent of ['ego', 'mark', 'dan', 'paul']) {
        expect(
          auxiliaryLinesFrom(connectors, parent).filter(
            (line) => line.endpointIds?.[1] === child,
          ),
          `${parent} → ${child}`,
        ).toEqual([]);
      }
      expect(withDescent(descentsInto(connectors, child))).toHaveLength(1);
    }
    // Ethan's line of descent starts on the routed partnership line of his
    // parents and passes clear of everyone on their row.
    const routed = routedPartnerships(connectors).find(
      (line) =>
        line.partnerIds?.includes('mark') && line.partnerIds.includes('ego'),
    )!;
    expect(routed).toBeDefined();
    const [top] = withDescent(descentsInto(connectors, 'ethan'))[0]!.parentLink;
    expect(top!.y1).toBeCloseTo(routed.segment.y1, 6);
    expect(top!.x1).toBeGreaterThanOrEqual(routed.segment.x1 - 1e-6);
    expect(top!.x1).toBeLessThanOrEqual(routed.segment.x2 + 1e-6);
    for (const person of ['ego', 'mark', 'dan', 'paul']) {
      expect(Math.abs(top!.x1 - centre(person).x)).toBeGreaterThanOrEqual(
        DIMENSIONS.nodeWidth / 2,
      );
    }
    expect(overlappingDescents(connectors)).toEqual([]);
  });

  it('drops straight onto the sibling bar when the couple’s midpoint lies on it (confirm-r1-20)', () => {
    const { connectors, centre } = draw(
      ['ego', 'gary', 'linda', 'chris', 'priya', 'priyaMum', 'priyaDad'],
      [
        ['gary', 'biological', 'ego'],
        ['linda', 'biological', 'ego', { carrier: true }],
        ['gary', 'partner', 'linda'],
        ['gary', 'biological', 'chris'],
        ['linda', 'biological', 'chris', { carrier: true }],
        ['chris', 'partner', 'priya'],
        ['priyaMum', 'biological', 'priya', { carrier: true }],
        ['priyaDad', 'biological', 'priya'],
      ],
    );
    const midpoint = (centre('gary').x + centre('linda').x) / 2;
    const { siblingBar, parentLink } = uplineOf(connectors, 'ego').connector;
    const [from, to] = [
      Math.min(siblingBar!.x1, siblingBar!.x2),
      Math.max(siblingBar!.x1, siblingBar!.x2),
    ];
    // The fixture puts the midpoint on the bar, off its centre.
    expect(midpoint).toBeGreaterThan(from);
    expect(midpoint).toBeLessThan(to);
    expect(parentLink).toHaveLength(1);
    expect(parentLink[0]!.x1).toBeCloseTo(midpoint, 6);
    expect(parentLink[0]!.x2).toBeCloseTo(midpoint, 6);
  });

  it('starts a double-bar couple’s line of descent on the lower rail (confirm-r1-65)', () => {
    const { connectors } = draw(
      ['ego', 'mary', 'frank', 'gran', 'maryDad', 'frankDad'],
      [
        ['mary', 'biological', 'ego', { carrier: true }],
        ['frank', 'biological', 'ego'],
        ['mary', 'partner', 'frank'],
        ['gran', 'biological', 'mary', { carrier: true }],
        ['maryDad', 'biological', 'mary'],
        ['gran', 'biological', 'frank', { carrier: true }],
        ['frankDad', 'biological', 'frank'],
      ],
    );
    const couple = connectors.groupLines.find(
      (line) =>
        line.partnerIds?.includes('mary') && line.partnerIds.includes('frank'),
    )!;
    expect(couple.double).toBe(true);
    const lowerRail = couple.doubleSegment!.y1;
    const top = uplineOf(connectors, 'ego').connector.parentLink[0]!;
    expect(Math.min(top.y1, top.y2)).toBeCloseTo(lowerRail, 6);
  });
});
