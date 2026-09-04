import { match } from '@formatjs/intl-localematcher';

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
 * A default `match` can hand back that no registry could ever contain:
 * `defineAppLocales` admits only canonical BCP 47 tags, and this is not one.
 */
const NO_FIT = 'no fit';

/**
 * A stored preference is matched the same way browser preferences are, with
 * best fit — so an explicit choice survives the app dropping the exact tag it
 * was made in ('en-US' lands on a declared 'en-GB', which shares nothing with
 * it by truncation).
 *
 * The sentinel default is what keeps that from swallowing the other case.
 * `match` signals "nothing fitted" by returning the default it was given, so
 * passing the app default here would make a real fit indistinguishable from a
 * fallback — and a stored tag for a locale that has since been withdrawn has
 * to fall through to browser negotiation rather than silently winning as the
 * default.
 */
const matchStored = (
  stored: string,
  declared: readonly string[],
): string | undefined => {
  const canonical = canonicalizeAppLocale(stored);
  if (canonical === undefined) return undefined;
  const fitted = match([canonical], [...declared], NO_FIT, {
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
 * (browser/header) best-fit → default. The result is always a declared
 * locale; the helper fails closed to `defaultLocale`. `source` is
 * 'negotiated' whenever a non-empty requested list decided (even when the
 * best fit is the default locale).
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
    const stored = matchStored(input.stored, declared);
    if (stored !== undefined) return { locale: stored, source: 'stored' };
  }

  const requested: string[] = [];
  for (const value of input.requested) {
    const canonical = canonicalizeAppLocale(value);
    if (canonical !== undefined && !requested.includes(canonical)) {
      requested.push(canonical);
    }
  }

  if (requested.length > 0) {
    const negotiated = match(requested, declared, input.defaultLocale, {
      algorithm: 'best fit',
    });
    return {
      locale: declared.includes(negotiated) ? negotiated : input.defaultLocale,
      source: 'negotiated',
    };
  }

  return { locale: input.defaultLocale, source: 'default' };
}
