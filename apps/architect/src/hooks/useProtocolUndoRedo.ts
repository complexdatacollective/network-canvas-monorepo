import { useCallback, useMemo } from 'react';

import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  redoWithNavigation,
  undoWithNavigation,
} from '~/ducks/modules/activeProtocol';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';

type ProtocolUndoRedo = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

// Whole sentences rather than assembled fragments, so they can be localised
// later without depending on English word order (see the repo's i18n rules).
// `navigatedTo` is the page the operation moved the researcher to, and matches
// the targets `resolveTimelineNavTarget` can produce. Destinations are named
// exactly as ProjectNav labels them, so what a researcher hears matches the
// page they arrive on.
const undoAnnouncement = (navigatedTo: string | null): string => {
  switch (navigatedTo) {
    case '/protocol':
      return 'Change undone. Moved to Stages to show the result.';
    case '/protocol/assets':
      return 'Change undone. Moved to Resources to show the result.';
    case '/protocol/codebook':
      return 'Change undone. Moved to Codebook to show the result.';
    case null:
    default:
      return 'Change undone.';
  }
};

const redoAnnouncement = (navigatedTo: string | null): string => {
  switch (navigatedTo) {
    case '/protocol':
      return 'Change redone. Moved to Stages to show the result.';
    case '/protocol/assets':
      return 'Change redone. Moved to Resources to show the result.';
    case '/protocol/codebook':
      return 'Change redone. Moved to Codebook to show the result.';
    case null:
    default:
      return 'Change redone.';
  }
};

/**
 * Undo/redo for the protocol timeline.
 *
 * This used to branch on the route because the stage editor's draft history
 * was also driven from Redux. It is now driven from the stage form store, so
 * the stage editor uses `useStageDraftHistory` from inside `StageForm`
 * instead — and `StageEditorPage` renders outside `ProjectLayout`, so this
 * hook's remaining consumers are never on screen in the stage editor.
 *
 * An applied operation is announced politely: undo and redo change protocol
 * state without a reload, and can move the researcher to another page to show
 * the result, neither of which a screen reader would otherwise report. The
 * announcement is skipped when the timeline refused the operation, so it can
 * never claim a change that did not happen.
 */
export const useProtocolUndoRedo = (): ProtocolUndoRedo => {
  const dispatch = useAppDispatch();
  const { announce } = useAccessibilityAnnouncements();

  const canUndo = useAppSelector(getCanUndo);
  const canRedo = useAppSelector(getCanRedo);

  const undo = useCallback(() => {
    const outcome = dispatch(undoWithNavigation());
    if (!outcome.applied) return;
    announce(undoAnnouncement(outcome.navigatedTo));
  }, [announce, dispatch]);

  const redo = useCallback(() => {
    const outcome = dispatch(redoWithNavigation());
    if (!outcome.applied) return;
    announce(redoAnnouncement(outcome.navigatedTo));
  }, [announce, dispatch]);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo }),
    [canRedo, canUndo, redo, undo],
  );
};
