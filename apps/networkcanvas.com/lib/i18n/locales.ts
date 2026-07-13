type LocaleDefinition = {
  locale: string;
  nativeName: string;
  englishName: string;
  compactLabel: string;
};

export const supportedLocales = [
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
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof supportedLocales)[number]['locale'];

export const defaultLocale: Locale = 'en-US';
export const localeCookie = {
  name: 'NEXT_LOCALE',
  maxAge: 31_536_000,
  sameSite: 'lax',
} as const;
export const locales = supportedLocales.map(({ locale }) => locale);

export function isLocale(value: string): value is Locale {
  return supportedLocales.some(({ locale }) => locale === value);
}

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
