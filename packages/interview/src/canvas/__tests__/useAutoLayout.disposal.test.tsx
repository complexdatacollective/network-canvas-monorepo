import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { ContractProvider } from '../../contract/context';
import type { AppDispatch } from '../../store/store';
import { useAutoLayout } from '../useAutoLayout';
import { createCanvasStore } from '../useCanvasStore';

// A stand-in for the layout worker that, unlike a real one, still delivers a
// message after it is terminated: the case the hook must not act on.
const workers = vi.hoisted(() => {
  class FakeWorker extends EventTarget {
    postMessage = () => undefined;
    terminate = () => undefined;
  }
  const created: FakeWorker[] = [];
  return {
    created,
    create: () => {
      const worker = new FakeWorker();
      created.push(worker);
      return worker;
    },
  };
});

vi.mock('../createAutoLayoutWorker.ts', () => ({
  createAutoLayoutWorker: workers.create,
  createAutoLayoutMockWorker: workers.create,
}));

const LAYOUT_VAR = 'layout';

const nodes: NcNode[] = [
  {
    [entityPrimaryKeyProperty]: 'alex',
    type: 'person',
    [entityAttributesProperty]: { [LAYOUT_VAR]: { x: 0.2, y: 0.3 } },
  },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <ContractProvider
    onFinish={vi.fn()}
    onRequestAsset={vi.fn()}
    flags={{ isE2E: false, isDevelopment: false }}
  >
    {children}
  </ContractProvider>
);

const settle = (worker: EventTarget) =>
  worker.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'end', nodes: [{ nodeId: 'alex', x: 0.9, y: 0.5 }] },
    }),
  );

describe('useAutoLayout', () => {
  it('ignores a layout the worker reports after the layout is turned off', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions({ width: 800, height: 600 });
    store.getState().setPosition('alex', { x: 0.2, y: 0.3 });
    const dispatch = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAutoLayout({
          enabled,
          nodes,
          edges: [],
          store,
          nodeRadius: 20,
          layoutVariable: LAYOUT_VAR,
          persist: true,
          dispatch: dispatch as unknown as AppDispatch,
          currentStep: 0,
          runMode: 'continuous',
        }),
      { initialProps: { enabled: true }, wrapper },
    );

    const worker = workers.created.at(-1);
    if (!worker) throw new Error('expected the layout to create a worker');

    // While the layout runs, a settle moves Alex and saves the position.
    settle(worker);
    expect(dispatch).toHaveBeenCalled();
    const settled = store.getState().positions.get('alex');

    rerender({ enabled: false });
    dispatch.mockClear();
    store.getState().setPosition('alex', { x: 0.2, y: 0.3 });

    settle(worker);
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.getState().positions.get('alex')).toEqual({ x: 0.2, y: 0.3 });
    expect(settled).not.toEqual({ x: 0.2, y: 0.3 });
  });
});
