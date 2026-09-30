import { match } from '@formatjs/intl-localematcher';

import { defaultLocale, isLocale, locales, type Locale } from './locales.ts';

function canonicalizeLocale(value: string) {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

export function negotiateLocale(requested: readonly string[]): Locale {
  const canonical = requested
    .map((entry) => canonicalizeLocale(entry.trim()))
    .filter((entry): entry is string => entry !== undefined);
  const matched = match(canonical, locales, defaultLocale, {
    algorithm: 'best fit',
  });

  return isLocale(matched) ? matched : defaultLocale;
}
