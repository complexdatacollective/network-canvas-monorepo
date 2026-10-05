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
  introductionTitle: {
    id: 'protocolBuilder.languageChooser.introductionTitle',
    defaultMessage: 'Introduction',
    description:
      'Heading of the optional section where a researcher writes text a participant reads above the list of languages on the screen where they choose the language of their interview.',
  },
  introductionDescription: {
    id: 'protocolBuilder.languageChooser.introductionDescription',
    defaultMessage:
      'Write a short message participants read before they choose a language.',
    description:
      'Description of the optional introduction section on the language-choice stage.',
  },
  introductionLabel: {
    id: 'protocolBuilder.languageChooser.introductionLabel',
    defaultMessage: 'Introduction text',
    description:
      'Label of the rich-text field holding the message a participant reads above the list of languages.',
  },
  clearIntroductionTitle: {
    id: 'protocolBuilder.languageChooser.clearIntroductionTitle',
    defaultMessage: 'Remove the introduction?',
    description:
      'Title of the confirmation asked before switching the introduction off, which deletes the introduction text in every protocol language.',
  },
  clearIntroductionDescription: {
    id: 'protocolBuilder.languageChooser.clearIntroductionDescription',
    defaultMessage:
      'The introduction will be deleted in every language. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching the introduction off, which deletes the introduction text in every protocol language.',
  },
  clearIntroductionConfirm: {
    id: 'protocolBuilder.languageChooser.clearIntroductionConfirm',
    defaultMessage: 'Remove introduction',
    description:
      'Action that confirms switching the introduction off and deleting its text.',
  },
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
