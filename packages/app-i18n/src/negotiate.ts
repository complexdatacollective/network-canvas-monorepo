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

/** 'en-GB-oxendict' → ['en-GB-oxendict', 'en-GB', 'en'] */
const truncationChain = (tag: string): string[] => {
  const chain = [tag];
  let current = tag;
  for (;;) {
    const cut = current.lastIndexOf('-');
    if (cut === -1) break;
    current = current.slice(0, cut);
    chain.push(current);
  }
  return chain;
};

/**
 * A stored preference matches a declared locale when one is a subtag
 * truncation of the other ('es-MX' matches declared 'es'; stored 'es'
 * matches declared 'es-MX'). This is deliberately structural rather than
 * best-fit: the matcher cannot distinguish "best-fits the default" from "no
 * match", and a stored tag that matches nothing must fall through to browser
 * negotiation rather than silently winning as the default.
 */
const matchStored = (
  stored: string,
  declared: readonly string[],
): string | undefined => {
  const canonical = canonicalizeAppLocale(stored);
  if (canonical === undefined) return undefined;
  const declaredSet = new Set(declared);
  for (const candidate of truncationChain(canonical)) {
    if (declaredSet.has(candidate)) return candidate;
  }
  return declared.find((tag) => truncationChain(tag).includes(canonical));
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
