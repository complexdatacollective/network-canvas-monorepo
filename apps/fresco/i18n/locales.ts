import { defineAppLocales } from '@codaco/app-i18n/locales';
import type { LocalePreferenceCookie } from '@codaco/shared-consts';

// Deliberately explicit: adding an ecosystem locale cannot advertise an
// untranslated Fresco locale. The catalog guard checks the subset contract.
export const frescoLocales = defineAppLocales([
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
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
] as const);
export type FrescoLocale = (typeof frescoLocales)[number]['locale'];
/** The device mirror of the account's choice in the dashboard's switcher. */
export const localeMirrorCookie = {
  name: 'fresco.locale',
  maxAge: 31_536_000,
} as const satisfies LocalePreferenceCookie;
export const frescoTimeZone = 'UTC';

export function isFrescoLocale(value: unknown): value is FrescoLocale {
  return frescoLocales.some(({ locale }) => locale === value);
}
