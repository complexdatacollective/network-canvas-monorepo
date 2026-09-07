import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGb from './en-GB.json';
import es from './es.json';

export const networkExporterCatalogs: Readonly<
  Record<string, CatalogMessages>
> = {
  'en-GB': enGb,
  es,
};
