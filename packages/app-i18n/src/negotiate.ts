import {
  canonicalizeLocaleTag,
  resolveLocale,
  type ResolvedLocale,
} from '@codaco/shared-consts';

import type { AppLocale } from './locales.ts';

/** Canonicalizes a BCP 47 tag; undefined for malformed or empty input. */
export function canonicalizeAppLocale(value: string): string | undefined {
  return canonicalizeLocaleTag(value);
}

export type ResolvedAppLocale = ResolvedLocale<string>;

/**
 * An app's locale (see `resolveLocale`): the choice kept for the app, then
 * the best fit for the requested (browser or header) languages, then the
 * default. The result is always a declared locale.
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
  return resolveLocale({
    chosen: input.stored,
    requested: input.requested,
    available: declared,
    fallback: input.defaultLocale,
  });
}
