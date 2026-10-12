import type { CatalogLoaders } from '@codaco/app-i18n/locales';

/**
 * This package's own message catalogs, one loader per non-source locale of
 * `ecosystemLocales`. Hosts merge these under their own app catalogs
 * (`createCatalogSource(commonCatalogLoaders, frescoUiCatalogLoaders, appLoaders)`)
 * so every `frescoUi.*` id resolves in the active language.
 *
 * English is deliberately absent: every descriptor carries its own
 * `defaultMessage`, so `src/locales/en.json` is an extraction artifact for
 * translators and the freshness guard, never a runtime import.
 *
 * en-GB is an override catalog — only the ids whose British form differs from
 * the source; everything else falls through to the English default.
 */
export const frescoUiCatalogLoaders: CatalogLoaders = {
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
