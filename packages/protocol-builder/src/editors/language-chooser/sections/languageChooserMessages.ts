import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything the language-chooser sections say.
 *
 * The stage is where a participant picks which of the protocol's languages the
 * rest of their interview is shown in. The languages themselves are not
 * chosen here — they are the languages the protocol is written in, set in the
 * protocol's settings — so most of what this file says explains where they
 * come from.
 */
export const languageChooserMessages = defineMessages({
  languagesTitle: {
    id: 'protocolBuilder.languageChooser.languagesTitle',
    defaultMessage: 'Languages',
    description:
      'Heading of the section listing the languages a participant can choose between on this stage.',
  },
  languagesDescription: {
    id: 'protocolBuilder.languageChooser.languagesDescription',
    defaultMessage:
      "Participants choose from every language this protocol is written in. Add or remove languages in the protocol's settings.",
    description:
      'Description of the section listing the languages a participant can choose between. The list cannot be edited on this stage; it follows the languages set for the whole protocol.',
  },
  languagesListLabel: {
    id: 'protocolBuilder.languageChooser.languagesListLabel',
    defaultMessage: 'Languages participants can choose',
    description:
      'Accessible name of the list of languages a participant can choose between on this stage.',
  },
  singleLanguage: {
    id: 'protocolBuilder.languageChooser.singleLanguage',
    defaultMessage:
      'This protocol is written in one language, so participants will see it as their only choice.',
    description:
      'Shown under the list of languages when the protocol has only one language, so this stage offers participants a single option.',
  },
});
