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
} from '../types';

const DIMENSIONS: LayoutDimensions = {
  nodeWidth: 108,
  nodeHeight: 108,
  rowGapRatio: 1.4,
  columnGapRatio: 1.4,
};

type Link =
  | [string, 'partner', string, { former?: boolean }?]
  | [
      string,
      Exclude<PedigreeEdgeType, 'partner'>,
      string,
      { carrier?: boolean }?,
    ];

function draw(people: string[], spec: Link[]) {
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
        if (collinearOverlap(segment, other.segment) > 1) {
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
    it(`are drawn clear of everyone and every other line: ${name}`, () => {
      const { connectors, centre } = draw(people, links);
      expect(auxiliaryLineFaults(connectors, people, centre, adopted)).toEqual(
        [],
      );
    });
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

describe('the former-partner break', () => {
  /** The partnership line between two people. */
  const lineBetween = (connectors: PedigreeConnectors, a: string, b: string) =>
    connectors.groupLines.find(
      (line) =>
        line.partnerIds?.includes(a) && line.partnerIds.includes(b) && a !== b,
    );

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
      const line = lineBetween(connectors, 'kevin', other);
      expect(line, `kevin and ${other}`).toBeDefined();
      expect(line!.isActive).toBe(true);
      expect(line!.slashSide).toBeUndefined();
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
