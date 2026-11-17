import { isPseudoLocale } from '@codaco/app-i18n/locales';
import { resolveAppLocale } from '@codaco/app-i18n/negotiate';
import { webStorageLocalePreference } from '@codaco/shared-consts';

import { architectDefaultLocale, architectProductionLocales } from './locales';

export const ARCHITECT_LOCALE_KEY = 'architect.locale';

/** The choice made in Architect's language switcher, kept on this device. */
const preferenceStore = webStorageLocalePreference(
  () => window.localStorage,
  ARCHITECT_LOCALE_KEY,
);

export function readLocalePreference(): string | null {
  try {
    const stored = preferenceStore.read();
    if (stored === null || isPseudoLocale(stored)) return null;
    const resolved = resolveAppLocale({
      stored,
      requested: [],
      locales: architectProductionLocales,
      defaultLocale: architectDefaultLocale,
    });
    return resolved.source === 'chosen' ? resolved.locale : null;
  } catch {
    return null;
  }
}

/** Storage policy failures never prevent changing the language this visit. */
export function writeLocalePreference(locale: string | null): boolean {
  if (isPseudoLocale(locale)) return true;
  return preferenceStore.write(locale);
}

export function resolveDeviceLocale(preference: string | null): string {
  return resolveAppLocale({
    stored: preference,
    requested: typeof navigator === 'undefined' ? [] : navigator.languages,
    locales: architectProductionLocales,
    defaultLocale: architectDefaultLocale,
  }).locale;
}
