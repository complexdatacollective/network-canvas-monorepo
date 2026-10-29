import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';

import { fromSim } from '../layoutGeometry';
import { useAutoLayout } from '../useAutoLayout';
import { createCanvasStore } from '../useCanvasStore';

type Posted = { type: string; nodes?: { nodeId: string; placed: boolean }[] };

class FakeWorker {
  posted: Posted[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(message: Posted) {
    this.posted.push(message);
  }
  terminate() {}
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

let worker: FakeWorker;
let skipAnimations = false;
let playback: {
  onUpdate: (progress: number) => void;
  onComplete: () => void;
} | null;

vi.mock('../createAutoLayoutWorker.ts', () => ({
  createAutoLayoutWorker: () => worker,
  createAutoLayoutMockWorker: () => worker,
}));
vi.mock('../../contract/context', () => ({
  useContractFlags: () => ({ isE2E: false }),
}));
vi.mock('@codaco/fresco-ui/hooks/useSafeAnimate', () => ({
  useShouldSkipAnimations: () => skipAnimations,
}));
vi.mock('motion/react', () => ({
  animate: (
    _from: number,
    _to: number,
    options: {
      onUpdate: (progress: number) => void;
      onComplete: () => void;
    },
  ) => {
    playback = options;
    return { stop: () => {} };
  },
}));

const DIMS = { width: 1000, height: 500 };
const node = (id: string): NcNode => ({
  _uid: id,
  type: 'person',
  attributes: {},
});

const setup = () => {
  const store = createCanvasStore();
  store.getState().setCanvasDimensions(DIMS);
  store.getState().setBatchPositions([['a', { x: 0.3, y: 0.5 }]]);
  const hook = renderHook(() =>
    useAutoLayout({
      enabled: true,
      nodes: [node('a'), node('b')],
      edges: [],
      store,
      nodeRadius: 20,
      layoutVariable: 'layout',
    }),
  );
  return { store, hook };
};

// Final sim positions and a two-frame path for each node, in sim space.
const END_NODES = [
  { nodeId: 'a', x: 1.2, y: 0.4 },
  { nodeId: 'b', x: 0.8, y: 0.6 },
];
const FRAMES = [
  [1.0, 0.45, 0.9, 0.55],
  [1.2, 0.4, 0.8, 0.6],
];

beforeEach(() => {
  worker = new FakeWorker();
  skipAnimations = false;
  playback = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAutoLayout', () => {
  it('lays out a node without a position as new', () => {
    setup();
    const init = worker.posted.find((m) => m.type === 'initialize')!;
    expect(init.nodes!.map(({ nodeId, placed }) => [nodeId, placed])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('plays the settle back from where people are on screen to where they settled', () => {
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: END_NODES, frames: FRAMES }));

    expect(hook.result.current.isRunning).toBe(true);
    act(() => playback!.onUpdate(0));
    // 'a' starts where it was; 'b' had no position, so it starts on its path.
    expect(store.getState().positions.get('a')).toEqual({ x: 0.3, y: 0.5 });
    expect(store.getState().positions.get('b')).toEqual(
      fromSim({ x: 0.9, y: 0.55 }, DIMS),
    );

    act(() => {
      playback!.onUpdate(1);
      playback!.onComplete();
    });
    for (const { nodeId, x, y } of END_NODES) {
      const position = store.getState().positions.get(nodeId)!;
      const expected = fromSim({ x, y }, DIMS);
      expect(position.x).toBeCloseTo(expected.x);
      expect(position.y).toBeCloseTo(expected.y);
    }
    expect(hook.result.current.isRunning).toBe(false);
  });

  it('reports a run skipped for reduced motion, then places people at once', () => {
    skipAnimations = true;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: END_NODES, frames: FRAMES }));

    expect(playback).toBeNull();
    expect(hook.result.current.isRunning).toBe(true);
    expect(store.getState().positions.get('a')).toEqual(
      fromSim({ x: 1.2, y: 0.4 }, DIMS),
    );
    act(() => frame!(0));
    expect(hook.result.current.isRunning).toBe(false);
  });

  it('places people at once when the end carries no frames', () => {
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: END_NODES }));

    expect(playback).toBeNull();
    expect(hook.result.current.isRunning).toBe(false);
    expect(store.getState().positions.get('b')).toEqual(
      fromSim({ x: 0.8, y: 0.6 }, DIMS),
    );
  });
});
