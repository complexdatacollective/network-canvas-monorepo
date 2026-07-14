export type SiteLocaleDefinition = {
  locale: string;
  nativeName: string;
  englishName: string;
  compactLabel: string;
};

/** Locales supported by the Network Canvas public sites and locale edge. */
export const supportedSiteLocales = [
  {
    locale: 'en-US',
    nativeName: 'English (United States)',
    englishName: 'English (United States)',
    compactLabel: 'en-US',
  },
  {
    locale: 'en-GB',
    nativeName: 'English (United Kingdom)',
    englishName: 'English (United Kingdom)',
    compactLabel: 'en-GB',
  },
  {
    locale: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    compactLabel: 'es',
  },
] as const satisfies readonly SiteLocaleDefinition[];

export type SiteLocale = (typeof supportedSiteLocales)[number]['locale'];

export const defaultSiteLocale: SiteLocale = 'en-US';

export const siteLocales = supportedSiteLocales.map(({ locale }) => locale);

export function isSiteLocale(value: string): value is SiteLocale {
  return supportedSiteLocales.some(({ locale }) => locale === value);
}
