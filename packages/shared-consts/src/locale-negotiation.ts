import { match } from '@formatjs/intl-localematcher';

/**
 * Network Canvas's one locale negotiation, used wherever a language is chosen
 * from a person's preferences: the interview (from a protocol's languages), the
 * apps' own interfaces, and the website. It is CLDR best fit, as
 * `@formatjs/intl-localematcher` implements it with ICU's defaults, and adds no
 * rules of its own.
 */

/** A BCP 47 tag in canonical form, or undefined for a malformed or empty one. */
export function canonicalizeLocaleTag(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return Intl.getCanonicalLocales(trimmed)[0];
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/**
 * Preferences in canonical form, most preferred first, without malformed
 * entries or repeats.
 */
export function normalizeLocalePreferences(
  values: readonly string[],
): readonly string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const locale = canonicalizeLocaleTag(value);
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
export function parseAcceptLanguage(header: string | null): readonly string[] {
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

// `match` reports "nothing fitted" by returning the default it is given. The
// default must parse as a locale, since the matcher also prefers it among
// equally good fits, so a caller with no default gets this sentinel: a
// well-formed tag nothing offers ("no linguistic content", with a private-use
// subtag).
const NO_FIT = 'zxx-x-nofit';

const compareTags = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The available locale that best fits the requested ones, most preferred
 * first.
 *
 * Each later preference is demoted by a region difference, so an earlier
 * regional fit beats a later exact match (['es-MX', 'en'] gets 'es'), while a
 * later exact match beats an earlier fit in another language (['af', 'en'] gets
 * 'en' rather than 'nl'). Chinese matches by script through likely subtags, so
 * zh-TW and zh-HK reach zh-Hant. A fit in another language is taken only when
 * nothing later is closer (['ca'] alone gets 'es').
 *
 * With a `fallback`, it is the answer when nothing fits and is preferred among
 * equally good fits; without one, nothing fitting gives undefined. The order of
 * `available` plays no part. Malformed preferences are skipped.
 */
export function negotiateLocale<T extends string>(
  requested: readonly string[],
  available: readonly T[],
  fallback: T,
): T;
export function negotiateLocale<T extends string>(
  requested: readonly string[],
  available: readonly T[],
): T | undefined;
export function negotiateLocale<T extends string>(
  requested: readonly string[],
  available: readonly T[],
  fallback?: T,
): T | undefined {
  const preferences = normalizeLocalePreferences(requested);
  if (preferences.length === 0 || available.length === 0) return fallback;
  const fitted = match(
    preferences,
    available.toSorted(compareTags),
    fallback ?? NO_FIT,
    { algorithm: 'best fit' },
  );
  // The matcher can hand back a tag it was given rather than one on offer;
  // only an offered tag is a fit.
  return available.find((locale) => locale === fitted) ?? fallback;
}

/** What decided a locale: a person's choice, their requested list, or neither. */
export type LocaleSource = 'chosen' | 'negotiated' | 'default';

export type ResolvedLocale<T extends string> = Readonly<{
  locale: T;
  source: LocaleSource;
}>;

/**
 * The language a person sees, in every app, site and interview: their choice
 * in this scope first, then the best fit for their requested languages, then
 * the fallback.
 *
 * A choice is matched on its own, so it survives the scope no longer offering
 * the exact tag it was made in ('en-US' lands on an offered 'en-GB'). A choice
 * that fits nothing offered is ignored. `source` is 'negotiated' whenever a
 * requested language was well formed, even when the fallback is the answer.
 */
export function resolveLocale<T extends string>(input: {
  chosen?: string | null;
  requested: readonly string[];
  available: readonly T[];
  fallback: T;
}): ResolvedLocale<T> {
  if (input.chosen != null) {
    const chosen = negotiateLocale([input.chosen], input.available);
    if (chosen !== undefined) return { locale: chosen, source: 'chosen' };
  }
  if (normalizeLocalePreferences(input.requested).length === 0) {
    return { locale: input.fallback, source: 'default' };
  }
  return {
    locale: negotiateLocale(input.requested, input.available, input.fallback),
    source: 'negotiated',
  };
}
