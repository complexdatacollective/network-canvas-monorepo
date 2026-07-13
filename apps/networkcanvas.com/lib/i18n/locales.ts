import {
  defaultSiteLocale,
  isSiteLocale,
  siteLocales,
  supportedSiteLocales,
  type SiteLocale,
} from '@codaco/shared-consts';

export const supportedLocales = supportedSiteLocales;
export type Locale = SiteLocale;
export const defaultLocale = defaultSiteLocale;
export const locales = siteLocales;
export const isLocale = isSiteLocale;

export const localeCookie = {
  name: 'NEXT_LOCALE',
  maxAge: 31_536_000,
  sameSite: 'lax',
} as const;

export function getLocaleDefinition(locale: Locale) {
  const definition = supportedLocales.find(
    (supportedLocale) => supportedLocale.locale === locale,
  );

  if (!definition) throw new Error(`Unsupported locale: ${locale}`);
  return definition;
}

export function getStaticLocaleParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
