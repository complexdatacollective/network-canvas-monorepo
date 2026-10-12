import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import { createCatalogSource } from '@codaco/app-i18n/locales';
import type { CatalogLoaders } from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';
import { networkExporterCatalogLoaders } from '@codaco/network-exporters/locales';
import { protocolUtilitiesCatalogLoaders } from '@codaco/protocol-utilities/locales';
import { protocolValidationCatalogLoaders } from '@codaco/protocol-validation/locales';

// English renders descriptor defaults; en.json is the extraction artifact,
// not a runtime input.
export const interviewerCatalogLoaders: CatalogLoaders = {
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

// Every language is its own chunk (vite.config.ts groups each tag's catalogs
// from all of these packages into one), so a device downloads and parses only
// the language it shows. The precache still holds every chunk, which is what
// lets a device that has never chosen Spanish switch to it offline.
export const interviewerCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
  networkExporterCatalogLoaders,
  protocolValidationCatalogLoaders,
  protocolUtilitiesCatalogLoaders,
  interviewerCatalogLoaders,
);
