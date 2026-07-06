import { useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  redoWithNavigation,
  undoWithNavigation,
} from '~/ducks/modules/activeProtocol';
import { draftRedo, draftUndo } from '~/ducks/modules/stageEditorDraft';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';
import { getCanRedoDraft, getCanUndoDraft } from '~/selectors/stageEditorDraft';

type ScopedUndoRedo = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

/**
 * Returns undo/redo state and actions scoped to the current route. When the
 * stage editor is on screen, operations target the stage editor draft history;
 * otherwise they target the main protocol timeline.
 */
export const useScopedUndoRedo = (): ScopedUndoRedo => {
  const [location] = useLocation();
  const isStageEditor = location.startsWith('/protocol/stage/');

  const dispatch = useAppDispatch();

  // Hooks must be called unconditionally, so always read both scopes.
  const canUndoDraft = useAppSelector(getCanUndoDraft);
  const canRedoDraft = useAppSelector(getCanRedoDraft);
  const canUndoMain = useAppSelector(getCanUndo);
  const canRedoMain = useAppSelector(getCanRedo);

  const handleUndo = useCallback(() => {
    if (isStageEditor) {
      dispatch(draftUndo());
    } else {
      dispatch(undoWithNavigation());
    }
  }, [dispatch, isStageEditor]);

  const handleRedo = useCallback(() => {
    if (isStageEditor) {
      dispatch(draftRedo());
    } else {
      dispatch(redoWithNavigation());
    }
  }, [dispatch, isStageEditor]);

  return useMemo(
    () => ({
      canUndo: isStageEditor ? canUndoDraft : canUndoMain,
      canRedo: isStageEditor ? canRedoDraft : canRedoMain,
      undo: handleUndo,
      redo: handleRedo,
    }),
    [
      isStageEditor,
      canUndoDraft,
      canRedoDraft,
      canUndoMain,
      canRedoMain,
      handleUndo,
      handleRedo,
    ],
  );
};
