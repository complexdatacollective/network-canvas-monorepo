/**
 * The Discourse locale codes of the languages the Network Canvas sites are
 * translated into, each mapped to the site locale the shared header shows for
 * it. Any other forum language gets the header in US English.
 *
 * The build reads this table too, to write the theme's translations, and a
 * test holds its values to `siteLocales` in @codaco/shared-consts.
 */
export const SITE_LOCALES = {
  en: 'en-US',
  en_GB: 'en-GB',
  es: 'es',
  zh_CN: 'zh-Hans',
  zh_TW: 'zh-Hant',
  de: 'de',
  nl: 'nl',
  pt_BR: 'pt-BR',
  it: 'it',
  fr: 'fr',
  ar: 'ar',
};

const DEFAULT_SITE_LOCALE = 'en-US';

export function siteLocaleFor(discourseLocale) {
  return Object.hasOwn(SITE_LOCALES, discourseLocale)
    ? SITE_LOCALES[discourseLocale]
    : DEFAULT_SITE_LOCALE;
}
