import {
  negotiateLocale,
  normalizeLocalePreferences,
  parseAcceptLanguage,
  resolveLocale,
} from '@codaco/shared-consts';

import type { LocaleTag, LocalizationDeclaration } from './localeTag.ts';

export { normalizeLocalePreferences, parseAcceptLanguage };

/**
 * The declared locale that best fits a list of preferences, most preferred
 * first, or undefined when nothing declared is an acceptable fit (see
 * `negotiateLocale`). The order the locales are declared in plays no part.
 */
export function matchLocalePreferences(
  requestedLocales: readonly string[],
  declared: readonly LocaleTag[],
): LocaleTag | undefined {
  return negotiateLocale(requestedLocales, declared);
}

/**
 * The declared locale that best fits the requested ones (see
 * `negotiateLocale`), preferring the protocol's default among equally good
 * fits, or the default when nothing fits. The order the protocol declares its
 * locales in plays no part.
 */
export function selectProtocolLocale(
  requestedLocales: readonly string[],
  localization: LocalizationDeclaration,
): LocaleTag {
  return negotiateLocale(
    requestedLocales,
    localization.locales,
    localization.defaultLocale,
  );
}

/**
 * The interview language (see `resolveLocale`): the language chosen for this
 * interview, on a language chooser stage or by the host on the participant's
 * behalf, then the best fit for the requested languages, then the protocol's
 * default. A choice the protocol does not offer is ignored.
 */
export function resolveProtocolLocale(
  chosen: string | null,
  requestedLocales: readonly string[],
  localization: LocalizationDeclaration,
): LocaleTag {
  return resolveLocale({
    chosen,
    requested: requestedLocales,
    available: localization.locales,
    fallback: localization.defaultLocale,
  }).locale;
}
