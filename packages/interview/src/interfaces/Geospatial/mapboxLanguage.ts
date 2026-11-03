import { canonicalizeLocaleTag, negotiateLocale } from '@codaco/shared-consts';

/**
 * Languages Mapbox GL JS can put on map labels (`language` option /
 * `map.setLanguage`). Chinese is the only script-tagged pair; Mapbox lists no
 * regional tags.
 * https://docs.mapbox.com/help/dive-deeper/maps-internationalization/
 * (as documented on 2026-10; Mapbox adds languages without a version bump)
 */
const MAP_LANGUAGES: readonly string[] = [
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
];

/**
 * Languages the Search Box API returns results in (`language` on `/suggest`
 * and `/retrieve`). It has no Chinese, Korean or Arabic.
 * https://docs.mapbox.com/api/search/search-box/
 * (as documented on 2026-10)
 */
const SEARCH_LANGUAGES: readonly string[] = [
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
];

const SEARCH_FALLBACK_LANGUAGE = 'en';

/**
 * A tag's language in canonical form (`fil` for both `tl` and `fil`, `he` for
 * `iw`), or `undefined` for a tag that cannot be parsed.
 */
function languageOf(tag: string): string | undefined {
  const canonical = canonicalizeLocaleTag(tag);
  return canonical === undefined
    ? undefined
    : new Intl.Locale(canonical).language;
}

/**
 * The language Mapbox offers that best fits the person's languages, most
 * preferred first, by Network Canvas's one locale negotiation. Only a fit in
 * one of those languages counts: CLDR would otherwise label a map in Dutch for
 * someone who reads Afrikaans, or in Russian for someone who reads
 * Belarusian, so Mapbox's languages are first narrowed to the ones the person
 * listed. A regional or script variant of a listed language still fits
 * (`pt-BR` gets `pt`, `zh-TW` gets `zh-Hant`). `undefined` when Mapbox has
 * none of them.
 */
function ownLanguageFit(
  requested: readonly string[],
  offered: readonly string[],
): string | undefined {
  const own = new Set(requested.map(languageOf));
  return negotiateLocale(
    requested,
    offered.filter((code) => own.has(languageOf(code))),
  );
}

/**
 * The language to label the map in: the participant's interview language,
 * else the next of their browser's languages Mapbox has labels in. With none,
 * `undefined`, and Mapbox shows each label in its place's own language, its
 * documented behaviour for any label without a translation.
 */
export function getMapLanguage(
  requested: readonly string[],
): string | undefined {
  return ownLanguageFit(requested, MAP_LANGUAGES);
}

/**
 * The language to ask place search for: the first of the participant's
 * languages (see `getMapLanguage`) that Search Box has; otherwise English,
 * Search Box's own default, since a search has to be in some language.
 */
export function getSearchLanguage(requested: readonly string[]): string {
  return (
    ownLanguageFit(requested, SEARCH_LANGUAGES) ?? SEARCH_FALLBACK_LANGUAGE
  );
}
