import { defineMessages } from '@codaco/app-i18n/messages';

// Copy shared by every place that shows a protocol made for an older schema:
// the deck's schema 8 cards and the new-interview form. One definition each,
// so two places saying the same thing can never be worded differently.
//
// Versions are arguments rather than literals, so the same copy serves the
// next schema bump.
export const legacyProtocolMessages = defineMessages({
  notAvailable: {
    id: 'interviewer.legacyProtocol.notAvailable',
    defaultMessage: 'Not available',
    description:
      'Short badge on an older protocol’s card on the home screen, shown when this version of Interviewer does not include the previous version that runs it, so no interview can be started with it here.',
  },
  notAvailableHelp: {
    id: 'interviewer.legacyProtocol.notAvailableHelp',
    defaultMessage:
      'This version of Interviewer cannot run schema {legacyVersion} protocols, so interviews cannot be started with this protocol here.',
    description:
      'Text at the bottom of an older protocol’s card on the home screen, and in place of its new-interview form, when this version of Interviewer does not include the previous version that runs its interviews. {legacyVersion} is the older schema version number, which is also the previous version’s number (for example 8).',
  },
});
