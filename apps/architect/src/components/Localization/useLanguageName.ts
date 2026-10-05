import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocaleTag } from '@codaco/protocol-validation';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { describeLanguage } from './languageChoices';

const messages = defineMessages({
  unspecified: {
    id: 'architect.localization.languageName.unspecified',
    defaultMessage: 'Unspecified language',
    description:
      'Name shown for a protocol language that has not been identified yet (the "und" language tag), usually in a protocol made before protocols declared their languages. Use the same wording as the interview’s name for it.',
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
