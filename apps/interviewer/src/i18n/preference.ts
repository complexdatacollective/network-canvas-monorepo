import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';

import {
  interviewerDefaultLocale,
  interviewerProductionLocales,
} from './locales';

export const LOCALE_PREFERENCE_KEY = 'interviewer.locale';

export function browserLanguages(): readonly string[] {
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
}

export function readPreference(): string | null {
  try {
    const stored = localStorage.getItem(LOCALE_PREFERENCE_KEY);
    if (stored === null || stored === PSEUDO_LOCALE) return null;
    const result = resolveAppLocale({
      stored,
      requested: [],
      locales: interviewerProductionLocales,
      defaultLocale: interviewerDefaultLocale,
    });
    return result.source === 'stored' ? result.locale : null;
  } catch {
    return null;
  }
}

/**
 * The production locale a stored preference and the browser's languages
 * resolve to. The provider negotiates through this on every render, and the
 * startup code that runs before React mounts through `startupLocale`, so the
 * language the loading screen announces and loads first is the one React then
 * renders.
 */
export function negotiateLocale(
  stored: string | null,
  requested: readonly string[],
): string {
  return resolveAppLocale({
    stored,
    requested,
    locales: interviewerProductionLocales,
    defaultLocale: interviewerDefaultLocale,
  }).locale;
}

/** The locale this device starts in, read the way the provider first reads it. */
export function startupLocale(): string {
  return negotiateLocale(readPreference(), browserLanguages());
}
