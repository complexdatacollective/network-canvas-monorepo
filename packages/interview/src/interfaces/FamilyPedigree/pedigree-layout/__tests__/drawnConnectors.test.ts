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
      line.siblingBar,
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

function auxiliarySegments(line: PedigreeConnectors['auxiliaryLines'][number]) {
  return [line.segment];
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
