import { match } from '@formatjs/intl-localematcher';

import { toScriptMatchingTag } from '@codaco/shared-consts';

import type { AppLocale } from './locales.ts';

/** Canonicalizes a BCP 47 tag; undefined for malformed or empty input. */
export function canonicalizeAppLocale(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return Intl.getCanonicalLocales(trimmed)[0];
  } catch {
    return undefined;
  }
}

/**
 * Chinese tags are matched by script (see `toScriptMatchingTag`), unless the
 * registry declares the exact tag.
 */
const forMatching = (canonical: string, declared: readonly string[]): string =>
  declared.includes(canonical) ? canonical : toScriptMatchingTag(canonical);

/**
 * A default `match` can hand back that no registry could ever contain:
 * `defineAppLocales` admits only canonical BCP 47 tags, and this is not one.
 */
const NO_FIT = 'no fit';

/**
 * One preference — a stored choice or a single browser/header entry — is
 * matched against the declared locales on its own, with best fit, so an
 * explicit choice survives the app dropping the exact tag it was made in
 * ('en-US' lands on a declared 'en-GB', which shares nothing with it by
 * truncation).
 *
 * Preferences are never handed to `match` as a list: best fit over a whole list
 * lets a later exact match beat an earlier regional one, so ['es-MX', 'en']
 * would resolve to 'en' when 'es' is declared. Matching one tag at a time
 * keeps the first acceptable preference winning.
 *
 * The sentinel default is what keeps a missed fit from passing as a hit.
 * `match` signals "nothing fitted" by returning the default it was given, so
 * passing the app default here would make a real fit indistinguishable from a
 * fallback — and a stored tag for a locale that has since been withdrawn has
 * to fall through to browser negotiation rather than silently winning as the
 * default.
 */
const matchPreference = (
  matchingTag: string,
  declared: readonly string[],
): string | undefined => {
  const fitted = match([matchingTag], [...declared], NO_FIT, {
    algorithm: 'best fit',
  });
  return declared.includes(fitted) ? fitted : undefined;
};

export type ResolvedAppLocale = Readonly<{
  locale: string;
  source: 'stored' | 'negotiated' | 'default';
}>;

/**
 * The app locale negotiation chain: stored preference → requested
 * (browser/header) preferences, in order, each best-fit on its own → default.
 * The result is always a declared locale; the helper fails closed to
 * `defaultLocale`. `source` is 'negotiated' whenever a non-empty requested
 * list decided (even when no preference fits and `defaultLocale` is
 * returned, or when the fit is the default locale itself).
 */
export function resolveAppLocale(input: {
  stored?: string | null;
  requested: readonly string[];
  locales: readonly AppLocale[];
  defaultLocale: string;
}): ResolvedAppLocale {
  const declared = input.locales.map((entry) => entry.locale);
  if (!declared.includes(input.defaultLocale)) {
    throw new Error(
      `resolveAppLocale: defaultLocale "${input.defaultLocale}" is not in the registry`,
    );
  }

  if (input.stored != null) {
    const canonical = canonicalizeAppLocale(input.stored);
    const stored =
      canonical === undefined
        ? undefined
        : matchPreference(forMatching(canonical, declared), declared);
    if (stored !== undefined) return { locale: stored, source: 'stored' };
  }

  const requested = new Set<string>();
  for (const value of input.requested) {
    const canonical = canonicalizeAppLocale(value);
    if (canonical !== undefined) {
      requested.add(forMatching(canonical, declared));
    }
  }

  if (requested.size === 0) {
    return { locale: input.defaultLocale, source: 'default' };
  }

  for (const tag of requested) {
    const negotiated = matchPreference(tag, declared);
    if (negotiated !== undefined) {
      return { locale: negotiated, source: 'negotiated' };
    }
  }
  return { locale: input.defaultLocale, source: 'negotiated' };
}
