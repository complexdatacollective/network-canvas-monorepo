/**
 * The connectors as the renderer draws them, for whole families laid out as
 * the interface lays them out.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { PedigreeEdgeSvg } from '../components/EdgeRenderer';
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

type Point = { x: number; y: number };

/** Every drawn stroke, as its points. */
function strokes(container: HTMLElement): Point[][] {
  const lines = Array.from(container.querySelectorAll('line')).map((line) => [
    { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) },
    { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) },
  ]);
  const polylines = Array.from(container.querySelectorAll('polyline')).map(
    (polyline) =>
      (polyline.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x: x!, y: y! };
        }),
  );
  return [...lines, ...polylines];
}

const covers = (stroke: Point[], p: Point) =>
  stroke.slice(1).some((to, k) => {
    const from = stroke[k]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;
    const t = ((p.x - from.x) * dx + (p.y - from.y) * dy) / len2;
    if (t < 0 || t > 1) return false;
    return Math.hypot(p.x - from.x - t * dx, p.y - from.y - t * dy) < 0.5;
  });

describe('the drawn lines of descent', () => {
  it('draw a straight descent from a couple to their only child as one stroke, with no piece of no length', () => {
    const links: PedigreeLink[] = [
      { source: 'mum', target: 'ego', kind: 'biological' },
      { source: 'dad', target: 'ego', kind: 'biological' },
      { source: 'mum', target: 'dad', kind: 'partner', isActive: true },
    ];
    const people = ['ego', 'mum', 'dad'];
    const { input, indexToId, idToIndex } = toPedigreeInput(people, links);
    const layout = alignPedigree(input);
    const data = buildConnectorData(
      layout,
      links,
      DIMENSIONS,
      input.parents,
      idToIndex,
      people,
      indexToId,
    );
    const ego = pedigreeLayoutToPositions(layout, indexToId, DIMENSIONS).get(
      'ego',
    )!;
    const egoX = ego.x + DIMENSIONS.nodeWidth / 2;
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={data}
        color="black"
        width={1000}
        height={1000}
      />,
    );
    const all = strokes(container);
    for (const stroke of all) {
      for (let k = 1; k < stroke.length; k++) {
        expect(
          Math.hypot(
            stroke[k]!.x - stroke[k - 1]!.x,
            stroke[k]!.y - stroke[k - 1]!.y,
          ),
        ).toBeGreaterThan(0);
      }
    }
    // Just below the couple's line, and just above the participant.
    const top = { x: egoX, y: DIMENSIONS.nodeHeight / 2 + 20 };
    const bottom = { x: egoX, y: ego.y - 5 };
    const through = all.filter(
      (stroke) => covers(stroke, top) || covers(stroke, bottom),
    );
    expect(through).toHaveLength(1);
    expect(covers(through[0]!, top) && covers(through[0]!, bottom)).toBe(true);
  });
});
