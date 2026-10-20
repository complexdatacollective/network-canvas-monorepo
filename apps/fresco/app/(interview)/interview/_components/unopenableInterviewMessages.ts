import { defineMessages } from '@codaco/app-i18n/messages';

/** What a participant is told when their interview cannot be opened. */
export const unopenableInterviewMessages = defineMessages({
  unreadableTitle: {
    id: 'fresco.interview.page.unreadableTitle',
    defaultMessage: 'This interview could not be opened',
    description:
      'Participant-facing heading shown instead of an interview whose stored protocol or answers could not be read.',
  },
  protocolUnreadable: {
    id: 'fresco.interview.page.protocolUnreadable',
    defaultMessage:
      'This interview could not be loaded, so it has not been started. Nothing has been changed. Please contact the person who recruited you to this study for assistance.',
    description:
      'Participant-facing explanation shown when the protocol an interview uses could not be read, so the interview was not started.',
  },
  sessionUnreadable: {
    id: 'fresco.interview.page.sessionUnreadable',
    defaultMessage:
      'The answers saved for this interview could not be read, so it has not been started. Nothing has been changed. Please contact the person who recruited you to this study for assistance.',
    description:
      'Participant-facing explanation shown when the answers saved for an interview could not be read, so the interview was not started.',
  },
});
