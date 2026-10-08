import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocaleTag } from '@codaco/protocol-validation';

import { describeLanguage } from './languageChoices';

/** A declared language's name in Architect's own language. */
export const useLanguageName = () => {
  const intl = useAppIntl();
  return useCallback(
    (locale: LocaleTag) => describeLanguage(locale, intl.locale).name,
    [intl],
  );
};
