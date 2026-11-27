import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { testTypeId } from '../../__tests__/testIds';

const FOLLOWS = testTypeId('follows');
const KNOWS = testTypeId('knows');
const PERSON = testTypeId('person');
const PLACE = testTypeId('place');

// One object for every render, or the layer would rebuild its lines each time.
const codebook = {
  edge: {
    [FOLLOWS]: { color: 'edge-color-seq-2', directed: true },
    [KNOWS]: { color: 'edge-color-seq-1' },
  },
  node: {
    [PERSON]: { name: 'Person', shape: { default: 'circle' } },
    [PLACE]: { name: 'Place', shape: { default: 'square' } },
  },
};
vi.mock('react-redux', () => ({
  useSelector: () => codebook,
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

const node = (id: string, type: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type,
});

// Two nodes 20 px in half width, `distance` px apart along a line at `angle`
// degrees, on a measured 400 px canvas.
function storeWithNodesApart(distance: number, angle = 0) {
  const store = createCanvasStore();
  store.getState().setCanvasDimensions({ width: 400, height: 400 });
  store.getState().setNodeRadius(20);
  const radians = (angle * Math.PI) / 180;
  const half = distance / 2 / 400;
  store.getState().setBatchPositions([
    [
      'a',
      { x: 0.5 - half * Math.cos(radians), y: 0.5 - half * Math.sin(radians) },
    ],
    [
      'b',
      { x: 0.5 + half * Math.cos(radians), y: 0.5 + half * Math.sin(radians) },
    ],
  ]);
  return store;
}

const pointsOf = (arrow: Element | undefined) =>
  (arrow?.getAttribute('points') ?? '')
    .split(' ')
    .map((point) => point.split(',').map(Number));

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

  it('hands every id on a reciprocal line to onEdgeSelect', () => {
    const onEdgeSelect = vi.fn();
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')]}
        store={measuredStore()}
        onEdgeSelect={onEdgeSelect}
      />,
    );

    const [visual] = lines(container);
    fireEvent.click(visual!);
    expect(onEdgeSelect).toHaveBeenCalledWith(['a-b', 'b-a']);
  });

  it('draws two nodes too close for an arrowhead centre to centre with none', () => {
    // 50 px apart: 10 px between the two circles, too little for a head.
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')]}
        store={storeWithNodesApart(50)}
      />,
    );

    expect(
      arrowheads(container).map((arrow) => arrow.getAttribute('visibility')),
    ).toEqual(['hidden', 'hidden']);
    const [line] = lines(container);
    expect(coordinate(line!, 'x1')).toBeCloseTo(0.4375);
    expect(coordinate(line!, 'x2')).toBeCloseTo(0.5625);
  });

  it('keeps one arrowhead where there is room for one but not two', () => {
    // 64 px apart: 24 px between the circles holds one 16 px head.
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b')]}
        store={storeWithNodesApart(64)}
      />,
    );

    const [arrow] = arrowheads(container);
    expect(arrow?.getAttribute('visibility')).toBe('visible');
    const [tip, left] = pointsOf(arrow);
    // The tip touches b's circle, and the head keeps its full length.
    expect(tip?.[0]).toBeCloseTo(0.5 + 12 / 400);
    expect(((tip?.[0] ?? 0) - (left?.[0] ?? 0)) * 400).toBeCloseTo(16);
  });

  it('shrinks the arrowheads of a short reciprocal line to fit the gap', () => {
    // 64 px apart: 24 px between the circles, 12 px for each head.
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b'), edge(FOLLOWS, 'b', 'a')]}
        store={storeWithNodesApart(64)}
      />,
    );

    const heads = arrowheads(container);
    expect(heads.map((arrow) => arrow.getAttribute('visibility'))).toEqual([
      'visible',
      'visible',
    ]);
    for (const arrow of heads) {
      const [tip, left] = pointsOf(arrow);
      expect(Math.abs((tip?.[0] ?? 0) - (left?.[0] ?? 0)) * 400).toBeCloseTo(
        12,
      );
    }
  });

  it("ends an arrowhead at a square node's edge on a diagonal approach", () => {
    // The square's corner reaches further than its half width on a diagonal.
    const { container } = render(
      <EdgeLayer
        edges={[edge(FOLLOWS, 'a', 'b')]}
        nodes={[node('a', PERSON), node('b', PLACE)]}
        store={storeWithNodesApart(300, 45)}
      />,
    );

    const [tip] = pointsOf(arrowheads(container)[0]);
    const b = 0.5 + 150 / 400 / Math.SQRT2;
    const reach = Math.hypot(b - (tip?.[0] ?? 0), b - (tip?.[1] ?? 0)) * 400;
    // A 20 px square with 10 px corners reaches 24.14 px along the diagonal.
    expect(reach).toBeCloseTo(10 * Math.SQRT2 + 10, 1);
    // Outside the square's box on at least one axis, not under the node.
    expect(
      Math.max(b - (tip?.[0] ?? 0), b - (tip?.[1] ?? 0)) * 400,
    ).toBeGreaterThan(17);
  });
});
