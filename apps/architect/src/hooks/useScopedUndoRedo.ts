import { useCallback, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  redoWithNavigation,
  undoWithNavigation,
} from '~/ducks/modules/activeProtocol';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';

type ScopedUndoRedo = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

/**
 * Undo/redo for the protocol timeline.
 *
 * This used to branch on the route because the stage editor's draft history
 * was also driven from Redux. It is now driven from the stage form store, so
 * the stage editor uses `useStageDraftHistory` from inside `StageForm`
 * instead — and `StageEditorPage` renders outside `ProjectLayout`, so this
 * hook's remaining consumers are never on screen in the stage editor.
 */
export const useScopedUndoRedo = (): ScopedUndoRedo => {
  const dispatch = useAppDispatch();

  const canUndo = useAppSelector(getCanUndo);
  const canRedo = useAppSelector(getCanRedo);

  const undo = useCallback(() => {
    dispatch(undoWithNavigation());
  }, [dispatch]);

  const redo = useCallback(() => {
    dispatch(redoWithNavigation());
  }, [dispatch]);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo }),
    [canRedo, canUndo, redo, undo],
  );
};
