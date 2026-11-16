// The locale edge functions' import maps reach only this file of the
// package, and they choose the site's language, so the one locale system is
// re-exported here for them.
export * from './locale-negotiation.ts';
export * from './locale-preference.ts';

import type { LocalePreferenceCookie } from './locale-preference.ts';

/**
 * The language chosen on any Network Canvas website (networkcanvas.com, the
 * protocol gallery, the documentation, Sketch): one choice for them all, kept
 * for the whole networkcanvas.com domain.
 */
export const siteLocalePreferenceCookie = {
  name: 'NEXT_LOCALE',
  maxAge: 31_536_000,
  domain: 'networkcanvas.com',
} as const satisfies LocalePreferenceCookie;

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
  {
    locale: 'pt-BR',
    nativeName: 'Português (Brasil)',
    englishName: 'Portuguese (Brazil)',
    compactLabel: 'pt-BR',
  },
  {
    locale: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    compactLabel: 'it',
  },
  {
    locale: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    compactLabel: 'fr',
  },
  {
    locale: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    compactLabel: 'ar',
  },
] as const satisfies readonly SiteLocaleDefinition[];

export type SiteLocale = (typeof supportedSiteLocales)[number]['locale'];

export const defaultSiteLocale: SiteLocale = 'en-US';

export const siteLocales = supportedSiteLocales.map(({ locale }) => locale);

export function isSiteLocale(value: string): value is SiteLocale {
  return supportedSiteLocales.some(({ locale }) => locale === value);
}

/**
 * A Chinese tag as `zh-<likely script>` (zh-HK and zh-MO → zh-Hant; zh and
 * zh-SG → zh-Hans), for matching Chinese by script alone. Any other tag, or
 * one Intl cannot parse, is returned as given.
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
