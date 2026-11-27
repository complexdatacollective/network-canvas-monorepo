import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { testTypeId } from '../../__tests__/testIds';

const FOLLOWS = testTypeId('follows');
const KNOWS = testTypeId('knows');

// One object for every render, or the layer would rebuild its lines each time.
const edgeCodebook = {
  [FOLLOWS]: { color: 'edge-color-seq-2', directed: true },
  [KNOWS]: { color: 'edge-color-seq-1' },
};
vi.mock('react-redux', () => ({
  useSelector: () => edgeCodebook,
}));

import EdgeLayer from '../EdgeLayer';
import { createCanvasStore } from '../useCanvasStore';

const edge = (type: string, from: string, to: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}`,
  [entityAttributesProperty]: {},
  type,
  from,
  to,
});

// Two nodes 300 px apart across a measured canvas.
function measuredStore() {
  const store = createCanvasStore();
  store.getState().setCanvasDimensions({ width: 400, height: 400 });
  store.getState().setNodeRadius(20);
  store.getState().setBatchPositions([
    ['a', { x: 0.125, y: 0.5 }],
    ['b', { x: 0.875, y: 0.5 }],
  ]);
  return store;
}

const lines = (container: HTMLElement) => [
  ...container.querySelectorAll('line'),
];
const arrowheads = (container: HTMLElement) => [
  ...container.querySelectorAll('polygon[data-edge-arrowhead]'),
];
const coordinate = (element: Element, name: string) =>
  Number(element.getAttribute(name));

describe('EdgeLayer', () => {
  it('draws one line with two arrowheads for a reciprocal pair', () => {
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')]}
        store={measuredStore()}
      />,
    );

    const [line, ...others] = lines(container);
    expect(others).toEqual([]);
    expect(line?.getAttribute('data-edge-ids')).toBe('a-b b-a');
    expect(
      arrowheads(container).map((arrow) =>
        arrow.getAttribute('data-edge-arrowhead'),
      ),
    ).toEqual(['b', 'a']);
    // Both ends stop short of the node centres, inside the arrowheads.
    expect(coordinate(line!, 'x1')).toBeGreaterThan(0.125);
    expect(coordinate(line!, 'x2')).toBeLessThan(0.875);
  });

  it('removing one direction leaves one arrowhead', () => {
    const store = measuredStore();
    const { container, rerender } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')]}
        store={store}
      />,
    );
    rerender(<EdgeLayer edges={[edge(FOLLOWS, 'b', 'a')]} store={store} />);

    const [line, ...others] = lines(container);
    expect(others).toEqual([]);
    expect(line?.getAttribute('data-edge-id')).toBe('b-a');
    expect(line?.hasAttribute('data-edge-ids')).toBe(false);
    const [arrow, ...otherArrows] = arrowheads(container);
    expect(otherArrows).toEqual([]);
    expect(arrow?.getAttribute('data-edge-arrowhead')).toBe('a');
    // The tip touches node a's edge, 20 px (0.05) from its centre.
    const [tip] = (arrow?.getAttribute('points') ?? '').split(' ');
    expect(tip?.split(',').map(Number)).toEqual([0.175, 0.5]);
    // The line runs from b's centre to inside the arrowhead.
    expect(coordinate(line!, 'x1')).toBe(0.875);
    expect(coordinate(line!, 'x2')).toBeGreaterThan(0.175);
  });

  it('undirected lines still end at node centres', () => {
    const { container } = render(
      <EdgeLayer
        edges={[edge(KNOWS, 'a', 'b'), edge(KNOWS, 'b', 'a')]}
        store={measuredStore()}
      />,
    );

    expect(arrowheads(container)).toEqual([]);
    expect(
      lines(container).map((line) =>
        ['x1', 'y1', 'x2', 'y2'].map((name) => coordinate(line, name)),
      ),
    ).toEqual([
      [0.125, 0.5, 0.875, 0.5],
      [0.875, 0.5, 0.125, 0.5],
    ]);
  });
});
