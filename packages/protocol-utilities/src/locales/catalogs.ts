import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGB from './en-GB.json';
import es from './es.json';

export const protocolUtilitiesCatalogs: Readonly<
  Record<string, CatalogMessages>
> = { 'en-GB': enGB, es };
