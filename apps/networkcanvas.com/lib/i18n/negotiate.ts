import {
  negotiateLocale as negotiate,
  resolveLocale,
} from '@codaco/shared-consts';

import { defaultLocale, locales, type Locale } from './locales.ts';

/** The site language for a visitor's preferences (see `negotiateLocale`). */
export function negotiateLocale(requested: readonly string[]): Locale {
  return negotiate(requested, locales, defaultLocale);
}

/**
 * The site language for a visitor: the one they chose in the site's language
 * switcher, then the best fit for their browser's languages (see
 * `resolveLocale`).
 */
export function resolveSiteLocale(
  chosen: string | null | undefined,
  requested: readonly string[],
): Locale {
  return resolveLocale({
    chosen,
    requested,
    available: locales,
    fallback: defaultLocale,
  }).locale;
}
