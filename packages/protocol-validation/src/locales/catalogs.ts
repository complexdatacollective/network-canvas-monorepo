import type { CatalogMessages } from '@codaco/app-i18n/locales';

import de from './de.json';
import enGB from './en-GB.json';
import es from './es.json';
import nl from './nl.json';
import ptBR from './pt-BR.json';
import zhHans from './zh-Hans.json';
import zhHant from './zh-Hant.json';

export const protocolValidationCatalogs: Readonly<
  Record<string, CatalogMessages>
> = {
  'en-GB': enGB,
  es,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  de,
  nl,
  'pt-BR': ptBR,
};
