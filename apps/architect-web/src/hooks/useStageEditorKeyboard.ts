import { useEffect } from 'react';

import { useAppDispatch } from '~/ducks/hooks';
import { draftRedo, draftUndo } from '~/ducks/modules/stageEditorDraft';

/**
 * Registers a document-level keydown listener that maps the standard
 * undo/redo shortcuts to the stage editor draft history while mounted.
 *
 * - Cmd/Ctrl+Z         -> undo
 * - Cmd/Ctrl+Shift+Z   -> redo
 * - Cmd/Ctrl+Y         -> redo
 *
 * Intended to be mounted inside the StageEditor component, so it is only
 * active while the stage editor is on screen.
 */
export const useStageEditorKeyboard = (): void => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Slate RichText editors handle their own undo/redo and call
      // preventDefault(); bailing on defaultPrevented/contenteditable keeps a
      // single Cmd+Z from both editing rich text AND rewinding the draft.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (e.isComposing) return; // don't swallow IME composition commits

      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;

      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        dispatch(draftUndo());
        return;
      }

      if (e.code === 'KeyZ' && e.shiftKey) {
        e.preventDefault();
        dispatch(draftRedo());
        return;
      }

      if (e.code === 'KeyY') {
        e.preventDefault();
        dispatch(draftRedo());
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch]);
};
