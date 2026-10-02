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
  { locale: 'zh-Hans', label: '简体中文', direction: 'ltr' },
  { locale: 'zh-Hant', label: '繁體中文', direction: 'ltr' },
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'nl', label: 'Nederlands', direction: 'ltr' },
  { locale: 'pt-BR', label: 'Português (Brasil)', direction: 'ltr' },
]);

export const architectLocales: readonly AppLocale[] = import.meta.env.DEV
  ? [...architectProductionLocales, pseudoAppLocale]
  : architectProductionLocales;

export const architectDefaultLocale = 'en';
