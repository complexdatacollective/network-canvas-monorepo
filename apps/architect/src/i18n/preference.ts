import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';

import { architectDefaultLocale, architectProductionLocales } from './locales';

export const ARCHITECT_LOCALE_KEY = 'architect.locale';

export function readLocalePreference(): string | null {
  try {
    const stored = window.localStorage.getItem(ARCHITECT_LOCALE_KEY);
    if (stored === null || stored === PSEUDO_LOCALE) return null;
    const resolved = resolveAppLocale({
      stored,
      requested: [],
      locales: architectProductionLocales,
      defaultLocale: architectDefaultLocale,
    });
    return resolved.source === 'stored' ? resolved.locale : null;
  } catch {
    return null;
  }
}

/** Storage policy failures never prevent changing the language this visit. */
export function writeLocalePreference(locale: string | null): boolean {
  if (locale === PSEUDO_LOCALE) return true;
  try {
    if (locale === null) window.localStorage.removeItem(ARCHITECT_LOCALE_KEY);
    else window.localStorage.setItem(ARCHITECT_LOCALE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export function resolveDeviceLocale(preference: string | null): string {
  return resolveAppLocale({
    stored: preference,
    requested: typeof navigator === 'undefined' ? [] : navigator.languages,
    locales: architectProductionLocales,
    defaultLocale: architectDefaultLocale,
  }).locale;
}
