import type { CatalogMessages } from '@codaco/app-i18n/locales';

import de from './de.json';
import enGb from './en-GB.json';
import es from './es.json';
import fr from './fr.json';
import it from './it.json';
import nl from './nl.json';
import ptBR from './pt-BR.json';
import zhHans from './zh-Hans.json';
import zhHant from './zh-Hant.json';

/** Built-in interface messages only; protocol-authored copy is never cataloged. */
export const interviewCatalogs: Readonly<Record<string, CatalogMessages>> = {
  'en-GB': enGb,
  es,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  de,
  nl,
  'pt-BR': ptBR,
  it,
  fr,
};
