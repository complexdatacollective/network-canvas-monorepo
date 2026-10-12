import type { CatalogLoaders } from '@codaco/app-i18n/locales';

export const networkExporterCatalogLoaders: CatalogLoaders = {
  'en-GB': () => import('./en-GB.json'),
  'es': () => import('./es.json'),
  'zh-Hans': () => import('./zh-Hans.json'),
  'zh-Hant': () => import('./zh-Hant.json'),
  'de': () => import('./de.json'),
  'nl': () => import('./nl.json'),
  'pt-BR': () => import('./pt-BR.json'),
  'it': () => import('./it.json'),
  'fr': () => import('./fr.json'),
};
