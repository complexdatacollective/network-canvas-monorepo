import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';

/**
 * The one confirmation shown before a nested editor with unsaved changes is
 * closed — by Cancel, the close button, Escape or a backdrop click, all of
 * which fresco-ui's `Dialog` routes through a single `closeDialog`.
 *
 * Kept in one place so the researcher meets the same wording wherever they are:
 * this copy used to be duplicated (with drift) in the new-variable window and
 * the entity-type dialog, and was missing entirely from the array-row editors
 * and the rule editor.
 */
export const confirmDiscardNestedDraft = async (
  openDialog: DialogContextType['openDialog'],
): Promise<boolean> => {
  const confirmed = await openDialog({
    type: 'choice',
    intent: 'warning',
    title: 'Unsaved Changes',
    description:
      'You have unsaved changes in this editor. Are you sure you want to close without saving?',
    size: 'readable',
    actions: {
      primary: { label: 'Close Without Saving', value: true },
      cancel: { label: 'Cancel', value: false },
    },
  });

  return confirmed === true;
};
