import type { CatalogMessages } from '@codaco/app-i18n/locales';

import de from './de.json';
import enGB from './en-GB.json';
import es from './es.json';
import zhHans from './zh-Hans.json';

export const protocolValidationCatalogs: Readonly<
  Record<string, CatalogMessages>
> = { 'en-GB': enGB, es, 'zh-Hans': zhHans, de };
