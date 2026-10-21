import { defineMessages } from '@codaco/app-i18n/messages';

// A button label shared by screens that send the researcher back to the start
// screen. It keeps its original id so existing translations still apply.
const messages = defineMessages({
  returnToStartScreen: {
    id: 'architect.protocolValidationDialogReporter.returnToStartScreen',
    defaultMessage: 'Return to Start Screen',
    description:
      "Button that leaves the current screen for Architect's start screen.",
  },
});

export const returnToStartScreenMessage = messages.returnToStartScreen;
