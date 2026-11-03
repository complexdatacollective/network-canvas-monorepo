import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

// The edge layer reads edge colours from the codebook; none are needed here.
// One object for every render, or the layer would rebuild its lines each time.
const edgeCodebook = {};
vi.mock('react-redux', () => ({
  useSelector: () => edgeCodebook,
}));

import ConvexHullLayer from '../ConvexHullLayer';
import EdgeLayer from '../EdgeLayer';
import { createCanvasStore } from '../useCanvasStore';

// Frames run only when a test flushes them, so a test can count the frames a
// layer asks for.
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushFrames() {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(performance.now());
}

function makeNode(id: string, group: string): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    [entityAttributesProperty]: { group },
    type: 'person',
    promptIDs: [],
    stageId: '',
  };
}

const EDGE: NcEdge = {
  [entityPrimaryKeyProperty]: 'a-b',
  [entityAttributesProperty]: {},
  type: 'friend',
  from: 'a',
  to: 'b',
};

function storeWithTwoNodes() {
  const store = createCanvasStore();
  store.getState().setBatchPositions([
    ['a', { x: 0.2, y: 0.3 }],
    ['b', { x: 0.6, y: 0.7 }],
  ]);
  return store;
}

describe.each([
  {
    layer: 'EdgeLayer',
    renderLayer: (store: ReturnType<typeof createCanvasStore>) =>
      render(<EdgeLayer edges={[EDGE]} store={store} />),
    // The edge's start follows node a.
    drawnStart: (container: HTMLElement) => {
      const line = container.querySelector('line[data-edge-id="a-b"]');
      return `${line?.getAttribute('x1')},${line?.getAttribute('y1')}`;
    },
  },
  {
    layer: 'ConvexHullLayer',
    renderLayer: (store: ReturnType<typeof createCanvasStore>) =>
      render(
        <ConvexHullLayer
          store={store}
          nodes={[makeNode('a', 'g'), makeNode('b', 'g')]}
          groupVariable="group"
          categoricalOptions={[{ value: 'g' }]}
        />,
      ),
    // A two-node hull is drawn through both centres, node a's first.
    drawnStart: (container: HTMLElement) =>
      container.querySelector('polygon')?.getAttribute('points')?.split(' ')[0],
  },
])('$layer', ({ renderLayer, drawnStart }) => {
  it('draws at mount and asks for no frames while nothing moves', () => {
    const { container } = renderLayer(storeWithTwoNodes());

    expect(drawnStart(container)).toBe('0.2,0.3');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('redraws once in the next frame however often a node moves', () => {
    const store = storeWithTwoNodes();
    const { container } = renderLayer(store);

    act(() => {
      store.getState().setPosition('a', { x: 0.5, y: 0.5 });
      store.getState().setPosition('a', { x: 0.4, y: 0.1 });
    });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    flushFrames();
    expect(drawnStart(container)).toBe('0.4,0.1');

    // Settled again: nothing more is asked for.
    expect(frames).toHaveLength(0);
  });

  it('stops following the store when it unmounts', () => {
    const store = storeWithTwoNodes();
    const { unmount } = renderLayer(store);
    unmount();

    store.getState().setPosition('a', { x: 0.5, y: 0.5 });

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
