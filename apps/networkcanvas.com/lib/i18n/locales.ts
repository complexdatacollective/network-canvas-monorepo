export const locales = ['en-US', 'en-GB', 'es'] as const;

export type Locale = (typeof locales)[number];

export function getStaticLocaleParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
