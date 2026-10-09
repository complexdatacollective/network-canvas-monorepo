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
