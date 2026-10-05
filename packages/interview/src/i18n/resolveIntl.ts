import { createAppIntl, type IntlShape } from '@codaco/app-i18n/messages';

let english: IntlShape | undefined;

/** Formatter for pure display helpers; no provider or mutable active locale. */
export function resolveInterviewIntl(intl?: IntlShape): IntlShape {
  if (intl) return intl;
  english ??= createAppIntl({ locale: 'en' });
  return english;
}
