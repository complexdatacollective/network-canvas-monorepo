import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useScopedUndoRedo } from '../useScopedUndoRedo';

const mockLocation = vi.fn(() => '/protocol');
vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), vi.fn()],
}));

const undoWithNavigation = vi.fn(() => ({ type: 'main/undo' }));
const redoWithNavigation = vi.fn(() => ({ type: 'main/redo' }));
vi.mock('~/ducks/modules/activeProtocol', () => ({
  undoWithNavigation: () => undoWithNavigation(),
  redoWithNavigation: () => redoWithNavigation(),
}));

const draftUndo = vi.fn(() => ({ type: 'draft/undo' }));
const draftRedo = vi.fn(() => ({ type: 'draft/redo' }));
vi.mock('~/ducks/modules/stageEditorDraft', () => ({
  draftUndo: () => draftUndo(),
  draftRedo: () => draftRedo(),
}));

// Main timeline has nothing to undo/redo; the draft history does. This lets us
// assert that the hook reads the can-undo/redo flags from the scope matching
// the current route, not just that it dispatches the right action.
const createStore = () =>
  configureStore({
    reducer: {
      activeProtocol: (
        state = { past: [], present: { name: 'P' }, future: [] },
      ) => state,
      stageEditorDraft: (
        state = {
          history: { past: [{}], present: null, timeline: [], future: [{}] },
          ui: { restoring: false, initialValues: null },
        },
      ) => state,
    },
  });

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={createStore()}>{children}</Provider>
);

describe('useScopedUndoRedo', () => {
  beforeEach(() => {
    mockLocation.mockReturnValue('/protocol');
    undoWithNavigation.mockClear();
    redoWithNavigation.mockClear();
    draftUndo.mockClear();
    draftRedo.mockClear();
  });

  describe('outside the stage editor', () => {
    beforeEach(() => mockLocation.mockReturnValue('/protocol'));

    it('reports the main-timeline can-undo/redo flags', () => {
      const { result } = renderHook(() => useScopedUndoRedo(), { wrapper });
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('dispatches the navigation-aware main-timeline ops', () => {
      const { result } = renderHook(() => useScopedUndoRedo(), { wrapper });

      result.current.undo();
      result.current.redo();

      expect(undoWithNavigation).toHaveBeenCalledTimes(1);
      expect(redoWithNavigation).toHaveBeenCalledTimes(1);
      expect(draftUndo).not.toHaveBeenCalled();
      expect(draftRedo).not.toHaveBeenCalled();
    });
  });

  describe('inside the stage editor', () => {
    beforeEach(() => mockLocation.mockReturnValue('/protocol/stage/stage-1'));

    it('reports the draft-history can-undo/redo flags', () => {
      const { result } = renderHook(() => useScopedUndoRedo(), { wrapper });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
    });

    it('dispatches the draft ops, not the main-timeline ops', () => {
      const { result } = renderHook(() => useScopedUndoRedo(), { wrapper });

      result.current.undo();
      result.current.redo();

      expect(draftUndo).toHaveBeenCalledTimes(1);
      expect(draftRedo).toHaveBeenCalledTimes(1);
      expect(undoWithNavigation).not.toHaveBeenCalled();
      expect(redoWithNavigation).not.toHaveBeenCalled();
    });
  });
});
