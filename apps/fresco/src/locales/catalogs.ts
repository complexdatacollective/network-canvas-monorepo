import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs, type CatalogMessages } from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import { networkExporterCatalogs } from '@codaco/network-exporters/locales';
import { protocolUtilitiesCatalogs } from '@codaco/protocol-utilities/locales';
import { protocolValidationCatalogs } from '@codaco/protocol-validation/locales';
import enGb from '~/src/locales/en-GB.json';
import es from '~/src/locales/es.json';
import zhHans from '~/src/locales/zh-Hans.json';
import zhHant from '~/src/locales/zh-Hant.json';

export const frescoCatalogs: Readonly<Record<string, CatalogMessages>> = {
  'en': {},
  'en-GB': mergeCatalogs(
    commonCatalogs['en-GB'] ?? {},
    frescoUiCatalogs['en-GB'] ?? {},
    networkExporterCatalogs['en-GB'] ?? {},
    protocolUtilitiesCatalogs['en-GB'] ?? {},
    protocolValidationCatalogs['en-GB'] ?? {},
    enGb,
  ),
  'es': mergeCatalogs(
    commonCatalogs.es ?? {},
    frescoUiCatalogs.es ?? {},
    networkExporterCatalogs.es ?? {},
    protocolUtilitiesCatalogs.es ?? {},
    protocolValidationCatalogs.es ?? {},
    es,
  ),
  'zh-Hans': mergeCatalogs(
    commonCatalogs['zh-Hans'] ?? {},
    frescoUiCatalogs['zh-Hans'] ?? {},
    networkExporterCatalogs['zh-Hans'] ?? {},
    protocolUtilitiesCatalogs['zh-Hans'] ?? {},
    protocolValidationCatalogs['zh-Hans'] ?? {},
    zhHans,
  ),
  'zh-Hant': mergeCatalogs(
    commonCatalogs['zh-Hant'] ?? {},
    frescoUiCatalogs['zh-Hant'] ?? {},
    networkExporterCatalogs['zh-Hant'] ?? {},
    protocolUtilitiesCatalogs['zh-Hant'] ?? {},
    protocolValidationCatalogs['zh-Hant'] ?? {},
    zhHant,
  ),
};
