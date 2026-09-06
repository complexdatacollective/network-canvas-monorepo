import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGbOverrides from './en-GB.json';
import es from './es.json';

/**
 * This package's own message catalogs, one entry per non-source locale of
 * `ecosystemLocales`. Hosts merge these under their own app catalogs
 * (`mergeCatalogs(commonCatalogs[locale], frescoUiCatalogs[locale], appCatalog)`)
 * so every `frescoUi.*` id resolves in the active language.
 *
 * English is deliberately absent: every descriptor carries its own
 * `defaultMessage`, so `src/locales/en.json` is an extraction artifact for
 * translators and the freshness guard, never a runtime import.
 *
 * en-GB is an override catalog — only the ids whose British form differs from
 * the source; everything else falls through to the English default.
 */
export const frescoUiCatalogs: Readonly<Record<string, CatalogMessages>> = {
  'en-GB': enGbOverrides as CatalogMessages,
  es,
};
