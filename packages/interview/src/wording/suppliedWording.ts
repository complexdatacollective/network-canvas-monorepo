import {
  suppliedWordingFrom,
  type SuppliedWordingCatalogues,
} from '@codaco/protocol-validation';

import ar from '../locales/wording/ar.json' with { type: 'json' };
import de from '../locales/wording/de.json' with { type: 'json' };
import enGB from '../locales/wording/en-GB.json' with { type: 'json' };
import en from '../locales/wording/en.json' with { type: 'json' };
import es from '../locales/wording/es.json' with { type: 'json' };
import fr from '../locales/wording/fr.json' with { type: 'json' };
import it from '../locales/wording/it.json' with { type: 'json' };
import nl from '../locales/wording/nl.json' with { type: 'json' };
import ptBR from '../locales/wording/pt-BR.json' with { type: 'json' };
import zhHans from '../locales/wording/zh-Hans.json' with { type: 'json' };
import zhHant from '../locales/wording/zh-Hant.json' with { type: 'json' };

// The wording Network Canvas supplies for a schema 9 protocol is the
// interview's own: each text a protocol may reword is one of the interview's
// messages, written in English where it is declared and translated into each
// other language Network Canvas supplies. `locales/wording` holds one
// catalogue for each of those languages, English included. A protocol holds a
// text only where its author reworded it, and the interview shows these words
// for the rest.
//
// The English catalogue is written by `pnpm i18n:extract` from the messages
// as they are declared, and a test holds it to them. The interview does not
// read `locales/en.json` for it: that file is extraction data, which carries
// a description for every message.
//
// The catalogues sit one folder below `locales` because a file directly
// inside it is, by `@codaco/app-i18n`'s convention, one a build may take for
// an app's own interface: a translation is compiled into parsed messages,
// and Fresco's build turns every such file into a JavaScript module. This
// wording is text a protocol holds, shows and is compared with as it is
// written, so it must reach every consumer as text.
//
// The catalogues are imported statically, so the wording is there before the
// first screen and offline. They carry a `with { type: 'json' }` attribute
// because Node's own loader runs this module as it is (Studio's server reads
// the wording to store a protocol). The cost is the one `@codaco/app-i18n`
// records beside its own catalogues: Storybook's Next.js builder cannot load
// a module with the attribute, so no story of a Next.js app may reach this
// one.

/**
 * The interview's catalogue for each language Network Canvas supplies wording
 * in, and for British English, which holds only the texts whose spelling
 * differs.
 */
export const SUPPLIED_WORDING: SuppliedWordingCatalogues = {
  en,
  'en-GB': enGB,
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
 * What is read of a protocol against Network Canvas's wording
 * (`suppliedWordingFrom`), bound to the interview's catalogues: the wording
 * of a stage setting or an interface text, the text the interview shows for
 * it, and a stage, an interface text and a protocol as they are stored (only
 * what the author reworded) and with the wording they show written out.
 */
export const {
  suppliedStageText,
  stageWordingShown,
  stageWithoutSuppliedText,
  stageWithSuppliedText,
  suppliedInterfaceText,
  interfaceTextShown,
  interfaceTextShownBy,
  interfaceTextAsShown,
  withInterfaceText,
  interfaceTextWithUpdates,
  withoutSuppliedWording,
  withSuppliedWording,
  suppliedWordingIn,
  familyPedigreeWordingIn,
} = suppliedWordingFrom(SUPPLIED_WORDING);
