import { defineAppLocales } from '@codaco/app-i18n/locales';

// Deliberately explicit: adding an ecosystem locale cannot advertise an
// untranslated Fresco locale. The catalog guard checks the subset contract.
export const frescoLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
] as const);
export type FrescoLocale = (typeof frescoLocales)[number]['locale'];
export const localeMirrorCookie = 'fresco.locale';
export const frescoTimeZone = 'UTC';

export function isFrescoLocale(value: unknown): value is FrescoLocale {
  return frescoLocales.some(({ locale }) => locale === value);
}
