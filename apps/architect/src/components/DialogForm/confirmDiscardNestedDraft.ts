import { createElement } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
const utilityMessages = defineMessages({
  unsavedChanges: {
    id: 'architect.utility.dialogForm.confirmDiscardNestedDraft.unsavedChanges',
    defaultMessage: 'Unsaved Changes',
    description:
      'The title text in components / DialogForm / confirmDiscardNestedDraft.',
  },
  youHaveUnsavedChangesInThis: {
    id: 'architect.utility.dialogForm.confirmDiscardNestedDraft.youHaveUnsavedChangesInThis',
    defaultMessage:
      'You have unsaved changes in this editor. Are you sure you want to close without saving?',
    description:
      'The description text in components / DialogForm / confirmDiscardNestedDraft.',
  },
  closeWithoutSaving: {
    id: 'architect.utility.dialogForm.confirmDiscardNestedDraft.closeWithoutSaving',
    defaultMessage: 'Close Without Saving',
    description:
      'The label text in components / DialogForm / confirmDiscardNestedDraft.',
  },
});

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
    title: createElement(AppMessage, {
      message: utilityMessages.unsavedChanges,
    }),
    description: createElement(AppMessage, {
      message: utilityMessages.youHaveUnsavedChangesInThis,
    }),
    size: 'readable',
    actions: {
      primary: {
        label: createElement(AppMessage, {
          message: utilityMessages.closeWithoutSaving,
        }),
        value: true,
      },
      cancel: {
        label: createElement(AppMessage, { message: commonMessages.cancel }),
        value: false,
      },
    },
  });

  return confirmed === true;
};
