import {
  defineAppLocales,
  pseudoAppLocale,
  type AppLocale,
} from '@codaco/app-i18n/locales';

/** App chrome locales; protocol content and preview language are independent. */
export const architectProductionLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
]);

export const architectLocales: readonly AppLocale[] = import.meta.env.DEV
  ? [...architectProductionLocales, pseudoAppLocale]
  : architectProductionLocales;

export const architectDefaultLocale = 'en';
