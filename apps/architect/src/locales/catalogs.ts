import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs, type CatalogMessages } from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import { protocolBuilderCatalogs } from '@codaco/protocol-builder/locales';
import { protocolUtilitiesCatalogs } from '@codaco/protocol-utilities/locales';
import { protocolValidationCatalogs } from '@codaco/protocol-validation/locales';

import enGb from './en-GB.json';
import es from './es.json';

/** Static imports include every production locale in installed/offline builds. */
export const architectCatalogs: Readonly<
  Record<string, CatalogMessages | undefined>
> = {
  'en-GB': mergeCatalogs(
    commonCatalogs['en-GB'] ?? {},
    frescoUiCatalogs['en-GB'] ?? {},
    protocolBuilderCatalogs['en-GB'] ?? {},
    protocolValidationCatalogs['en-GB'] ?? {},
    protocolUtilitiesCatalogs['en-GB'] ?? {},
    enGb,
  ),
  'es': mergeCatalogs(
    commonCatalogs.es ?? {},
    frescoUiCatalogs.es ?? {},
    protocolBuilderCatalogs.es ?? {},
    protocolValidationCatalogs.es ?? {},
    protocolUtilitiesCatalogs.es ?? {},
    es,
  ),
};
