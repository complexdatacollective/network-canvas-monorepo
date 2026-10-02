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
  {
    locale: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Simplified Chinese',
    compactLabel: 'zh-Hans',
  },
  {
    locale: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Traditional Chinese',
    compactLabel: 'zh-Hant',
  },
  {
    locale: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    compactLabel: 'de',
  },
  {
    locale: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    compactLabel: 'nl',
  },
] as const satisfies readonly SiteLocaleDefinition[];

export type SiteLocale = (typeof supportedSiteLocales)[number]['locale'];

export const defaultSiteLocale: SiteLocale = 'en-US';

export const siteLocales = supportedSiteLocales.map(({ locale }) => locale);

export function isSiteLocale(value: string): value is SiteLocale {
  return supportedSiteLocales.some(({ locale }) => locale === value);
}

/**
 * Best fit weighs region as well as script. A Hong Kong browser typically sends
 * "zh-HK, zh": best fit scores zh-HK against zh-Hant (which implies Taiwan) as a
 * regional mismatch, and the bare "zh" behind it then wins zh-Hans. Chinese is
 * therefore matched by script alone: a Chinese tag becomes `zh-<likely script>`
 * (zh-HK and zh-MO → zh-Hant; zh and zh-SG → zh-Hans). Any other tag, or one
 * Intl cannot parse, is returned as given.
 *
 * It lives in this module because the locale edge function's import map can
 * reach only this file of the package.
 */
export function toScriptMatchingTag(tag: string): string {
  try {
    const locale = new Intl.Locale(tag);
    if (locale.language !== 'zh') return tag;
    const { script } = locale.maximize();
    return script === undefined ? tag : `zh-${script}`;
  } catch {
    return tag;
  }
}
