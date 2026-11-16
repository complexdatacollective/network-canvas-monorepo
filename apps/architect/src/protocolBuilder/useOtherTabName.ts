import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

const messages = defineMessages({
  otherTab: {
    id: 'architect.stageEditor.stageEditorPage.otherTab',
    defaultMessage: 'Another tab',
    description:
      'What an editor calls the browser tab that holds the saved copy of this protocol, when it is not this one. Read as, for example, “Another tab is editing this stage”.',
  },
});

/** What a lock holder in another browser tab is called, for `useArchitectClient`. */
export function useOtherTabName(): string {
  return useAppIntl().formatMessage(messages.otherTab);
}
