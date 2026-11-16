import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  type AppLocale,
  createCatalogSource,
  defineAppLocales,
} from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';
import type { SiteLocale } from '@codaco/shared-consts';

import type { Locale } from './locales';

/** The documentation's languages, as the shared language switcher lists them. */
export const documentationAppLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
] as const satisfies readonly (AppLocale & { locale: Locale })[]);

/**
 * The writing direction of a documentation language, for `<html dir>`. Every
 * language offered today is left to right; a right-to-left one needs only its
 * entry above, since the layout is written against the reading direction.
 */
export function getLocaleDirection(locale: Locale): 'ltr' | 'rtl' {
  return (
    documentationAppLocales.find((entry) => entry.locale === locale)
      ?.direction ?? 'ltr'
  );
}

/**
 * Each documentation language as the Network Canvas websites name it. The
 * shared navigation takes these, and the switcher stores them in the language
 * cookie every website reads, so a choice made here carries to the others.
 */
export const siteLocaleByDocumentationLocale = {
  en: 'en-US',
  es: 'es',
  fr: 'fr',
} as const satisfies Record<Locale, SiteLocale>;

/**
 * The shared-package messages the documentation renders (common, then
 * fresco-ui), for the language switcher. Only the server loads from it: the
 * locale layout hands its locale's catalog to the client provider.
 */
export const documentationAppCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
);
