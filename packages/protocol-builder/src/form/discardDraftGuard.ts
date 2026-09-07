import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

/**
 * Filed under `dialogForm`, the area that owns the dialog this guard is the
 * dismissal route of. The confirm is raised by `DialogForm` and is never a
 * surface of its own.
 */
const messages = defineMessages({
  discardTitle: {
    id: 'protocolBuilder.dialogForm.discardTitle',
    defaultMessage: 'Discard your changes?',
    description:
      'Title of the confirmation raised when a researcher tries to close an editing dialog that holds unsaved work.',
  },
  discardDescription: {
    id: 'protocolBuilder.dialogForm.discardDescription',
    defaultMessage:
      'This editor holds changes that have not been saved. Closing it now discards them.',
    description:
      'Body of the confirmation raised when a researcher tries to close an editing dialog that holds unsaved work.',
  },
  discardConfirm: {
    id: 'protocolBuilder.dialogForm.discardConfirm',
    defaultMessage: 'Discard changes',
    description:
      'Button that closes an editing dialog and throws away the unsaved work in it.',
  },
  keepEditing: {
    id: 'protocolBuilder.dialogForm.keepEditing',
    defaultMessage: 'Keep editing',
    description:
      'Button that dismisses the discard confirmation and leaves the editing dialog open with its unsaved work intact.',
  },
});

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
  const intl = useAppIntl();
  const { confirm } = useDialog();

  return useCallback(() => {
    if (blocked) return;

    if (!hasDraft()) {
      onClose();
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: intl.formatMessage(messages.discardTitle),
        description: intl.formatMessage(messages.discardDescription),
        confirmLabel: intl.formatMessage(messages.discardConfirm),
        cancelLabel: intl.formatMessage(messages.keepEditing),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed === true) onClose();
    })();
  }, [blocked, confirm, hasDraft, intl, onClose]);
}
