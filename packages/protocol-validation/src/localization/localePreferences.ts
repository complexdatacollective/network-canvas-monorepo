import { match } from '@formatjs/intl-localematcher';

import {
  canonicalizeLocale,
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

/**
 * An explicit participant or researcher choice must be passed as the only
 * requested locale: a malformed or unmatched explicit value then yields the
 * protocol default instead of a lower-priority browser preference.
 */
export function selectProtocolLocale(
  requestedLocales: readonly string[],
  localization: LocalizationDeclaration,
): LocaleTag {
  const requested = normalizeLocalePreferences(requestedLocales);
  if (requested.length === 0) return localization.defaultLocale;

  // Best fit can return a tag that is not verbatim in the available list (a
  // requested `he` against a declared `iw` returns `he`).
  const matched = match(
    requested,
    localization.locales,
    localization.defaultLocale,
    { algorithm: 'best fit' },
  );
  return localization.locales.includes(matched)
    ? matched
    : localization.defaultLocale;
}
