import { SUPPLIED_LANGUAGES } from '@codaco/protocol-validation';

import ar from '../locales/added/ar.json' with { type: 'json' };
import de from '../locales/added/de.json' with { type: 'json' };
import en from '../locales/added/en.json' with { type: 'json' };
import es from '../locales/added/es.json' with { type: 'json' };
import fr from '../locales/added/fr.json' with { type: 'json' };
import it from '../locales/added/it.json' with { type: 'json' };
import nl from '../locales/added/nl.json' with { type: 'json' };
import ptBR from '../locales/added/pt-BR.json' with { type: 'json' };
import zhHans from '../locales/added/zh-Hans.json' with { type: 'json' };
import zhHant from '../locales/added/zh-Hant.json' with { type: 'json' };

/**
 * A catalogue for each language Network Canvas supplies wording in: the
 * messages a correction added (see `addedTextIds.ts`), by id.
 */
export type AddedTextCatalogues = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

// One catalogue for each supplied language, English included, as for the
// wording a protocol may reword (see `suppliedWording.ts`, which also says
// why they sit one folder below `locales` and are imported statically).
// English is written by `pnpm i18n:extract`. No correction has added text
// yet, so each is empty.

/** The interview's catalogues of the text corrections have added. */
export const ADDED_TEXT: AddedTextCatalogues = {
  en,
  ar,
  de,
  es,
  fr,
  it,
  nl,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

/**
 * Network Canvas's wording for each message `catalogues` hold, by message id
 * and then by the language it is written in: what `resolveAddedText` reads.
 */
export const addedTextById = (
  catalogues: AddedTextCatalogues,
): ReadonlyMap<string, Readonly<Record<string, string>>> => {
  const byId = new Map<string, Record<string, string>>();
  for (const language of SUPPLIED_LANGUAGES) {
    for (const [id, text] of Object.entries(catalogues[language] ?? {})) {
      byId.set(id, { ...byId.get(id), [language]: text });
    }
  }
  return byId;
};
