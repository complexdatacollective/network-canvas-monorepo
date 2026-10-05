import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocaleTag } from '@codaco/protocol-validation';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { describeLanguage } from './languageChoices';

const messages = defineMessages({
  unspecified: {
    id: 'architect.localization.languageName.unspecified',
    defaultMessage: 'Unidentified language',
    description:
      'Name shown for text whose language has not been identified yet, usually text from a protocol made before protocols declared their languages.',
  },
});

/** A declared language's name in Architect's own language. */
export const useLanguageName = () => {
  const intl = useAppIntl();
  return useCallback(
    (locale: LocaleTag) =>
      locale === UNSPECIFIED_LOCALE
        ? intl.formatMessage(messages.unspecified)
        : describeLanguage(locale, intl.locale).name,
    [intl],
  );
};
