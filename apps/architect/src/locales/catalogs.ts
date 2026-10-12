import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  createCatalogSource,
  type CatalogLoaders,
} from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';
import { protocolBuilderCatalogLoaders } from '@codaco/protocol-builder/locales';
import { protocolUtilitiesCatalogLoaders } from '@codaco/protocol-utilities/locales';
import { protocolValidationCatalogLoaders } from '@codaco/protocol-validation/locales';

/** Architect's own catalogs, one loader per translated locale. */
export const architectCatalogLoaders: CatalogLoaders = {
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

/**
 * Every message Architect renders, one language at a time. Each language is
 * its own chunk (see `manualChunks` in vite.config.ts), fetched only when the
 * researcher uses it — and the service worker precaches every chunk, so an
 * installed Architect can still switch language offline.
 */
export const architectCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
  protocolBuilderCatalogLoaders,
  protocolValidationCatalogLoaders,
  protocolUtilitiesCatalogLoaders,
  architectCatalogLoaders,
);
