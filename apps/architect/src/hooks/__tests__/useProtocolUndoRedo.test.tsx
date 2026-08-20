import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimelineOperationOutcome } from '~/ducks/modules/activeProtocol';

import { useProtocolUndoRedo } from '../useProtocolUndoRedo';

const announce = vi.fn();
vi.mock('@codaco/fresco-ui/dnd/useAccessibilityAnnouncements', () => ({
  useAccessibilityAnnouncements: () => ({ announce }),
}));

// The thunks return the outcome of the activation; the hook turns that into the
// polite announcement, so the tests drive the outcome directly.
const undoOutcome = vi.fn<() => TimelineOperationOutcome>();
const redoOutcome = vi.fn<() => TimelineOperationOutcome>();
vi.mock('~/ducks/modules/activeProtocol', () => ({
  undoWithNavigation: () => () => undoOutcome(),
  redoWithNavigation: () => () => redoOutcome(),
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

const renderProtocolUndoRedo = (options?: Parameters<typeof createStore>[0]) =>
  renderHook(() => useProtocolUndoRedo(), {
    wrapper: wrapperFor(createStore(options)),
  });

describe('useProtocolUndoRedo', () => {
  beforeEach(() => {
    announce.mockClear();
    undoOutcome.mockReset();
    redoOutcome.mockReset();
    undoOutcome.mockReturnValue({ applied: true, navigatedTo: null });
    redoOutcome.mockReturnValue({ applied: true, navigatedTo: null });
  });

  it('reports the protocol timeline can-undo/redo flags', () => {
    const { result } = renderProtocolUndoRedo({
      canUndo: true,
      canRedo: false,
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('dispatches the navigation-aware protocol timeline ops', () => {
    const { result } = renderProtocolUndoRedo();

    result.current.undo();
    result.current.redo();

    expect(undoOutcome).toHaveBeenCalledTimes(1);
    expect(redoOutcome).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 'Change undone.'],
    ['/protocol', 'Change undone. Moved to Stages to show the result.'],
    [
      '/protocol/assets',
      'Change undone. Moved to Resources to show the result.',
    ],
    [
      '/protocol/codebook',
      'Change undone. Moved to Codebook to show the result.',
    ],
  ])('announces an undo that moved to %s', (navigatedTo, message) => {
    undoOutcome.mockReturnValue({ applied: true, navigatedTo });
    const { result } = renderProtocolUndoRedo();

    result.current.undo();

    expect(announce).toHaveBeenCalledWith(message);
  });

  it.each([
    [null, 'Change redone.'],
    ['/protocol', 'Change redone. Moved to Stages to show the result.'],
    [
      '/protocol/assets',
      'Change redone. Moved to Resources to show the result.',
    ],
    [
      '/protocol/codebook',
      'Change redone. Moved to Codebook to show the result.',
    ],
  ])('announces a redo that moved to %s', (navigatedTo, message) => {
    redoOutcome.mockReturnValue({ applied: true, navigatedTo });
    const { result } = renderProtocolUndoRedo();

    result.current.redo();

    expect(announce).toHaveBeenCalledWith(message);
  });

  it('stays silent when the operation was not applied', () => {
    undoOutcome.mockReturnValue({ applied: false, navigatedTo: null });
    redoOutcome.mockReturnValue({ applied: false, navigatedTo: null });
    const { result } = renderProtocolUndoRedo();

    result.current.undo();
    result.current.redo();

    expect(announce).not.toHaveBeenCalled();
  });
});
