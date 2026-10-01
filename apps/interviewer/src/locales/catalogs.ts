import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs } from '@codaco/app-i18n/locales';
import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import { networkExporterCatalogs } from '@codaco/network-exporters/locales';
import { protocolUtilitiesCatalogs } from '@codaco/protocol-utilities/locales';
import { protocolValidationCatalogs } from '@codaco/protocol-validation/locales';

import de from './de.json';
import enGb from './en-GB.json';
import es from './es.json';
import zhHans from './zh-Hans.json';

// Static imports ship every language in the precached app, including on a
// device that has never chosen Spanish before going offline. English renders
// descriptor defaults; en.json is the extraction artifact, not a runtime input.
export const interviewerCatalogs: Readonly<
  Record<string, CatalogMessages | undefined>
> = {
  'en-GB': mergeCatalogs(
    commonCatalogs['en-GB'] ?? {},
    frescoUiCatalogs['en-GB'] ?? {},
    networkExporterCatalogs['en-GB'] ?? {},
    protocolValidationCatalogs['en-GB'] ?? {},
    protocolUtilitiesCatalogs['en-GB'] ?? {},
    enGb,
  ),
  'es': mergeCatalogs(
    commonCatalogs.es ?? {},
    frescoUiCatalogs.es ?? {},
    networkExporterCatalogs.es ?? {},
    protocolValidationCatalogs.es ?? {},
    protocolUtilitiesCatalogs.es ?? {},
    es,
  ),
  'zh-Hans': mergeCatalogs(
    commonCatalogs['zh-Hans'] ?? {},
    frescoUiCatalogs['zh-Hans'] ?? {},
    networkExporterCatalogs['zh-Hans'] ?? {},
    protocolValidationCatalogs['zh-Hans'] ?? {},
    protocolUtilitiesCatalogs['zh-Hans'] ?? {},
    zhHans,
  ),
  'de': mergeCatalogs(
    commonCatalogs.de ?? {},
    frescoUiCatalogs.de ?? {},
    networkExporterCatalogs.de ?? {},
    protocolValidationCatalogs.de ?? {},
    protocolUtilitiesCatalogs.de ?? {},
    de,
  ),
};
