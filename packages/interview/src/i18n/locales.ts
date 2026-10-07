import { defineAppLocales } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';

/** Built-in interface languages, independent of host and protocol locales. */
export const interviewLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
  { locale: 'zh-Hans', label: '简体中文', direction: 'ltr' },
  { locale: 'zh-Hant', label: '繁體中文', direction: 'ltr' },
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'nl', label: 'Nederlands', direction: 'ltr' },
  { locale: 'pt-BR', label: 'Português (Brasil)', direction: 'ltr' },
  { locale: 'it', label: 'Italiano', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
]);

export type RequestedLocale = string | readonly string[] | null;

// A protocol written in an unspecified language (`und`) states nothing about
// the interface language, but best-fit matching reads `und` as English.
const isUnspecifiedLanguage = (tag: string) =>
  tag.split('-')[0]?.toLowerCase() === 'und';

/** No browser or storage access: hosts supply their preference at the boundary. */
function negotiateInterviewLocale(
  requestedLocale?: RequestedLocale,
  preference?: string | null,
) {
  return resolveAppLocale({
    stored:
      preference == null || isUnspecifiedLanguage(preference)
        ? null
        : preference,
    requested:
      typeof requestedLocale === 'string'
        ? [requestedLocale]
        : (requestedLocale ?? []),
    locales: interviewLocales,
    defaultLocale: 'en',
  });
}

/**
 * `preference` is the participant's stated protocol language. It decides only
 * when the interface has that language; otherwise the requested languages do.
 */
export function resolveInterviewLocale(
  requestedLocale?: RequestedLocale,
  preference?: string | null,
): string {
  return negotiateInterviewLocale(requestedLocale, preference).locale;
}
