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
