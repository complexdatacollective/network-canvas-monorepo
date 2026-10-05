import { defineMessages } from '@codaco/app-i18n/messages';

export const languageMessages = defineMessages({
  chooseLanguage: {
    id: 'interview.language.chooseLanguage',
    defaultMessage: 'Choose a language',
    description:
      'Heading of the interview screen where the participant picks the language the interview is shown in.',
  },
  unspecifiedLanguage: {
    id: 'interview.language.unspecifiedLanguage',
    defaultMessage: 'Unspecified language',
    description:
      'Name of the language choice for interview content whose language the researcher did not specify.',
  },
});
