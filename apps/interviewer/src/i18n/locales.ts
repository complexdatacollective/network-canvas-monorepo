import { defineAppLocales, pseudoAppLocale } from '@codaco/app-i18n/locales';
import type { AppLocale } from '@codaco/app-i18n/locales';

// A production locale is advertised only when this app ships its full catalog.
export const interviewerProductionLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
]);

export const interviewerLocales: readonly AppLocale[] = import.meta.env.DEV
  ? [...interviewerProductionLocales, pseudoAppLocale]
  : interviewerProductionLocales;

export const interviewerDefaultLocale = 'en';
