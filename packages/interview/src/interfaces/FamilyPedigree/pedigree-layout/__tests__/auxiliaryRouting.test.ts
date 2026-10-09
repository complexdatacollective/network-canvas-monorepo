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
import type { PedigreeLink } from '../types';

const DIMENSIONS: LayoutDimensions = {
  nodeWidth: 108,
  nodeHeight: 108,
  rowGapRatio: 1.4,
  columnGapRatio: 1.4,
};

function draw(people: string[], links: PedigreeLink[]) {
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
