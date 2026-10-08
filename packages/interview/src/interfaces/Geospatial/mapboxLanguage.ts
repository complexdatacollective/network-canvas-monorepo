import { toScriptMatchingTag } from '@codaco/shared-consts';

/**
 * Languages Mapbox GL JS can put on map labels (`language` option /
 * `map.setLanguage`). Chinese is the only script-tagged pair; Mapbox lists no
 * regional tags.
 * https://docs.mapbox.com/help/dive-deeper/maps-internationalization/
 * (as documented on 2026-10; Mapbox adds languages without a version bump)
 */
const MAP_LANGUAGES: ReadonlySet<string> = new Set([
  'ar',
  'bg',
  'bs',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fa',
  'fi',
  'fr',
  'he',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ka',
  'ko',
  'lv',
  'ms',
  'nb',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sq',
  'sr',
  'sv',
  'th',
  'tl',
  'tr',
  'uk',
  'vi',
  'zh-Hans',
  'zh-Hant',
]);

/**
 * Languages the Search Box API returns results in (`language` on `/suggest`
 * and `/retrieve`). It has no Chinese, Korean or Arabic.
 * https://docs.mapbox.com/api/search/search-box/
 * (as documented on 2026-10)
 */
const SEARCH_LANGUAGES: ReadonlySet<string> = new Set([
  'cs',
  'hr',
  'da',
  'nl',
  'en',
  'et',
  'fi',
  'fr',
  'de',
  'el',
  'hu',
  'it',
  'ja',
  'lt',
  'lv',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'es',
  'sv',
  'tr',
  'uk',
]);

const SEARCH_FALLBACK_LANGUAGE = 'en';

/**
 * Where Mapbox spells a language differently from the canonical form
 * `Intl.Locale` gives: it canonicalises both `tl` and `fil` to `fil`, but
 * Mapbox lists Tagalog as `tl`. Every other code on either list (`he`, `id`,
 * `no`, `nb`, ...) is already its own canonical form, so legacy tags such as
 * `iw` and `in` reach it correctly.
 */
const MAPBOX_SPELLING: Readonly<Record<string, string>> = { fil: 'tl' };

/**
 * The code Mapbox would be asked for: Chinese keeps its script (`zh-Hans` or
 * `zh-Hant`, by the same rule protocol locales are matched with), every other
 * tag is cut to its language (`pt-BR` becomes `pt`), because Mapbox documents
 * no regional tags. `undefined` for a tag that cannot be parsed.
 */
function toMapboxCode(tag: string): string | undefined {
  try {
    const { language } = new Intl.Locale(tag);
    return language === 'zh'
      ? toScriptMatchingTag(tag)
      : (MAPBOX_SPELLING[language] ?? language);
  } catch {
    return undefined;
  }
}

/**
 * The language to label the map in, or `undefined` when Mapbox has none for
 * this locale. Mapbox then shows each label in its place's own language, which
 * is its documented behaviour for any label without a translation.
 */
export function getMapLanguage(locale: string): string | undefined {
  const code = toMapboxCode(locale);
  return code !== undefined && MAP_LANGUAGES.has(code) ? code : undefined;
}

/**
 * The language to ask place search for. The protocol language the participant
 * is reading, when Search Box has it; otherwise the interview's interface
 * language, when Search Box has that; otherwise English, Search Box's own
 * default.
 */
export function getSearchLanguage(
  protocolLocale: string,
  interfaceLocale: string,
): string {
  for (const locale of [protocolLocale, interfaceLocale]) {
    const code = toMapboxCode(locale);
    if (code !== undefined && SEARCH_LANGUAGES.has(code)) return code;
  }
  return SEARCH_FALLBACK_LANGUAGE;
}
