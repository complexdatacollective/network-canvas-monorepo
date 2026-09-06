import { defineAppLocales } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';

/** Built-in interface languages, independent of host and protocol locales. */
export const interviewLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
]);

export type RequestedLocale = string | readonly string[] | null;

/** No browser or storage access: hosts supply their preference at the boundary. */
export function negotiateInterviewLocale(
  requestedLocale?: RequestedLocale,
  preference?: string | null,
) {
  return resolveAppLocale({
    stored: preference,
    requested:
      typeof requestedLocale === 'string'
        ? [requestedLocale]
        : (requestedLocale ?? []),
    locales: interviewLocales,
    defaultLocale: 'en',
  });
}

export function resolveInterviewLocale(
  requestedLocale?: RequestedLocale,
  preference?: string | null,
): string {
  return negotiateInterviewLocale(requestedLocale, preference).locale;
}
