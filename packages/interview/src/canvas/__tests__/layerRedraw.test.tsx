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
import { type CanvasStoreApi, createCanvasStore } from '../useCanvasStore';

// Frames run only when a test flushes them, so a test can count the frames a
// layer asks for. A cancelled frame never runs, as in a browser.
let frames = new Map<number, FrameRequestCallback>();
let lastFrameId = 0;

beforeEach(() => {
  frames = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    lastFrameId += 1;
    frames.set(lastFrameId, callback);
    return lastFrameId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
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

// Each layer element is built with new prop arrays, so re-rendering with a
// fresh one rebuilds the layer's drawing.
describe.each([
  {
    layer: 'EdgeLayer',
    layerElement: (store: CanvasStoreApi) => (
      <EdgeLayer edges={[EDGE]} store={store} />
    ),
    // The edge's start follows node a.
    drawnStart: (container: HTMLElement) => {
      const line = container.querySelector('line[data-edge-id="a-b"]');
      return `${line?.getAttribute('x1')},${line?.getAttribute('y1')}`;
    },
    drawn: (container: HTMLElement) => [...container.querySelectorAll('line')],
  },
  {
    layer: 'ConvexHullLayer',
    layerElement: (store: CanvasStoreApi) => (
      <ConvexHullLayer
        store={store}
        nodes={[makeNode('a', 'g'), makeNode('b', 'g')]}
        groupVariable="group"
        categoricalOptions={[{ value: 'g' }]}
      />
    ),
    // A two-node hull is drawn through both centres, node a's first.
    drawnStart: (container: HTMLElement) =>
      container.querySelector('polygon')?.getAttribute('points')?.split(' ')[0],
    drawn: (container: HTMLElement) => [
      ...container.querySelectorAll('polygon'),
    ],
  },
])('$layer', ({ layerElement, drawnStart, drawn }) => {
  it('hides what has nobody placed, and leaves what it draws to inherit visibility', () => {
    const store = createCanvasStore();
    const { container } = render(layerElement(store));
    expect(drawn(container).length).toBeGreaterThan(0);
    for (const element of drawn(container)) {
      expect(element.getAttribute('visibility')).toBe('hidden');
    }

    act(() =>
      store.getState().setBatchPositions([
        ['a', { x: 0.2, y: 0.3 }],
        ['b', { x: 0.6, y: 0.7 }],
      ]),
    );
    flushFrames();

    // Forcing it visible would show it on a canvas that hides its contents
    // while its first layout is computed.
    for (const element of drawn(container)) {
      expect(element.hasAttribute('visibility')).toBe(false);
    }
  });

  it('draws at mount and asks for no frames while nothing moves', () => {
    const { container } = render(layerElement(storeWithTwoNodes()));

    expect(drawnStart(container)).toBe('0.2,0.3');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('redraws once in the next frame however often a node moves', () => {
    const store = storeWithTwoNodes();
    const { container } = render(layerElement(store));

    act(() => {
      store.getState().setPosition('a', { x: 0.5, y: 0.5 });
      store.getState().setPosition('a', { x: 0.4, y: 0.1 });
    });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    flushFrames();
    expect(drawnStart(container)).toBe('0.4,0.1');

    // Settled again: nothing more is asked for.
    expect(frames.size).toBe(0);
  });

  it('redraws again when a node moves after a frame has run', () => {
    const store = storeWithTwoNodes();
    const { container } = render(layerElement(store));

    act(() => store.getState().setPosition('a', { x: 0.5, y: 0.5 }));
    flushFrames();
    act(() => store.getState().setPosition('a', { x: 0.4, y: 0.1 }));

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    flushFrames();
    expect(drawnStart(container)).toBe('0.4,0.1');
  });

  it('keeps redrawing after it rebuilds while a frame is pending', () => {
    const store = storeWithTwoNodes();
    const { container, rerender } = render(layerElement(store));

    act(() => store.getState().setPosition('a', { x: 0.5, y: 0.5 }));
    // The rebuild cancels the pending frame and draws straight away.
    rerender(layerElement(store));
    expect(frames.size).toBe(0);
    expect(drawnStart(container)).toBe('0.5,0.5');

    act(() => store.getState().setPosition('a', { x: 0.4, y: 0.1 }));
    flushFrames();
    expect(drawnStart(container)).toBe('0.4,0.1');
  });

  it('stops following the store when it unmounts', () => {
    const store = storeWithTwoNodes();
    const { unmount } = render(layerElement(store));
    unmount();

    store.getState().setPosition('a', { x: 0.5, y: 0.5 });

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
