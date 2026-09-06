import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

const DISCARD_DRAFT_TITLE = 'Discard your changes?';
const DISCARD_DRAFT_DESCRIPTION =
  'This editor holds changes that have not been saved. Closing it now discards them.';

export type DiscardDraftGuardOptions = Readonly<{
  /**
   * Whether the dialog is holding work that closing it would throw away.
   *
   * A function rather than a value, because it is asked at the moment of the
   * dismissal: a dialog re-rendering on every keystroke to keep a boolean
   * current is a dialog re-rendering for a question nobody has asked yet.
   */
  hasDraft: () => boolean;
  /** Closes the dialog: called when there is nothing to lose, or the
   * researcher has said to discard it. */
  onClose: () => void;
  /**
   * Refuses every dismissal while true — a save in flight, whose outcome the
   * dialog is about to show.
   */
  blocked?: boolean;
}>;

/**
 * The one gate every way out of a dialog goes through, so unsaved work is
 * never thrown away by an accident.
 *
 * Escape, a click outside, the close button and Cancel are four different
 * gestures and only one of them is a decision — the other three are reflexes,
 * and two of them are things a researcher does to a dialog they have not
 * finished with. Fresco's `Dialog` routes all four through one `closeDialog`,
 * which is what lets a single question cover them: closing is refused, once,
 * until the researcher says the draft may go.
 *
 * Deliberately not the route a successful save takes: there is nothing left to
 * lose by then, and asking would be a question about work that has just been
 * saved. Nor is it asked when the dialog holds nothing — a question the
 * researcher has to dismiss every time they open a dialog to look at it is one
 * they learn to dismiss without reading.
 */
export function useDiscardDraftGuard({
  hasDraft,
  onClose,
  blocked = false,
}: DiscardDraftGuardOptions): () => void {
  const { confirm } = useDialog();

  return useCallback(() => {
    if (blocked) return;

    if (!hasDraft()) {
      onClose();
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: DISCARD_DRAFT_TITLE,
        description: DISCARD_DRAFT_DESCRIPTION,
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed === true) onClose();
    })();
  }, [blocked, confirm, hasDraft, onClose]);
}
