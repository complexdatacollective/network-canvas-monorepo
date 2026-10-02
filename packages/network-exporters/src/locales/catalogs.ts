import type { CatalogMessages } from '@codaco/app-i18n/locales';

import de from './de.json';
import enGb from './en-GB.json';
import es from './es.json';
import zhHans from './zh-Hans.json';

export const networkExporterCatalogs: Readonly<
  Record<string, CatalogMessages>
> = {
  'en-GB': enGb,
  es,
  'zh-Hans': zhHans,
  de,
};
