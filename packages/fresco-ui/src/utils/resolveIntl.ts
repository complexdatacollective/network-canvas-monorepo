import { createAppIntl, type IntlShape } from '@codaco/app-i18n/messages';

let sharedEnglishIntl: IntlShape | undefined;

/**
 * The formatter for copy produced OUTSIDE a React render — validation schemas
 * built at construction time, the drag-and-drop announcement helpers, the form
 * store's own fallbacks. Those cannot call `useAppIntl`, so each of them takes
 * the host's formatter as an optional argument and passes it through here.
 *
 * Absent, every descriptor renders its English `defaultMessage` — byte for
 * byte what the package rendered before any of this copy became localizable,
 * so an external caller that threads nothing is unaffected. The instance is
 * shared and built once: `createIntl` compiles and caches per formatter, and
 * one per call would throw that cache away on every rule.
 */
export const resolveIntl = (intl?: IntlShape): IntlShape => {
  if (intl) return intl;
  sharedEnglishIntl ??= createAppIntl({ locale: 'en' });
  return sharedEnglishIntl;
};
