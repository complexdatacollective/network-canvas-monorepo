import {
  defaultSiteLocale,
  isSiteLocale,
  siteLocalePreferenceCookie,
  siteLocales,
  supportedSiteLocales,
  type SiteLocale,
} from '@codaco/shared-consts';

export const supportedLocales = supportedSiteLocales;
export type Locale = SiteLocale;
export const defaultLocale = defaultSiteLocale;
export const locales = siteLocales;
export const isLocale = isSiteLocale;

/** The language chosen on any Network Canvas website (see `siteLocalePreferenceCookie`). */
export const localeCookie = {
  ...siteLocalePreferenceCookie,
  sameSite: 'lax',
} as const;

export function getStaticLocaleParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
