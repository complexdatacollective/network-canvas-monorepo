import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';

import { fromSim } from '../layoutGeometry';
import { useAutoLayout } from '../useAutoLayout';
import { createCanvasStore } from '../useCanvasStore';

type Posted = { type: string; nodes?: { nodeId: string; placed: boolean }[] };

class FakeWorker extends EventTarget {
  posted: Posted[] = [];
  postMessage(message: Posted) {
    this.posted.push(message);
  }
  terminate() {}
  emit(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
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

const setup = ({ measured = true } = {}) => {
  const store = createCanvasStore();
  if (measured) store.getState().setCanvasDimensions(DIMS);
  store.getState().setBatchPositions([['a', { x: 0.3, y: 0.5 }]]);
  const hook = renderHook(
    ({ currentStep, nodes }: { currentStep: number; nodes: NcNode[] }) =>
      useAutoLayout({
        enabled: true,
        nodes,
        edges: [],
        store,
        nodeRadius: 20,
        layoutVariable: 'layout',
        persist: true,
        dispatch: vi.fn(),
        currentStep,
      }),
    { initialProps: { currentStep: 1, nodes: [node('a'), node('b')] } },
  );
  return { store, hook };
};

// Where the first layout settles, and where a later one moves people to, in
// sim space.
const FIRST_LAYOUT = [
  { nodeId: 'a', x: 1.2, y: 0.4 },
  { nodeId: 'b', x: 0.8, y: 0.6 },
];
const NEXT_LAYOUT = [
  { nodeId: 'a', x: 1.0, y: 0.5 },
  { nodeId: 'b', x: 0.6, y: 0.4 },
];

const expectPlacedAt = (
  store: ReturnType<typeof createCanvasStore>,
  layout: typeof FIRST_LAYOUT,
) => {
  for (const { nodeId, x, y } of layout) {
    const position = store.getState().positions.get(nodeId)!;
    const expected = fromSim({ x, y }, DIMS);
    expect(position.x).toBeCloseTo(expected.x);
    expect(position.y).toBeCloseTo(expected.y);
  }
};

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

  it('keeps the first layout pending until it arrives, then reveals it in place', () => {
    const { store } = setup();
    expect(store.getState().layoutPending).toBe(true);

    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));

    expect(store.getState().layoutPending).toBe(false);
    expect(playback).toBeNull();
    expectPlacedAt(store, FIRST_LAYOUT);
  });

  it('hides people from the first paint, before the canvas is measured', () => {
    const { store } = setup({ measured: false });

    expect(worker.posted).toHaveLength(0);
    expect(store.getState().layoutPending).toBe(true);
  });

  it('lays out a later change in sight once the first layout is shown', () => {
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));

    hook.rerender({
      currentStep: 1,
      nodes: [node('a'), node('b'), node('c')],
    });

    expect(worker.posted.filter((m) => m.type === 'initialize')).toHaveLength(
      2,
    );
    expect(store.getState().layoutPending).toBe(false);
  });

  it('moves people in a straight line from where they are shown to where a later layout settled', () => {
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));
    act(() => worker.emit({ type: 'end', nodes: NEXT_LAYOUT }));

    expect(hook.result.current.isRunning).toBe(true);
    act(() => playback!.onUpdate(0));
    expectPlacedAt(store, FIRST_LAYOUT);
    act(() => playback!.onUpdate(0.5));
    expectPlacedAt(
      store,
      FIRST_LAYOUT.map(({ nodeId, x, y }, i) => ({
        nodeId,
        x: (x + NEXT_LAYOUT[i]!.x) / 2,
        y: (y + NEXT_LAYOUT[i]!.y) / 2,
      })),
    );

    act(() => {
      playback!.onUpdate(1);
      playback!.onComplete();
    });
    expectPlacedAt(store, NEXT_LAYOUT);
    expect(hook.result.current.isRunning).toBe(false);
  });

  it('reports a later layout skipped for reduced motion, then places people at once', () => {
    skipAnimations = true;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));
    act(() => frame!(0));
    act(() => worker.emit({ type: 'end', nodes: NEXT_LAYOUT }));

    expect(playback).toBeNull();
    expect(hook.result.current.isRunning).toBe(true);
    expectPlacedAt(store, NEXT_LAYOUT);
    act(() => frame!(0));
    expect(hook.result.current.isRunning).toBe(false);
  });

  it('leaves a held person to the drag, and saves and moves people only once they are let go', () => {
    const { store, hook } = setup();
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));
    const syncToRedux = vi.fn();
    store.setState({ syncToRedux });
    const dragged = { x: 0.2, y: 0.2 };

    act(() => {
      store.getState().setPosition('a', dragged);
      hook.result.current.moveNode('a', dragged);
    });
    act(() => worker.emit({ type: 'tick', nodes: NEXT_LAYOUT }));
    act(() => worker.emit({ type: 'end', nodes: NEXT_LAYOUT }));

    expect(store.getState().positions.get('a')).toEqual(dragged);
    expectPlacedAt(store, NEXT_LAYOUT.slice(1));
    expect(playback).toBeNull();
    expect(syncToRedux).not.toHaveBeenCalled();

    act(() => hook.result.current.releaseNode('a'));
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));

    expect(syncToRedux).toHaveBeenCalledTimes(1);
    expect(playback).not.toBeNull();
  });

  it('neither lays out again nor saves to the next step when the step changes', () => {
    const { store, hook } = setup();
    const syncToRedux = vi.fn();
    store.setState({ syncToRedux });

    // The stage stays on screen for its exit transition after the step moves.
    hook.rerender({ currentStep: 2, nodes: [node('a'), node('b')] });
    act(() => worker.emit({ type: 'end', nodes: FIRST_LAYOUT }));

    expect(worker.posted.filter((m) => m.type === 'initialize')).toHaveLength(
      1,
    );
    expect(syncToRedux).toHaveBeenCalledTimes(1);
    expect(syncToRedux.mock.calls[0]![2]).toBe(1);
  });
});
