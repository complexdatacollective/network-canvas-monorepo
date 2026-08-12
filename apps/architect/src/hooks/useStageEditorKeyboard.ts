import { useEffect } from 'react';

import { useStageDraftHistory } from '~/components/StageEditor/useStageDraftHistory';

/**
 * Registers a document-level keydown listener that maps the standard
 * undo/redo shortcuts to the stage editor draft history while mounted.
 *
 * - Cmd/Ctrl+Z         -> undo
 * - Cmd/Ctrl+Shift+Z   -> redo
 * - Cmd/Ctrl+Y         -> redo
 *
 * Must be mounted inside `StageForm`: undo/redo now writes to the stage form
 * store, which it reaches through the stage form context.
 */
// A base-ui Dialog popup (item-edit dialog, confirm/warning) renders with
// role="dialog"/"alertdialog". The stage editor page is not itself a dialog, so
// any such element in the DOM means a modal is layered over the hidden form.
const isDialogOpen = (): boolean =>
  document.querySelector('[role="dialog"],[role="alertdialog"]') !== null;

export const useStageEditorKeyboard = (): void => {
  const { undo, redo } = useStageDraftHistory();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Slate RichText editors handle their own undo/redo and call
      // preventDefault(); bailing on defaultPrevented/contenteditable keeps a
      // single Cmd+Z from both editing rich text AND rewinding the draft.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (e.isComposing) return; // don't swallow IME composition commits

      // While an item-edit dialog (or any modal) is open, undo/redo must not
      // rewind the hidden stage form behind it — that corrupts array indices the
      // dialog is editing. Let the dialog's own history handle it instead.
      if (isDialogOpen()) return;

      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;

      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (e.code === 'KeyZ' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.code === 'KeyY') {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [redo, undo]);
};
