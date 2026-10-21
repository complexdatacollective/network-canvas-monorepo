import { match } from '@formatjs/intl-localematcher';

import { toScriptMatchingTag } from '@codaco/shared-consts';

import {
  canonicalizeLocale,
  compareLocaleTags,
  type LocaleTag,
  type LocalizationDeclaration,
} from './localeTag.ts';

export function normalizeLocalePreferences(
  values: readonly string[],
): readonly LocaleTag[] {
  const normalized = new Set<LocaleTag>();
  for (const value of values) {
    const locale = canonicalizeLocale(value);
    if (locale !== undefined) normalized.add(locale);
  }
  return [...normalized];
}

// Quality values have at most three fractional digits. Unknown or repeated
// parameters invalidate the entry rather than silently giving it q=1.
const ACCEPT_LANGUAGE_ENTRY =
  /^[ \t]*([a-z][a-z0-9-]*)[ \t]*(?:;[ \t]*q[ \t]*=[ \t]*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)[ \t]*)?$/i;

/**
 * Parse HTTP language preferences (RFC 9110 sections 12.4.2 and 12.5.4).
 * Return canonical BCP 47 tags in descending quality order, retaining input
 * order for ties and the highest-quality occurrence of duplicate tags.
 * Invalid entries, zero-quality exclusions, and the unspecific wildcard
 * contribute no preference.
 */
export function parseAcceptLanguage(
  header: string | null,
): readonly LocaleTag[] {
  if (header === null) return [];

  const preferences: { tag: string; quality: number }[] = [];
  for (const entry of header.split(',')) {
    const parsed = ACCEPT_LANGUAGE_ENTRY.exec(entry);
    if (!parsed?.[1]) continue;
    const quality = parsed[2] === undefined ? 1 : Number(parsed[2]);
    if (quality === 0) continue;
    preferences.push({ tag: parsed[1], quality });
  }

  return normalizeLocalePreferences(
    preferences.toSorted((a, b) => b.quality - a.quality).map(({ tag }) => tag),
  );
}

// `match` reports "nothing fitted" by returning its default; a sentinel that
// is never a declared tag keeps a miss distinguishable from a real fit.
const NO_FIT = 'no fit';

/**
 * Best-fits one canonical preference against the declared locales, or returns
 * undefined when nothing declared is an acceptable fit.
 *
 * Chinese is matched by script (see `toScriptMatchingTag`) unless the exact
 * tag is declared, so zh-TW and zh-Hant-TW both reach a declared zh-Hant.
 *
 * Between equally good fits the matcher takes the first it is given, so the
 * locales are given sorted by tag: the order they are declared in plays no
 * part.
 */
export function matchLocalePreference(
  preference: LocaleTag,
  declared: readonly LocaleTag[],
): LocaleTag | undefined {
  const matchingTag = declared.includes(preference)
    ? preference
    : toScriptMatchingTag(preference);
  // Best fit can return a tag that is not verbatim in the available list (a
  // requested `he` against a declared `iw` returns `he`).
  const fitted = match(
    [matchingTag],
    declared.toSorted(compareLocaleTags),
    NO_FIT,
    { algorithm: 'best fit' },
  );
  return declared.includes(fitted) ? fitted : undefined;
}

/**
 * Preferences are matched one at a time, in order: best fit over the whole
 * list lets a later exact match beat an earlier regional one, so
 * ['es-MX', 'en'] would select 'en' when 'es' is declared.
 *
 * An explicit participant or researcher choice must be passed as the only
 * requested locale: a malformed or unmatched explicit value then yields the
 * protocol default instead of a lower-priority browser preference.
 *
 * The order the protocol declares its locales in plays no part.
 */
export function selectProtocolLocale(
  requestedLocales: readonly string[],
  localization: LocalizationDeclaration,
): LocaleTag {
  for (const preference of normalizeLocalePreferences(requestedLocales)) {
    const matched = matchLocalePreference(preference, localization.locales);
    if (matched !== undefined) return matched;
  }
  return localization.defaultLocale;
}
