import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProtocolUndoRedo } from '../useProtocolUndoRedo';

const undoWithNavigation = vi.fn(() => ({ type: 'main/undo' }));
const redoWithNavigation = vi.fn(() => ({ type: 'main/redo' }));
vi.mock('~/ducks/modules/activeProtocol', () => ({
  undoWithNavigation: () => undoWithNavigation(),
  redoWithNavigation: () => redoWithNavigation(),
}));

const createStore = ({ canUndo = true, canRedo = true } = {}) =>
  configureStore({
    reducer: {
      activeProtocol: (
        state = {
          past: canUndo ? [{}] : [],
          present: { name: 'P' },
          future: canRedo ? [{}] : [],
        },
      ) => state,
    },
  });

const wrapperFor = (store: ReturnType<typeof createStore>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };

describe('useProtocolUndoRedo', () => {
  beforeEach(() => {
    undoWithNavigation.mockClear();
    redoWithNavigation.mockClear();
  });

  it('reports the protocol timeline can-undo/redo flags', () => {
    const { result } = renderHook(() => useProtocolUndoRedo(), {
      wrapper: wrapperFor(createStore({ canUndo: true, canRedo: false })),
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('dispatches the navigation-aware protocol timeline ops', () => {
    const { result } = renderHook(() => useProtocolUndoRedo(), {
      wrapper: wrapperFor(createStore()),
    });

    result.current.undo();
    result.current.redo();

    expect(undoWithNavigation).toHaveBeenCalledTimes(1);
    expect(redoWithNavigation).toHaveBeenCalledTimes(1);
  });
});
