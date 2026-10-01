import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGB from './en-GB.json';
import es from './es.json';
import zhHans from './zh-Hans.json';
import zhHant from './zh-Hant.json';

export const protocolUtilitiesCatalogs: Readonly<
  Record<string, CatalogMessages>
> = { 'en-GB': enGB, es, 'zh-Hans': zhHans, 'zh-Hant': zhHant };
